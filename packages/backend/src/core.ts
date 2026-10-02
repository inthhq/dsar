/**
 * The package's entry point: `dsarInstance(options).handler(request)`.
 *
 * Web `Request` in, web `Response` out, so an instance mounts in a Next.js
 * route handler, a Node or Bun server, or a gateway that routes many projects
 * to many instances. There is no DSAR server process to run.
 *
 * ## Serverless
 *
 * Nothing here needs a long-lived process. Webhook retries are durable rows,
 * so a scheduled job (Vercel Cron, a queue consumer) can call
 * {@link DsarInstance.runWebhookRetries} to drain the due ones. A long-lived
 * server can pass `runWebhookRetryWorker: true` instead, and calls
 * {@link DsarInstance.dispose} on shutdown.
 *
 * ## Tenants
 *
 * `tenantId` binds an instance to one tenant, the way `@c15t/backend` binds
 * one instance to one project. Credentials that name another tenant are
 * refused, credentials that name none act for this tenant, and inbound
 * adapters cannot capture into another tenant. Without `tenantId`, each
 * request's tenant comes from its verified identity, as before.
 */
import { PolicyPacksLive } from "@dsar/policy-packs";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as OpenApi from "effect/http-api/OpenApi";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

import { makeDsarHttpApi, renderDocsHtml } from "./http-api";
import { createApp } from "./http/app";
import type { RouteDispatchInput } from "./http/app";
import {
	buildRuntimeServices,
	makeAdapterModule,
	makeCoreModule,
} from "./layers";
import { resolveRequestContext } from "./middleware/auth-context";
import { normalizeBasePath } from "./middleware/base-path";
import { toErrorResponse } from "./middleware/errors";
import { enforceIntakeIpRateLimit } from "./rate-limit";
import { coreRoutes } from "./routes";
import type { RouteDefinition } from "./routes/types";
import {
	deliverDueWebhookRetries,
	runWebhookRetryWorker,
} from "./services/notifications/retry";
import { backendErrorCatalogByCode } from "./types/error-codes";
import { InternalRuntimeError } from "./types/errors";
import type {
	DsarInstanceOptions,
	RuntimeAdapters,
	RuntimeConfig,
	RuntimeRepos,
	RuntimeRequestContext,
} from "./types/runtime";
import { RuntimeServicesTag } from "./types/runtime";

/**
 * Mountable DSAR backend runtime exposing a fetch-compatible handler, router
 * metadata, and resolved dependency context.
 */
export interface DsarInstance {
	/**
	 * Fetch-compatible request handler for mounting in any host runtime.
	 *
	 * @example
	 * ```ts
	 * export const POST = (request: Request) => instance.handler(request);
	 * ```
	 */
	readonly handler: (request: Request) => Promise<Response>;
	/**
	 * Delivers outbound webhook retries that are due now, then resolves.
	 *
	 * For serverless hosts: call it from a scheduled job. Claims make it safe
	 * to run from several places at once. A tenant-bound instance only drains
	 * its own tenant.
	 */
	readonly runWebhookRetries: () => Promise<void>;
	/**
	 * Stops the webhook retry worker, if this instance started one, and
	 * releases the instance's runtime. Persistence passed in through `repos`
	 * belongs to the caller and stays open.
	 */
	readonly dispose: () => Promise<void>;
	/** Runtime router metadata for integrations and diagnostics. */
	readonly app: {
		/**
		 * Normalized base path used when matching incoming requests.
		 */
		readonly basePath: string;
		/**
		 * Flat route registry mounted by this runtime instance.
		 */
		readonly routes: readonly RouteDefinition[];
		/**
		 * Canonical HttpApi contract source used for OpenAPI generation.
		 */
		readonly httpApi: {
			readonly identifier: string;
		};
		/**
		 * Generated OpenAPI document for SDK/docs tooling.
		 */
		readonly spec: OpenApi.OpenAPISpec;
	};
	/** Resolved runtime dependencies used by this instance. */
	readonly context: {
		/**
		 * Runtime configuration merged from defaults and user overrides.
		 */
		readonly config: RuntimeConfig;
		/**
		 * Repository references available to route handlers.
		 */
		readonly repos: RuntimeRepos;
		/**
		 * Adapter references available to route handlers.
		 */
		readonly adapters: RuntimeAdapters;
	};
}

/**
 * Refuses tenant configuration that would scope queries to the wrong place.
 *
 * The tenant is an isolation boundary, so a mistake here stops the instance
 * from being built rather than degrading to per-request tenants nobody meant.
 *
 * @param options - The instance's tenant options.
 * @throws {TypeError} When `tenantId` is not a string or `requireTenantId` is
 *   not a boolean.
 * @throws {Error} When `tenantId` is empty or padded, or `requireTenantId` is
 *   set without a `tenantId`.
 */
export const assertTenantOptions = (
	options: Pick<DsarInstanceOptions, "requireTenantId" | "tenantId">
): void => {
	// Read as unknown: a JavaScript config can pass anything.
	const tenantId: unknown = options.tenantId;
	if (tenantId !== undefined) {
		if (typeof tenantId !== "string") {
			throw new TypeError(
				`[dsar] tenantId must be a string, received ${tenantId === null ? "null" : typeof tenantId}.`
			);
		}
		if (tenantId.trim() === "" || tenantId.trim() !== tenantId) {
			throw new Error(
				`[dsar] tenantId ${JSON.stringify(tenantId)} is empty or has surrounding whitespace.`
			);
		}
	}
	const requireTenantId: unknown = options.requireTenantId;
	if (requireTenantId !== undefined && typeof requireTenantId !== "boolean") {
		throw new TypeError(
			`[dsar] requireTenantId must be a boolean, received ${requireTenantId === null ? "null" : typeof requireTenantId}.`
		);
	}
	if (requireTenantId === true && tenantId === undefined) {
		throw new Error(
			"[dsar] requireTenantId is set but tenantId is missing. Refusing to build an instance that would take its tenant from each request."
		);
	}
};

/**
 * Creates a mountable backend runtime with basePath-aware routing and
 * normalised error handling around Effect-based handlers.
 *
 * @param options - Factory configuration.
 * @param [options.basePath] - Optional URL prefix (e.g. `"/api/v1"`); all routes
 *   are matched relative to this prefix.
 * @param [options.config] - Partial {@link RuntimeConfig} overrides merged with
 *   built-in defaults (environment, feature flags, webhook settings).
 * @param options.repos - Repository bindings; `persistence` is required,
 *   others are optional.
 * @param [options.adapters] - Optional adapter overrides for notifications,
 *   storage, and inbound integrations.
 * @param [options.tenantId] - Binds the instance to one tenant.
 * @param [options.observability] - Request logging through evlog.
 * @param [options.trustedOrigins] - Origins allowed to call from a browser.
 * @returns A {@link DsarInstance} with a fetch-compatible `handler`, router
 *   metadata (`app`), an OpenAPI spec, and the resolved dependency `context`.
 */
export const dsarInstance = (options: DsarInstanceOptions): DsarInstance => {
	assertTenantOptions(options);
	const { tenantId } = options;
	const basePath = normalizeBasePath(options.basePath);
	const coreModule = makeCoreModule({
		config: options.config,
		repos: options.repos,
	});
	const adapterModule = makeAdapterModule(options.adapters);
	const { config } = coreModule;
	const { adapters } = adapterModule;
	const { repos } = coreModule;
	const httpApi = makeDsarHttpApi(basePath);
	const spec = OpenApi.fromApi(httpApi);
	const specUrlPath = `${basePath}/spec.json`;
	const runtime = ManagedRuntime.make(PolicyPacksLive.pipe(Layer.orDie));
	const rateLimited = backendErrorCatalogByCode.REQUEST_RATE_LIMITED;

	const runRoute = async ({
		log,
		params,
		request,
		requestId,
		route,
	}: RouteDispatchInput): Promise<Response> => {
		if (route.publicIntake === true) {
			const limited = await enforceIntakeIpRateLimit({
				config,
				request,
				requestId,
				route: { method: route.method, path: route.path },
			});
			if (limited) {
				return limited;
			}
		}

		const requestContext: RuntimeRequestContext =
			route.protected === true
				? {
						...(await resolveRequestContext(request, config.auth, tenantId)),
						requestId,
					}
				: { requestId, tenantId };
		log.set({
			dsar: {
				principalKind: requestContext.actor?.principalKind,
				tenantId: requestContext.tenantId,
			},
		});

		const services = buildRuntimeServices(
			coreModule,
			adapterModule,
			requestContext
		);
		const exit = await runtime.runPromiseExit(
			route
				.handler({ params, request })
				.pipe(Effect.provideService(RuntimeServicesTag, services))
		);
		if (Exit.isSuccess(exit)) {
			return exit.value;
		}
		const { cause } = exit;
		const failure = Cause.findError(cause);
		if (failure._tag === "Success") {
			return toErrorResponse(failure.success, request, log);
		}
		log.set({ defect: Cause.pretty(cause) });
		return toErrorResponse(
			new InternalRuntimeError({ message: "Unexpected runtime defect." }),
			request,
			log
		);
	};

	const dispatch = async ({
		log,
		params,
		request,
		requestId,
		route,
	}: RouteDispatchInput): Promise<Response> => {
		const response = await runRoute({ log, params, request, requestId, route });
		// Rate limits answer with a ready-made 429 rather than a typed failure,
		// so record the catalog entry here to match every other failure.
		if (response.status === rateLimited.status) {
			log.set({
				error: {
					code: rateLimited.code,
					id: rateLimited.id,
					status: rateLimited.status,
				},
			});
		}
		return response;
	};

	const app = createApp({
		basePath,
		dispatch,
		docsHtml: renderDocsHtml(specUrlPath),
		observability: options.observability,
		renderError: (error, request, log) => toErrorResponse(error, request, log),
		routes: coreRoutes,
		spec,
		tenantId,
		trustedOrigins: options.trustedOrigins,
	});

	const backgroundServices = buildRuntimeServices(coreModule, adapterModule, {
		requestId: "webhook-retry-worker",
		tenantId,
	});
	const runWebhookRetries = (): Promise<void> =>
		runtime.runPromise(
			deliverDueWebhookRetries(tenantId === undefined ? {} : { tenantId }).pipe(
				Effect.provideService(RuntimeServicesTag, backgroundServices)
			)
		);

	const worker =
		options.runWebhookRetryWorker === true
			? runtime.runFork(
					runWebhookRetryWorker(
						tenantId === undefined ? {} : { tenantId }
					).pipe(Effect.provideService(RuntimeServicesTag, backgroundServices))
				)
			: undefined;

	return {
		app: {
			basePath,
			httpApi: {
				identifier: httpApi.identifier,
			},
			routes: coreRoutes,
			spec,
		},
		context: {
			adapters,
			config,
			repos,
		},
		dispose: async () => {
			if (worker) {
				await Effect.runPromise(Fiber.interrupt(worker));
			}
			await runtime.dispose();
		},
		handler: async (request) => await app.fetch(request),
		runWebhookRetries,
	};
};

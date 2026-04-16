import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as OpenApi from "effect/unstable/httpapi/OpenApi";

import { makeDsarHttpApi, renderDocsHtml } from "./http-api";
import {
	buildRuntimeServices,
	makeAdapterModule,
	makeCoreModule,
} from "./layers";
import {
	makeRequestId,
	resolveRequestContext,
} from "./middleware/auth-context";
import { normalizeBasePath, stripBasePath } from "./middleware/base-path";
import { toErrorResponse } from "./middleware/errors";
import { coreRoutes } from "./routes";
import { matchRoute } from "./routes/helpers";
import type { RouteDefinition } from "./routes/types";
import { InternalRuntimeError, RouteNotFoundError } from "./types/errors";
import type {
	DsarInstanceOptions,
	RuntimeAdapters,
	RuntimeConfig,
	RuntimeRepos,
} from "./types/runtime";
import { RuntimeServicesTag } from "./types/runtime";

const backendLogger = {
	error: (event: string, payload: Readonly<Record<string, unknown>>): void => {
		console.error(JSON.stringify({ event, ...payload }));
	},
};

const findRoute = (
	routes: readonly RouteDefinition[],
	method: string,
	pathname: string
):
	| {
			readonly route: RouteDefinition;
			readonly params: Readonly<Record<string, string>>;
	  }
	| undefined => {
	for (const route of routes) {
		const params = matchRoute(route, method, pathname);
		if (params) {
			return { params, route };
		}
	}
	return undefined;
};

const toTraceRequest = (request: Request) =>
	Effect.try({
		catch: () => new Error("clone failed"),
		try: () => request.clone(),
	}).pipe(
		Effect.catch(() => Effect.succeed(request)),
		Effect.runSync
	);

/**
 * Converts web `Headers` into a plain record for envelope/response helpers.
 */
const toHeaderRecord = (headers: Headers): Record<string, string> =>
	Object.fromEntries(headers.entries());

/**
 * Converts a string map into `HeadersInit` for `Request` construction.
 */
const toHeadersInit = (
	headers: Readonly<Record<string, string>>
): HeadersInit => Object.fromEntries(Object.entries(headers));

/**
 * Normalizes an Effect platform request into a web `Request` so the runtime
 * can preserve the fetch-compatible `dsarInstance` handler contract.
 */
const toWebRequest = (
	request: HttpServerRequest.HttpServerRequest
): Effect.Effect<Request> =>
	Effect.gen(function* buildWebRequest() {
		if (
			request.source instanceof Request &&
			request.source.bodyUsed === false
		) {
			return request.source.clone();
		}

		const { method } = request;
		const body =
			method === "GET" || method === "HEAD"
				? undefined
				: yield* request.text.pipe(Effect.catch(() => Effect.succeed("")));

		return new Request(request.url, {
			body,
			headers: toHeadersInit(request.headers),
			method,
		});
	});

/**
 * Converts a web `Response` into an `HttpServerResponse` for the
 * `@effect/platform` boundary.
 *
 * @param response - The incoming web `Response` to convert.
 * @returns A Promise resolving to an `HttpServerResponse`. When the
 *   content-type is JSON, the body is parsed via `Effect.try`; if
 *   parsing fails the raw text is returned as a fallback.
 */
const fromWebResponse = async (
	response: Response
): Promise<HttpServerResponse.HttpServerResponse> => {
	const headers = toHeaderRecord(response.headers);
	const baseOptions = {
		headers,
		status: response.status,
		statusText: response.statusText,
	};

	if (response.body === null) {
		return HttpServerResponse.empty(baseOptions);
	}

	const text = await response.text();
	if (text.length === 0) {
		return HttpServerResponse.empty(baseOptions);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		return Effect.runSync(
			Effect.try({
				catch: () => new Error("Invalid JSON in response body"),
				try: () => JSON.parse(text) as unknown,
			}).pipe(
				Effect.flatMap((parsed) =>
					HttpServerResponse.json(parsed, baseOptions)
				),
				Effect.catch(() =>
					Effect.succeed(HttpServerResponse.text(text, baseOptions))
				)
			)
		);
	}

	return HttpServerResponse.text(text, baseOptions);
};

/**
 * Mountable DSAR backend runtime exposing a fetch-compatible handler, router
 * metadata, and resolved dependency context.
 */
export interface DsarInstance {
	/**
	 * Fetch-compatible request handler for mounting in any host runtime.
	 */
	readonly handler: (request: Request) => Promise<Response>;
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
 * @returns A {@link DsarInstance} with a fetch-compatible `handler`, router
 *   metadata (`app`), an OpenAPI spec, and the resolved dependency `context`.
 */
export const dsarInstance = (options: DsarInstanceOptions): DsarInstance => {
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
	const specUrlPath = `${basePath === "/" ? "" : basePath}/spec.json`;

	const dispatchRequest = async (request: Request): Promise<Response> => {
		try {
			const traceRequest = toTraceRequest(request);
			const url = new URL(request.url);
			const pathname = stripBasePath(url.pathname, basePath);
			if (!pathname) {
				return await toErrorResponse(
					new RouteNotFoundError({
						method: request.method,
						path: url.pathname,
					}),
					traceRequest
				);
			}

			if (pathname === "/spec.json") {
				return new Response(JSON.stringify(spec), {
					headers: {
						"content-type": "application/json",
					},
					status: 200,
				});
			}

			if (pathname === "/docs") {
				return new Response(renderDocsHtml(specUrlPath), {
					headers: {
						"content-type": "text/html; charset=utf-8",
					},
					status: 200,
				});
			}

			const matched = findRoute(coreRoutes, request.method, pathname);
			if (!matched) {
				return await toErrorResponse(
					new RouteNotFoundError({
						method: request.method,
						path: pathname,
					}),
					traceRequest
				);
			}

			const requestContext =
				matched.route.protected === true
					? {
							...(await resolveRequestContext(request, config.auth)),
							requestId: makeRequestId(),
						}
					: {
							requestId: makeRequestId(),
						};

			const services = buildRuntimeServices(
				coreModule,
				adapterModule,
				requestContext
			);

			const exitResult = await Effect.runPromise(
				Effect.exit(
					matched.route
						.handler({
							params: matched.params,
							request,
						})
						.pipe(Effect.provideService(RuntimeServicesTag, services))
				)
			);
			if (Exit.isFailure(exitResult)) {
				const { cause } = exitResult;
				if (Cause.hasDies(cause)) {
					backendLogger.error("[@dsar/backend] defect", {
						cause: Cause.pretty(cause),
					});
				}
				const errorResult = Cause.findError(cause);
				const error =
					errorResult._tag === "Success"
						? errorResult.success
						: new InternalRuntimeError({
								message: "Unexpected runtime defect.",
							});
				return await toErrorResponse(error, traceRequest);
			}
			return exitResult.value;
		} catch (error) {
			return await toErrorResponse(error, toTraceRequest(request));
		}
	};

	const platformApp = Effect.gen(function* runPlatformApp() {
		const serverRequest = yield* HttpServerRequest.HttpServerRequest;
		const sourceRequest = yield* toWebRequest(serverRequest);
		const webResponse = yield* Effect.promise(() =>
			dispatchRequest(sourceRequest)
		);
		return yield* Effect.promise(() => fromWebResponse(webResponse));
	});

	const platformHandler = HttpEffect.toWebHandler(platformApp);
	const handler = (request: Request): Promise<Response> =>
		platformHandler(request);

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
		handler,
	};
};

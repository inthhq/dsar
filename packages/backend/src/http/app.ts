/**
 * Composes the HTTP surface on Hono.
 *
 * This file owns routing, CORS, and request logging. What a route does once it
 * matches (auth, rate limiting, running the Effect handler) lives in
 * `core.ts`, which passes it in as `dispatch`. Keeping the two apart means the
 * routes stay a flat `{ method, path, handler }` registry that the OpenAPI
 * contract and the CLI parity tests can read without a running server.
 */
import { Hono } from "hono";
import type { Context } from "hono";

import {
	gradeLevel,
	observabilityMiddleware,
	toRequestLog,
} from "../observability/evlog";
import type { ObservabilityOptions } from "../observability/evlog";
import { silentLog } from "../observability/log";
import type { RequestLog } from "../observability/log";
import type { RouteDefinition } from "../routes/types";
import { RouteNotFoundError } from "../types/errors";

/** Request headers browsers may send cross-origin to a DSAR backend. */
const CORS_ALLOW_HEADERS = [
	"Authorization",
	"Content-Type",
	"x-artifact-content-type",
	"x-artifact-filename",
	"x-artifact-title",
	"x-artifact-type",
	"x-delivery-token",
	"x-dsar-correlation-id",
	"x-dsar-idempotency-key",
	"x-evidence-content-type",
	"x-evidence-filename",
	"x-evidence-level",
	"x-idempotency-key",
	"x-request-id",
].join(", ");

/**
 * Whether `origin` matches one of the trusted origins.
 *
 * Entries are exact origins (`https://app.example.com`), a leading wildcard
 * subdomain (`https://*.example.com`), or `*` for any origin. A wildcard
 * matches subdomains only, never the bare domain, and never across schemes.
 *
 * @param origin - The request's `Origin` header.
 * @param trustedOrigins - Configured trusted origins.
 * @returns `true` when the origin may call the backend from a browser.
 */
export const isOriginTrusted = (
	origin: string,
	trustedOrigins: readonly string[]
): boolean => {
	for (const trusted of trustedOrigins) {
		if (trusted === "*" || trusted === origin) {
			return true;
		}
		const wildcard = /^(https?):\/\/\*\.(.+)$/u.exec(trusted);
		const scheme = wildcard?.[1];
		const domain = wildcard?.[2];
		if (
			scheme &&
			domain &&
			origin.startsWith(`${scheme}://`) &&
			origin.endsWith(`.${domain}`) &&
			origin.length > `${scheme}://.${domain}`.length
		) {
			return true;
		}
	}
	return false;
};

/** One matched route, handed to the runtime to authenticate and run. */
export interface RouteDispatchInput {
	/** The matched route. */
	readonly route: RouteDefinition;
	/** The incoming request, untouched. */
	readonly request: Request;
	/** Decoded path parameters. */
	readonly params: Readonly<Record<string, string>>;
	/** This request's wide event. */
	readonly log: RequestLog;
}

/** Everything the app needs from the runtime that owns it. */
export interface CreateAppOptions {
	/** Normalized mount prefix; `""` for the root. */
	readonly basePath: string;
	/** Route registry, matched in order. */
	readonly routes: readonly RouteDefinition[];
	/** OpenAPI document served at `/spec.json`. */
	readonly spec: unknown;
	/** HTML served at `/docs`. */
	readonly docsHtml: string;
	/** Request logging. Defaults to failures only. */
	readonly observability?: ObservabilityOptions;
	/** Origins allowed to call the backend from a browser. */
	readonly trustedOrigins?: readonly string[];
	/** Runs a matched route. */
	readonly dispatch: (input: RouteDispatchInput) => Promise<Response>;
	/** Turns any thrown error into a catalog error envelope. */
	readonly renderError: (
		error: unknown,
		request: Request,
		log: RequestLog
	) => Promise<Response>;
}

const requestLog = (c: Context): RequestLog =>
	toRequestLog(c.get("log")) ?? silentLog;

/**
 * Builds the Hono app for one DSAR instance.
 *
 * @param options - Routes, mount prefix, logging, CORS, and the runtime
 *   callbacks that run a route and render an error.
 * @returns A Hono app whose `fetch` takes a web `Request`.
 */
export const createApp = (options: CreateAppOptions): Hono => {
	const app = new Hono({ strict: false });
	const scoped = options.basePath ? app.basePath(options.basePath) : app;

	// First, so the wide event also covers CORS preflights and 404s.
	const observe = observabilityMiddleware(options.observability);
	if (observe) {
		app.use("*", observe);
		// Inside evlog's wrapper, so it grades the event from the final status.
		app.use("*", gradeLevel);
	}

	const trustedOrigins = options.trustedOrigins ?? [];
	app.use("*", async (c, runNext) => {
		const origin = c.req.header("Origin");
		const allowed =
			origin !== undefined && isOriginTrusted(origin, trustedOrigins);

		if (allowed) {
			c.header("Access-Control-Allow-Origin", origin);
			c.header("Access-Control-Allow-Credentials", "true");
			c.header("Vary", "Origin");
		}

		if (c.req.method === "OPTIONS") {
			if (allowed) {
				c.header(
					"Access-Control-Allow-Methods",
					"GET, POST, PUT, PATCH, DELETE, OPTIONS"
				);
				c.header("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
				c.header("Access-Control-Max-Age", "86400");
			}
			// No CORS headers on an untrusted preflight, so the browser blocks
			// it. 204 rather than 403 because the preflight itself is valid.
			return c.body(null, 204);
		}

		await runNext();
	});

	scoped.get("/spec.json", (c) => c.json(options.spec));
	scoped.get("/docs", (c) => c.html(options.docsHtml));

	for (const route of options.routes) {
		scoped.on(route.method, route.path, (c) => {
			const log = requestLog(c);
			log.set({ dsar: { route: `${route.method} ${route.path}` } });
			return options.dispatch({
				log,
				params: c.req.param(),
				request: c.req.raw,
				route,
			});
		});
	}

	app.notFound((c) =>
		options.renderError(
			new RouteNotFoundError({
				method: c.req.method,
				path: new URL(c.req.url).pathname,
			}),
			c.req.raw,
			requestLog(c)
		)
	);
	app.onError((error, c) =>
		options.renderError(error, c.req.raw, requestLog(c))
	);

	return app;
};

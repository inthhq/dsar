/**
 * evlog wiring for the Hono app.
 *
 * Everything that knows evlog exists lives here. The rest of the package
 * writes to a {@link RequestLog}.
 *
 * ## The host owns evlog's configuration
 *
 * evlog keeps sampling, drains, plugins, and the service name in one
 * process-wide state, and `initLogger` replaces all of it. DSAR usually runs
 * inside an app that already configured evlog, so by default it does not call
 * `initLogger`: it registers its middleware, grades each event by status, and
 * force-keeps failed and rejected requests (4xx and 5xx) through whatever
 * sampling the host chose.
 *
 * Passing `level` opts in to DSAR setting the sampling rates itself, for a
 * process where nothing else configures evlog. `level: "warn"` means silence
 * when things work and a line when they do not.
 *
 * ## How the level is enforced
 *
 * Hono turns a thrown handler error into a response, so evlog's middleware
 * sees a status and never an exception, and the event's level stays `info`
 * even for a 500. Head sampling alone would drop the requests worth keeping.
 *
 * - {@link gradeLevel} runs inside evlog's wrapper, reads the final status, and
 *   marks the event `warn` (4xx) or `error` (5xx) before it is emitted.
 * - A `keep` callback force-keeps anything at or above the level's threshold,
 *   so a failure survives sampling regardless.
 *
 * ## Redaction
 *
 * On whenever logging is on. DSAR requests carry names, email addresses, and
 * IP addresses, so forgetting to redact is a compliance incident. Turning it
 * off is deliberate.
 */
import { initLogger } from "evlog";
import type { AuditableLogger } from "evlog";
import { evlog } from "evlog/hono";
import type { EvlogHonoOptions } from "evlog/hono";
import type { MiddlewareHandler } from "hono";

import type { RequestLog } from "./log";

/**
 * How much of the request stream reaches the log.
 *
 * - `silent`: nothing. No middleware is registered.
 * - `error`: failed requests only (5xx). Sets evlog's global sampling.
 * - `warn`: failures and rejections (4xx and 5xx). Sets evlog's global
 *   sampling.
 * - `info`: every request. Sets evlog's global sampling.
 * - `inherit`: leave evlog's global configuration alone and force-keep server
 *   failures (5xx) only.
 *
 * Unset is like `inherit`, but force-keeps 4xx as well as 5xx.
 */
export type ObservabilityLevel =
	| "silent"
	| "error"
	| "warn"
	| "info"
	| "inherit";

/** Request logging options for a DSAR instance. */
export interface ObservabilityOptions {
	/**
	 * How much to log. Unset leaves evlog's global configuration to the host.
	 *
	 * `"error"`, `"warn"`, and `"info"` call evlog's `initLogger`, which
	 * replaces the process's drains, plugins, and sampling. Use them only where
	 * nothing else configures evlog.
	 */
	readonly level?: ObservabilityLevel;
	/** Service name on this instance's events. Does not change global state. */
	readonly service?: string;
	/** Route globs to log. Unset logs every route. */
	readonly include?: readonly string[];
	/** Route globs to skip. Takes precedence over `include`. */
	readonly exclude?: readonly string[];
	/** PII redaction for email, IPv4, JWT, and bearer tokens. On unless disabled. */
	readonly redact?: EvlogHonoOptions["redact"];
	/**
	 * Also sends this instance's events here. evlog's global output, such as
	 * the console, still receives them.
	 */
	readonly drain?: EvlogHonoOptions["drain"];
	/** Adds fields to every event after emit, before drain. */
	readonly enrich?: EvlogHonoOptions["enrich"];
	/** Force-keeps an event that sampling would otherwise drop. */
	readonly keep?: EvlogHonoOptions["keep"];
}

/** The lowest status worth force-keeping through sampling, per level. */
const keepFrom: Readonly<
	Record<Exclude<ObservabilityLevel, "silent">, number>
> = {
	error: 500,
	// Every event is kept anyway; the threshold is unreachable rather than
	// special-cased.
	info: 0,
	inherit: 500,
	warn: 400,
};

/** Force-keep threshold when the caller sets no level. */
const UNSET_KEEP_FROM = 400;

const keepThreshold = (level: ObservabilityLevel | undefined): number => {
	if (level === undefined) {
		return UNSET_KEEP_FROM;
	}
	if (level === "silent") {
		return Number.POSITIVE_INFINITY;
	}
	return keepFrom[level];
};

/**
 * Head-sampling rates for a level. `undefined` means do not touch the global
 * configuration, which is the point of `"inherit"`.
 */
const ratesFor = (
	level: ObservabilityLevel
): Record<string, number> | undefined => {
	switch (level) {
		case "error": {
			return { debug: 0, info: 0, warn: 0 };
		}
		case "warn": {
			return { debug: 0, info: 0 };
		}
		case "info": {
			return { debug: 100, info: 100, warn: 100 };
		}
		default: {
			return undefined;
		}
	}
};

/**
 * Turns DSAR's options into evlog's.
 *
 * Separate from {@link observabilityMiddleware} so the defaults can be
 * asserted directly. `redact` and `keep` are policy, not pass-through: a
 * regression in either would not show up in an end-to-end test.
 *
 * @param options - DSAR observability options.
 * @returns evlog Hono middleware options with redaction and keep rules applied.
 */
export const resolveOptions = (
	options: ObservabilityOptions
): EvlogHonoOptions => {
	const threshold = keepThreshold(options.level);
	const caller = options.keep;

	return {
		drain: options.drain,
		enrich: options.enrich,
		exclude: options.exclude ? [...options.exclude] : undefined,
		include: options.include ? [...options.include] : undefined,
		keep: async (ctx) => {
			if ((ctx.status ?? 200) >= threshold) {
				ctx.shouldKeep = true;
			}
			// The caller's rule runs too and can only keep more.
			await caller?.(ctx);
		},
		redact: options.redact ?? true,
	};
};

/**
 * Marks the event `warn` or `error` from the response status.
 *
 * Registered immediately after evlog's middleware so it runs inside that
 * wrapper, sees the final status, and grades the event before it is emitted.
 *
 * @param c - Hono context carrying evlog's request logger.
 * @param runNext - Runs the rest of the middleware chain.
 */
export const gradeLevel: MiddlewareHandler = async (c, runNext) => {
	await runNext();

	const log: AuditableLogger | undefined = c.get("log");
	if (log === undefined) {
		return;
	}
	const { status } = c.res;
	if (status >= 500) {
		log.setLevel("error");
	} else if (status >= 400) {
		log.setLevel("warn");
	}
};

/**
 * The evlog middleware, or `undefined` when logging is off, so
 * `level: "silent"` costs nothing per request.
 *
 * Only an explicit `"error"`, `"warn"`, or `"info"` level calls
 * `initLogger`; otherwise the host's evlog configuration is left as it is.
 *
 * @param options - DSAR observability options.
 * @returns Middleware to register first on the app, or `undefined`.
 */
export const observabilityMiddleware = (
	options: ObservabilityOptions | undefined
): MiddlewareHandler | undefined => {
	const level = options?.level;
	if (level === "silent") {
		return undefined;
	}

	const rates = level === undefined ? undefined : ratesFor(level);
	if (rates !== undefined) {
		initLogger({ sampling: { rates } });
	}

	return evlog(resolveOptions(options ?? {}));
};

/**
 * Adapts evlog's request logger to {@link RequestLog}.
 *
 * @param logger - evlog's logger from `c.get("log")`, if any.
 * @returns A request log, or `undefined` when logging is off or the route was
 *   skipped by `include`/`exclude`.
 */
export const toRequestLog = (
	logger: AuditableLogger | undefined
): RequestLog | undefined => {
	if (logger === undefined) {
		return undefined;
	}
	return {
		error: (error, fields) => {
			logger.error(error, fields);
		},
		set: (fields) => {
			logger.set(fields);
		},
	};
};

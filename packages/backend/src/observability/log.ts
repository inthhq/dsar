/**
 * The request log handlers and the runtime write to.
 *
 * Each request produces one wide event. Code that knows something worth
 * recording about the request adds fields to it; the evlog middleware in
 * `./evlog.ts` emits it once when the response is ready. There is no `debug`
 * or `info` to pick between, so there is nothing to scatter.
 *
 * The interface is two methods wide rather than evlog's logger so the rest of
 * the package does not depend on evlog, the disabled case is a trivial no-op,
 * and tests can record calls with a plain object.
 */

/** Fields to merge into the current request's wide event. */
export type LogFields = Readonly<Record<string, unknown>>;

/** Somewhere to record what happened during one request. */
export interface RequestLog {
	/** Merges fields into this request's event. */
	readonly set: (fields: LogFields) => void;
	/** Records that this request failed. */
	readonly error: (error: Error, fields?: LogFields) => void;
}

/**
 * Records nothing.
 *
 * What a request gets with `observability: { level: "silent" }`, and what
 * non-request work such as the webhook retry pass gets.
 */
export const silentLog: RequestLog = {
	error: () => {
		/* Logging is off. */
	},
	set: () => {
		/* Logging is off. */
	},
};

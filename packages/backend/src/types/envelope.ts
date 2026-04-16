/**
 * Standard success response envelope returned by backend handlers.
 *
 * @typeParam T - Successful response payload type.
 */
export interface SuccessEnvelope<T> {
	/** Discriminant flag indicating whether the operation succeeded. */
	readonly ok: true;
	/** Successful response payload. */
	readonly data: T;
	/** Optional metadata (pagination, tracing, diagnostics). */
	readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Standard error response envelope returned by backend handlers.
 */
export interface ErrorEnvelope {
	/** Discriminant flag indicating whether the operation succeeded. */
	readonly ok: false;
	/** Failure reason returned by the provider or runtime. */
	readonly error: {
		/** Unique error identifier for correlation and support. */
		readonly id: string;
		/** Machine-readable error code from the error catalog. */
		readonly code: string;
		/** URL linking to relevant documentation for this error. */
		readonly docsUrl: string;
		/** Human-readable error description for operator diagnostics. */
		readonly message: string;
		/** HTTP status code associated with this error. */
		readonly status: number;
		/** Optional diagnostic trace context for debugging. */
		readonly trace?: Readonly<Record<string, unknown>>;
	};
}

/**
 * Builds a success envelope for backend route responses.
 *
 * @param data - Successful response payload.
 * @param [meta] - Optional metadata attached to the response.
 * @typeParam T - Successful response payload type.
 * @returns Success envelope with `ok: true`.
 */
export const successEnvelope = <T>(
	data: T,
	meta?: Readonly<Record<string, unknown>>
): SuccessEnvelope<T> => ({
	data,
	...(meta !== undefined && { meta }),
	ok: true,
});

/**
 * Builds an error envelope for backend route responses.
 *
 * @param input - Normalized error details to expose to clients.
 * @returns Error envelope with `ok: false`.
 */
export const errorEnvelope = (input: {
	readonly id: string;
	readonly code: string;
	readonly docsUrl: string;
	readonly message: string;
	readonly status: number;
	readonly trace?: Readonly<Record<string, unknown>>;
}): ErrorEnvelope => ({
	error: {
		code: input.code,
		docsUrl: input.docsUrl,
		id: input.id,
		message: input.message,
		status: input.status,
		trace: input.trace,
	},
	ok: false,
});

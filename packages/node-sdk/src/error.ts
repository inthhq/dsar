import { asRecord, isRecord } from "@dsar/guards";

import type { SdkError, SdkErrorCategory } from "./types";
import {
	isSdkErrorCode,
	resolveSdkErrorCatalogEntry,
} from "./types/error-codes";
import type { SdkErrorCode } from "./types/error-codes";

const RETRIABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const categoryFromStatus = (status: number): SdkErrorCategory => {
	if (status === 401 || status === 403) {
		return "auth";
	}
	if (status === 400 || status === 404 || status === 422) {
		return "validation";
	}
	if (status >= 400) {
		return "http";
	}
	return "unknown";
};

/**
 * Checks whether an HTTP status code is considered retriable by the SDK.
 *
 * @param status - HTTP status code to test against `RETRIABLE_HTTP_STATUS`
 *   (408, 429, 500, 502, 503, 504).
 * @returns `true` when `status` is in the retriable set; `false` otherwise.
 */
export const isRetriableStatus = (status: number): boolean =>
	RETRIABLE_HTTP_STATUS.has(status);

class DsarSdkError extends Error implements SdkError {
	readonly type = "dsar.sdk.error" as const;
	override readonly name = "DsarSdkError" as const;
	readonly category: SdkErrorCategory;
	readonly code: string;
	readonly errorId?: string;
	readonly docsUrl?: string;
	readonly status?: number;
	readonly retriable: boolean;
	readonly meta?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: SdkErrorCategory;
		readonly code: string;
		readonly message: string;
		readonly retriable: boolean;
		readonly status?: number;
		readonly errorId?: string;
		readonly docsUrl?: string;
		readonly meta?: Readonly<Record<string, unknown>>;
		readonly cause?: unknown;
	}) {
		const parts = [
			input.code,
			input.errorId,
			input.message,
			input.docsUrl,
		].filter(Boolean);
		super(parts.join(" — "), { cause: input.cause });
		this.category = input.category;
		this.code = input.code;
		this.retriable = input.retriable;
		this.status = input.status;
		this.errorId = input.errorId;
		this.docsUrl = input.docsUrl;
		this.meta = input.meta;
	}
}

/**
 * Creates a normalized SDK error shape and enriches known SDK codes with catalog metadata.
 *
 * @param input - Error context captured at the call site.
 * @returns A `DsarSdkError` instance suitable for retry logic and caller handling.
 */
export const createSdkError = (input: {
	readonly category: SdkErrorCategory;
	readonly code: SdkErrorCode | string;
	readonly message: string;
	readonly retriable: boolean;
	readonly status?: number;
	readonly errorId?: string;
	readonly docsUrl?: string;
	readonly meta?: Readonly<Record<string, unknown>>;
	readonly cause?: unknown;
}): SdkError => {
	const catalogEntry = isSdkErrorCode(input.code)
		? resolveSdkErrorCatalogEntry(input.code)
		: undefined;
	const errorId = input.errorId ?? catalogEntry?.id;
	const docsUrl = input.docsUrl ?? catalogEntry?.docsUrl;
	return new DsarSdkError({
		category: input.category,
		cause: input.cause,
		code: catalogEntry?.code ?? input.code,
		docsUrl,
		errorId,
		message: input.message,
		meta: input.meta,
		retriable: input.retriable,
		status: input.status ?? catalogEntry?.status,
	});
};

/**
 * Type guard that checks whether a value has the shape of a {@link SdkError}
 * (verifies `name` and `type` fields match `DsarSdkError`).
 *
 * @param value - Arbitrary value to test.
 * @returns `true` when `value` matches the normalized SDK error shape; `false`
 *   otherwise.
 */
export const isSdkError = (value: unknown): value is SdkError =>
	isRecord(value) &&
	value.name === "DsarSdkError" &&
	value.type === "dsar.sdk.error";

/**
 * Normalizes a transport-layer failure (network outage, abort, or timeout)
 * into a structured {@link SdkError}.
 *
 * Inspects the error message for abort/timeout keywords to choose between
 * `"timeout"` and `"network"` categories, and sets `retriable` to `true`
 * for both. The original error is preserved as `cause` and surfaced in
 * `meta` for diagnostics.
 *
 * @param error - The caught transport error; may be an `Error` instance, a
 *   string, or an arbitrary value. When it is an `Error`, its `message`,
 *   `name`, and `stack` are captured in `meta`.
 * @returns A {@link SdkError} with code `SDK_TIMEOUT` or
 *   `SDK_NETWORK_ERROR`, always marked as retriable.
 */
export const normalizeTransportError = (error: unknown): SdkError => {
	const message =
		error instanceof Error ? error.message : "DSAR SDK transport failed.";
	const lower = message.toLowerCase();
	const isAbort = lower.includes("aborted") || lower.includes("timeout");
	const category = isAbort ? "timeout" : "network";
	const meta: Readonly<Record<string, unknown>> | undefined =
		error instanceof Error
			? {
					message: error.message,
					name: error.name,
					stack: error.stack,
					...asRecord(error),
				}
			: asRecord(error);
	return createSdkError({
		category,
		cause: error,
		code: isAbort ? "SDK_TIMEOUT" : "SDK_NETWORK_ERROR",
		message,
		meta,
		retriable: true,
	});
};

/**
 * Maps a non-success HTTP response into a normalized SDK error.
 *
 * @param input - HTTP status and parsed response body.
 * @returns A catalog-aware SDK error that preserves backend `id`/`docsUrl` when present.
 */
const isErrorEnvelope = (
	body: unknown
): body is {
	readonly ok: false;
	readonly error: {
		readonly id?: string;
		readonly code: string;
		readonly docsUrl?: string;
		readonly message: string;
		readonly status: number;
		readonly trace?: Readonly<Record<string, unknown>>;
	};
} =>
	body !== null &&
	typeof body === "object" &&
	"ok" in body &&
	body.ok === false &&
	"error" in body &&
	typeof body.error === "object";

/**
 * Converts a non-success HTTP response into a structured {@link SdkError}.
 *
 * When `body` matches the backend error envelope (`{ ok: false, error }`)
 * the error's `code`, `message`, `status`, `id`, `docsUrl`, and `trace`
 * are preserved verbatim. Otherwise a generic `SDK_HTTP_ERROR` is produced
 * with the raw body captured in `meta`. In both cases `retriable` is
 * derived via {@link isRetriableStatus}.
 *
 * @param input - HTTP failure context.
 * @param input.status - HTTP status code of the response.
 * @param input.body - Parsed response body (JSON or `undefined`).
 * @returns A catalog-aware {@link SdkError} with category, code, and
 *   retriability derived from the status code.
 */
export const normalizeHttpFailure = (input: {
	readonly status: number;
	readonly body?: unknown;
}): SdkError => {
	if (isErrorEnvelope(input.body)) {
		const { error } = input.body;
		const errorId = typeof error.id === "string" ? error.id : undefined;
		const docsUrl =
			typeof error.docsUrl === "string" ? error.docsUrl : undefined;
		const { trace } = error;
		const meta: Readonly<Record<string, unknown>> | undefined =
			trace && Object.keys(trace).length > 0 ? trace : undefined;
		return createSdkError({
			category: categoryFromStatus(error.status),
			code: error.code,
			docsUrl,
			errorId,
			message: error.message,
			meta,
			retriable: isRetriableStatus(error.status),
			status: error.status,
		});
	}
	return createSdkError({
		category: categoryFromStatus(input.status),
		code: "SDK_HTTP_ERROR",
		message: `DSAR SDK request failed with status ${input.status}.`,
		meta: asRecord(input.body),
		retriable: isRetriableStatus(input.status),
		status: input.status,
	});
};

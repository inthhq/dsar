/**
 * Successful API response envelope returned by DSAR endpoints.
 *
 * @typeParam T - Successful response payload type.
 */
export interface ApiSuccessEnvelope<T> {
	/** Indicates successful DSAR API operation. */
	readonly ok: true;
	/** Successful response payload returned by the API. */
	readonly data: T;
	/** Optional metadata for pagination/tracing/diagnostics. */
	readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Failed API response envelope returned by DSAR endpoints.
 */
export interface ApiErrorEnvelope {
	/** Indicates failed DSAR API operation. */
	readonly ok: false;
	/** Structured error payload returned by the backend. */
	readonly error: {
		/** Stable backend error identifier for docs/runbooks. */
		readonly id?: string;
		/** Stable machine-readable error code. */
		readonly code: string;
		/** Canonical documentation URL for this error id. */
		readonly docsUrl?: string;
		/** Human-readable error summary for operators/clients. */
		readonly message: string;
		/** HTTP status returned by the backend. */
		readonly status: number;
		/** Optional trace-safe diagnostics payload. */
		readonly trace?: Readonly<Record<string, unknown>>;
	};
}

/**
 * Union of successful and failed API envelopes.
 *
 * @typeParam T - Successful response payload type carried by the success variant.
 */
export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * Normalized SDK error category used for retries and caller branching.
 */
export type SdkErrorCategory =
	| "auth"
	| "http"
	| "network"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Canonical SDK error shape produced for transport, HTTP, and validation failures.
 */
export interface SdkError {
	/** Stable discriminator for tooling and log classification. */
	readonly type: "dsar.sdk.error";
	/** Cosmetic error name for stack traces and console output. */
	readonly name: "DsarSdkError";
	/** Human-readable error message normalized by the SDK. */
	readonly message: string;
	/** Normalized category used for retry and UX handling. */
	readonly category: SdkErrorCategory;
	/** Stable code used by callers for programmatic branching. */
	readonly code: string;
	/** Stable backend error identifier for docs/runbooks (mapped from backend `id`). */
	readonly errorId?: string;
	/** Canonical documentation URL for this error. */
	readonly docsUrl?: string;
	/** Optional HTTP status when error originated from HTTP response. */
	readonly status?: number;
	/** Whether caller can safely retry this operation. */
	readonly retriable: boolean;
	/** Optional diagnostic context (lifecycle context, trace data, etc.). */
	readonly meta?: Readonly<Record<string, unknown>>;
	/** Raw underlying error cause for debug tooling. */
	readonly cause?: unknown;
}

/**
 * Debug event emitted by the SDK request lifecycle when debug mode is enabled.
 */
export type SdkDebugEvent =
	| {
			readonly type: "request";
			readonly method: string;
			readonly url: string;
			readonly headers: Readonly<Record<string, string>>;
			readonly attempt: number;
	  }
	| {
			readonly type: "response";
			readonly method: string;
			readonly url: string;
			readonly status: number;
			readonly attempt: number;
	  }
	| {
			readonly type: "retry";
			readonly method: string;
			readonly url: string;
			readonly attempt: number;
			readonly reason: string;
	  };

/**
 * User-provided runtime configuration for constructing a node SDK client.
 */
export interface NodeSdkConfig {
	/** DSAR API base URL override (falls back to environment). */
	readonly baseUrl?: string;
	/** Auth token used for bearer authorization. */
	readonly token?: string;
	/** Request timeout budget in milliseconds. */
	readonly timeoutMs?: number;
	/** Maximum retry attempts for retriable requests. */
	readonly retryMaxAttempts?: number;
	/** Debug hook/flag for request-response telemetry. */
	readonly debug?: boolean | ((event: SdkDebugEvent) => void);
	/** Optional fetch implementation override for host runtimes. */
	readonly fetch?: typeof fetch;
	/** Default headers merged into each outbound request. */
	readonly defaultHeaders?: Readonly<Record<string, string>>;
}

/**
 * Per-request overrides layered on top of client-level SDK configuration.
 */
export interface RequestOptions {
	/** Optional idempotency key for safe retried mutations. */
	readonly idempotencyKey?: string;
	/** Additional headers for endpoint-specific behavior. */
	readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Fully resolved runtime config after defaults and environment fallbacks are applied.
 */
export interface ResolvedNodeSdkConfig {
	/** Normalized API base URL used by the runtime client. */
	readonly baseUrl: string;
	/** Resolved auth token (config/env). */
	readonly token?: string;
	/** Normalized timeout budget with defaults applied. */
	readonly timeoutMs: number;
	/** Normalized retry ceiling with defaults applied. */
	readonly retryMaxAttempts: number;
	/** Resolved debug behavior used by request pipeline. */
	readonly debug?: boolean | ((event: SdkDebugEvent) => void) | undefined;
	/** Resolved fetch implementation for HTTP calls. */
	readonly fetch: typeof fetch;
	/** Resolved default headers merged into each call. */
	readonly defaultHeaders: Readonly<Record<string, string>>;
}

/**
 * Normalized request input used by the internal SDK HTTP caller.
 */
export interface CallApiInput {
	/** HTTP method used for endpoint invocation. */
	readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	/** Endpoint path relative to configured base URL. */
	readonly path: string;
	/** Optional query params serialized onto the request URL. */
	readonly query?: Readonly<
		Record<string, string | number | boolean | undefined>
	>;
	/** Optional request body payload for non-GET operations. */
	readonly body?: unknown;
	/** Optional per-call request overrides (headers/actor/tenant/idempotency). */
	readonly options?: RequestOptions;
}

/**
 * Result wrapper returned for successful SDK API operations.
 *
 * @typeParam T - Successful response payload type returned by the API endpoint.
 */
export interface DsarResult<T> {
	/** Indicates successful result wrapper. */
	readonly ok: true;
	/** Successful payload value returned by API endpoint. */
	readonly data: T;
	/** Optional metadata included by endpoint responses. */
	readonly meta?: Readonly<Record<string, unknown>>;
	/** Returns payload directly; no-op for successful result type. */
	readonly unwrap: () => T;
	/** Returns payload or throws with custom message in impossible branches. */
	readonly expect: (_message?: string) => T;
	/** Returns payload, preserving Result-like ergonomic symmetry. */
	readonly orElse: (_fallback: T | ((error: never) => T)) => T;
}

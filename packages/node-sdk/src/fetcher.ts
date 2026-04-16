/* oxlint-disable max-statements */
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import {
	createSdkError,
	isRetriableStatus,
	isSdkError,
	normalizeHttpFailure,
	normalizeTransportError,
} from "./error";
import type {
	ApiSuccessEnvelope,
	CallApiInput,
	ResolvedNodeSdkConfig,
	RequestOptions,
	SdkError,
} from "./types";

const buildUrl = (
	baseUrl: string,
	path: string,
	query?: Readonly<Record<string, string | number | boolean | undefined>>
) => {
	const relativePath = path.replace(/^\/+/, "");
	const url = new URL(relativePath, baseUrl);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined) {
				continue;
			}
			url.searchParams.set(key, String(value));
		}
	}
	return url.toString();
};

const buildHeaders = (
	config: ResolvedNodeSdkConfig,
	options?: RequestOptions
) => {
	const headers = new Headers();
	for (const [key, value] of Object.entries(config.defaultHeaders)) {
		headers.set(key, value);
	}
	if (config.token) {
		headers.set("authorization", `Bearer ${config.token}`);
	}
	for (const [key, value] of Object.entries(options?.headers ?? {})) {
		headers.set(key, value);
	}
	if (options?.idempotencyKey) {
		headers.set("x-idempotency-key", options.idempotencyKey);
	}
	return headers;
};

const emitDebug = (
	config: ResolvedNodeSdkConfig,
	event:
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
		  }
) => {
	if (!config.debug) {
		return;
	}
	if (typeof config.debug === "function") {
		config.debug(event);
		return;
	}
	console.log("[@dsar/node-sdk]", event);
};

const toHeaderRecord = (headers: Headers): Record<string, string> => {
	const output: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		output[key] = value;
	}
	return output;
};

const toRedactedHeaderRecord = (headers: Headers): Record<string, string> => {
	const output = toHeaderRecord(headers);
	if ("authorization" in output) {
		output.authorization = "<redacted>";
	}
	return output;
};

const isPassThroughBody = (
	body: unknown
): body is ArrayBuffer | Uint8Array | FormData | URLSearchParams | Blob =>
	body instanceof ArrayBuffer ||
	body instanceof Uint8Array ||
	(typeof FormData !== "undefined" && body instanceof FormData) ||
	(typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) ||
	(typeof Blob !== "undefined" && body instanceof Blob);

const toBody = (body: unknown): BodyInit | undefined => {
	if (body === undefined) {
		return undefined;
	}
	if (body instanceof Uint8Array) {
		return body.buffer.slice(
			body.byteOffset,
			body.byteOffset + body.byteLength
		) as ArrayBuffer;
	}
	if (isPassThroughBody(body)) {
		return body as Exclude<typeof body, Uint8Array>;
	}
	return JSON.stringify(body);
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return await response.text();
	}
	return await response.json();
};

const makeSingleAttempt = <T>(
	config: ResolvedNodeSdkConfig,
	input: CallApiInput,
	url: string,
	headers: Headers,
	attempt: number
): Effect.Effect<ApiSuccessEnvelope<T>, SdkError> =>
	Effect.tryPromise({
		catch: (error: unknown) =>
			isSdkError(error) ? error : normalizeTransportError(error),
		try: async () => {
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				Duration.toMillis(Duration.millis(config.timeoutMs))
			);
			try {
				emitDebug(config, {
					attempt,
					headers: toRedactedHeaderRecord(headers),
					method: input.method,
					type: "request",
					url,
				});
				const response = await config.fetch(url, {
					body: toBody(input.body),
					headers,
					method: input.method,
					signal: controller.signal,
				});
				emitDebug(config, {
					attempt,
					method: input.method,
					status: response.status,
					type: "response",
					url,
				});
				const parsed = await parseResponseBody(response);
				if (!response.ok) {
					throw normalizeHttpFailure({
						body: parsed,
						status: response.status,
					});
				}
				if (
					typeof parsed !== "object" ||
					parsed === null ||
					!("ok" in parsed) ||
					(parsed as { ok: unknown }).ok !== true
				) {
					throw createSdkError({
						category: "validation",
						code: "SDK_INVALID_ENVELOPE",
						message: "DSAR SDK received an invalid success envelope.",
						retriable: false,
						status: response.status,
					});
				}
				return parsed as ApiSuccessEnvelope<T>;
			} finally {
				clearTimeout(timeout);
			}
		},
	});

/**
 * Sends an HTTP request to the DSAR backend and returns the parsed success
 * envelope, or fails with a normalized {@link SdkError}.
 *
 * On non-2xx responses the body is inspected for a backend error envelope
 * (`{ ok: false, error: { code, message, status, … } }`); when present its
 * fields are preserved verbatim in the returned {@link SdkError}. Otherwise
 * a generic `SDK_HTTP_ERROR` is produced. Transport-level failures (network
 * outage, abort, timeout) are normalised via
 * {@link normalizeTransportError}. In all error cases the `Effect` fails —
 * `callApi` never returns an error envelope on the success channel.
 *
 * Retriable errors (status 408, 429, 500, 502, 503, 504 and transport
 * failures) are retried up to `config.retryMaxAttempts` times with no
 * backoff delay. Callers should set an idempotency key via
 * `input.options.idempotencyKey` for non-idempotent methods to ensure safe
 * retries. Each attempt is subject to `config.timeoutMs`.
 *
 * @typeParam T - Expected shape of the `data` field inside the success
 *   envelope.
 * @param config - Resolved SDK configuration providing `baseUrl`, auth
 *   headers, timeout, retry settings, and the `fetch` implementation.
 * @param input - Request descriptor: HTTP `method`, `path`, optional
 *   `query` params, `body`, and per-request `options`.
 * @returns An `Effect` yielding an {@link ApiSuccessEnvelope} on success,
 *   or failing with a {@link SdkError} for transport, HTTP, or envelope
 *   validation failures.
 */
export const callApi = <T>(
	config: ResolvedNodeSdkConfig,
	input: CallApiInput
): Effect.Effect<ApiSuccessEnvelope<T>, SdkError> => {
	const url = buildUrl(config.baseUrl, input.path, input.query);
	const headers = buildHeaders(config, input.options);
	if (
		input.body !== undefined &&
		!headers.has("content-type") &&
		!isPassThroughBody(input.body)
	) {
		headers.set("content-type", "application/json");
	}

	let attempt = 0;
	const retryCount = Math.max(config.retryMaxAttempts, 1) - 1;

	return Effect.suspend(() => {
		attempt += 1;
		return makeSingleAttempt<T>(config, input, url, headers, attempt);
	}).pipe(
		Effect.retry({
			schedule: Schedule.recurs(retryCount),
			while: (error) => {
				if (!error.retriable) {
					return false;
				}
				emitDebug(config, {
					attempt,
					method: input.method,
					reason: error.message,
					type: "retry",
					url,
				});
				return true;
			},
		})
	);
};

/**
 * Re-export of {@link isRetriableStatus} for callers that prefer the
 * `isRetriableHttpStatus` alias.
 */
export const isRetriableHttpStatus = isRetriableStatus;

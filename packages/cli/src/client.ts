import { toApiError } from "@dsar/guards";
import * as Effect from "effect/Effect";

import type { ApiClient, ApiRequest, GlobalCliConfig } from "./types";

const withQuery = (
	path: string,
	query: Readonly<Record<string, string | undefined>> | undefined
): string => {
	if (!query) {
		return path;
	}
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) {
			params.set(key, value);
		}
	}
	const asString = params.toString();
	return asString.length === 0 ? path : `${path}?${asString}`;
};

const parseResponse = async (response: Response): Promise<unknown> => {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return await response.text();
	}
	return await response.json();
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

const buildHeaders = (
	config: GlobalCliConfig,
	request: ApiRequest
): Readonly<Record<string, string>> => {
	const headers: Record<string, string> = { ...request.headers };
	if (config.token) {
		headers.authorization = `Bearer ${config.token}`;
	}
	if (config.idempotencyKey) {
		headers["x-idempotency-key"] = config.idempotencyKey;
	}
	if (
		request.body !== undefined &&
		headers["content-type"] === undefined &&
		!isPassThroughBody(request.body)
	) {
		headers["content-type"] = "application/json";
	}
	return headers;
};

/**
 * Creates an {@link ApiClient} bound to the resolved CLI configuration.
 *
 * @param config - Global CLI configuration providing `apiUrl`, auth `token`,
 *   and the `fetch` implementation to use for HTTP calls.
 * @returns An `ApiClient` whose `invoke` method sends JSON requests to the
 *   configured backend and returns the parsed response body.
 * @throws {Error} When transport fails or the backend responds with a non-2xx
 *   status (mapped via {@link toApiError}).
 */
export const makeApiClient = (config: GlobalCliConfig): ApiClient => ({
	invoke: async (request) =>
		await Effect.runPromise(
			Effect.tryPromise({
				catch: (error) =>
					error instanceof Error
						? error
						: new Error("CLI transport invocation failed."),
				try: async () => {
					const url = new URL(
						withQuery(request.path, request.query),
						config.apiUrl
					);
					const response = await config.fetch(url.toString(), {
						body: toBody(request.body),
						headers: buildHeaders(config, request),
						method: request.method,
					});
					const parsed = await parseResponse(response);
					if (!response.ok) {
						throw toApiError({
							body: parsed,
							status: response.status,
						});
					}
					return parsed;
				},
			})
		),
});

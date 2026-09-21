import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "@effect/vitest";

import { createNodeSdk } from "#src/client";
import type { NodeSdkConfig } from "#src/types";

const RETRIABLE_STATUSES = [408, 429, 500, 502, 503, 504] as const;
const RETRY_MAX_ATTEMPTS = 3;

const makeSdk = (
	config: Pick<NodeSdkConfig, "fetch" | "retryMaxAttempts" | "timeoutMs">
) =>
	createNodeSdk({
		baseUrl: "https://example.test",
		...config,
	});

const fetchUntilAborted: NonNullable<NodeSdkConfig["fetch"]> = async (
	_input,
	init
) => {
	try {
		await delay(60_000, undefined, { signal: init?.signal });
	} catch {
		throw new DOMException("This operation was aborted.", "AbortError");
	}
	throw new DOMException("This operation was aborted.", "AbortError");
};

const retriableEnvelope = (status: number): Response =>
	Response.json(
		{
			error: {
				code: "INTERNAL_RUNTIME_ERROR",
				message: "still down",
				status,
			},
			ok: false,
		},
		{ status }
	);

const captureFailure = async (
	run: () => Promise<unknown>
): Promise<unknown> => {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error("expected the SDK call to fail");
};

describe("node-sdk callApi", () => {
	it("maps an abort timeout to SDK_TIMEOUT", async () => {
		let attempts = 0;
		const sdk = makeSdk({
			fetch: (input, init) => {
				attempts += 1;
				return fetchUntilAborted(input, init);
			},
			retryMaxAttempts: 1,
			timeoutMs: 20,
		});

		const error = await captureFailure(() => sdk.status());
		expect(error).toMatchObject({
			category: "timeout",
			code: "SDK_TIMEOUT",
			errorId: "DSAR-SDK-1102",
			name: "DsarSdkError",
			type: "dsar.sdk.error",
		});
		expect(attempts).toBe(1);
	});

	it("maps a thrown fetch failure to SDK_NETWORK_ERROR", async () => {
		let attempts = 0;
		const sdk = makeSdk({
			fetch: () => {
				attempts += 1;
				return Promise.reject(new TypeError("fetch failed"));
			},
			retryMaxAttempts: 1,
		});

		const error = await captureFailure(() => sdk.status());
		expect(error).toMatchObject({
			category: "network",
			code: "SDK_NETWORK_ERROR",
			errorId: "DSAR-SDK-1101",
			name: "DsarSdkError",
			type: "dsar.sdk.error",
		});
		expect(attempts).toBe(1);
	});

	it("maps a non-JSON success body to SDK_INVALID_ENVELOPE", async () => {
		const sdk = makeSdk({
			fetch: () =>
				Promise.resolve(
					new Response("<html>ok</html>", {
						headers: { "content-type": "text/html" },
						status: 200,
					})
				),
			retryMaxAttempts: 1,
		});

		const error = await captureFailure(() => sdk.status());
		expect(error).toMatchObject({
			category: "validation",
			code: "SDK_INVALID_ENVELOPE",
			errorId: "DSAR-SDK-1301",
			status: 200,
		});
	});

	it("maps truncated JSON to SDK_NETWORK_ERROR", async () => {
		const sdk = makeSdk({
			fetch: () =>
				Promise.resolve(
					new Response("{", {
						headers: { "content-type": "application/json" },
						status: 200,
					})
				),
			retryMaxAttempts: 1,
		});

		const error = await captureFailure(() => sdk.status());
		expect(error).toMatchObject({
			code: "SDK_NETWORK_ERROR",
			errorId: "DSAR-SDK-1101",
		});
	});

	it.each(RETRIABLE_STATUSES)(
		"exhausts retries on HTTP %s and returns the last envelope error",
		async (status) => {
			let attempts = 0;
			const sdk = makeSdk({
				fetch: () => {
					attempts += 1;
					return Promise.resolve(retriableEnvelope(status));
				},
				retryMaxAttempts: RETRY_MAX_ATTEMPTS,
			});

			const error = await captureFailure(() => sdk.status());
			expect(attempts).toBe(RETRY_MAX_ATTEMPTS);
			expect(error).toMatchObject({
				code: "INTERNAL_RUNTIME_ERROR",
				name: "DsarSdkError",
				status,
				type: "dsar.sdk.error",
			});
			expect(error).not.toMatchObject({ code: "SDK_RETRY_FAILED" });
		}
	);

	it("exhausts retries when fetch throws and returns SDK_NETWORK_ERROR", async () => {
		let attempts = 0;
		const sdk = makeSdk({
			fetch: () => {
				attempts += 1;
				return Promise.reject(new TypeError("fetch failed"));
			},
			retryMaxAttempts: RETRY_MAX_ATTEMPTS,
		});

		const error = await captureFailure(() => sdk.status());
		expect(attempts).toBe(RETRY_MAX_ATTEMPTS);
		expect(error).toMatchObject({
			code: "SDK_NETWORK_ERROR",
			errorId: "DSAR-SDK-1101",
		});
		expect(error).not.toMatchObject({ code: "SDK_RETRY_FAILED" });
	});
});

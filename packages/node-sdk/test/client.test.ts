import { dsarInstance } from "@dsar/backend";
import { makeMinimalPersistenceSync } from "@dsar/backend/testing/minimal-persistence";
import { describe, expect, it, vi } from "@effect/vitest";

/* oxlint-disable max-statements, require-await, jest/max-expects */
/* oxlint-disable jest/no-conditional-in-test */
/* oxlint-disable unicorn/prefer-response-static-json */
/* oxlint-disable @typescript-eslint/no-dynamic-delete */
import { createNodeSdk } from "#src/client";
import { normalizeHttpFailure } from "#src/error";
import { isRetriableHttpStatus } from "#src/fetcher";
import type { NodeSdkConfig } from "#src/types";

const TEST_API_TOKEN = "sdk-test-token";
const TEST_RUNTIME_AUTH = {
	config: {
		auth: {
			staticBearerTokens: {
				[TEST_API_TOKEN]: {
					actorId: "sdk-client",
					role: "member",
					tenantId: "tenant-default",
				},
			},
		},
	},
} as const;

const makeRuntimeFetch = () => {
	const runtime = dsarInstance({
		...TEST_RUNTIME_AUTH,
		repos: { persistence: makeMinimalPersistenceSync() },
	});
	return async (url: string | URL | Request, init?: RequestInit) =>
		runtime.handler(
			new Request(
				typeof url === "string" || url instanceof URL
					? url.toString()
					: url.url,
				init
			)
		);
};

const makeRuntimeFetchWithBasePath = (basePath: string) => {
	const runtime = dsarInstance({
		...TEST_RUNTIME_AUTH,
		basePath,
		repos: { persistence: makeMinimalPersistenceSync() },
	});
	return async (url: string | URL | Request, init?: RequestInit) =>
		runtime.handler(
			new Request(
				typeof url === "string" || url instanceof URL
					? url.toString()
					: url.url,
				init
			)
		);
};

const withEnv = async (
	values: Record<string, string | undefined>,
	run: () => Promise<void>
) => {
	const previous: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(values)) {
		previous[key] = process.env[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	try {
		await run();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
};

describe("@dsar/node-sdk client", () => {
	it("uses env fallback for base url and token", async () => {
		let requestAuth = "";
		const configFetch: NodeSdkConfig["fetch"] = async (_input, init) => {
			requestAuth = new Headers(init?.headers).get("authorization") ?? "";
			return new Response(
				JSON.stringify({
					data: { service: "@dsar/backend", status: "ok" },
					ok: true,
				}),
				{
					headers: { "content-type": "application/json" },
					status: 200,
				}
			);
		};
		await withEnv(
			{
				DSAR_API_TOKEN: "env-token",
				DSAR_API_URL: "https://example.test/api/v1",
			},
			async () => {
				const sdk = createNodeSdk({ fetch: configFetch });
				const response = await sdk.status();
				expect(response.unwrap().status).toBe("ok");
				expect(requestAuth).toBe("Bearer env-token");
			}
		);
	});

	it("retries retriable status codes and succeeds", async () => {
		let attempts = 0;
		const sdk = createNodeSdk({
			baseUrl: "https://example.test",
			fetch: async () => {
				attempts += 1;
				if (attempts === 1) {
					return new Response(
						JSON.stringify({
							error: {
								code: "INTERNAL_RUNTIME_ERROR",
								message: "temporary outage",
								status: 503,
							},
							ok: false,
						}),
						{
							headers: { "content-type": "application/json" },
							status: 503,
						}
					);
				}
				return new Response(
					JSON.stringify({
						data: { service: "@dsar/backend", status: "ok" },
						ok: true,
					}),
					{
						headers: { "content-type": "application/json" },
						status: 200,
					}
				);
			},
			retryMaxAttempts: 2,
		});
		const status = await sdk.status();
		expect(status.expect().status).toBe("ok");
		expect(attempts).toBe(2);
	});

	it("supports result helpers and MVP request methods against runtime", async () => {
		const sdk = createNodeSdk({
			baseUrl: "https://example.test",
			fetch: makeRuntimeFetch(),
			token: TEST_API_TOKEN,
		});
		const created = await sdk.requests.create({
			intakeSource: {
				channel: "api",
				rawText: "please provide my data",
				receivedAt: "2026-01-01T00:00:00.000Z",
				type: "api",
			},
			jurisdiction: "uk",
		});
		const createdData = created.unwrap();
		expect(createdData.status).toBe("captured");
		const requestId = createdData.id;
		const list = await sdk.requests.list();
		expect(list.unwrap().items).toHaveLength(1);
		const explain = await sdk.requests.clockExplain(requestId);
		expect(explain.unwrap().finalDueAt).toBeDefined();
		const timeline = await sdk.requests.timeline(requestId);
		expect(timeline.unwrap().events.length).toBeGreaterThanOrEqual(1);
		const verification = await sdk.requests.verificationRequest(requestId, {});
		expect(verification.unwrap().status).toBe("verification_pending");
		const refusal = await sdk.requests.refuse(requestId, {
			rationale: "test refusal",
		});
		expect(refusal.unwrap().status).toBe("refused");
		const notifications = await sdk.requests.notifications(requestId);
		expect(notifications.unwrap().events.length).toBeGreaterThan(0);
	});

	it("preserves base path prefixes when joining request URLs", async () => {
		const sdk = createNodeSdk({
			baseUrl: "https://example.test/api/v1",
			fetch: makeRuntimeFetchWithBasePath("/api/v1"),
			token: TEST_API_TOKEN,
		});

		const list = await sdk.requests.list();
		expect(list.unwrap().items).toHaveLength(0);
	});

	it("classifies retriable status values", () => {
		expect(isRetriableHttpStatus(429)).toBeTruthy();
		expect(isRetriableHttpStatus(503)).toBeTruthy();
		expect(isRetriableHttpStatus(400)).toBeFalsy();
	});

	it("retains backend error id/docs URL as top-level sdk fields", async () => {
		const sdk = createNodeSdk({
			baseUrl: "https://example.test",
			fetch: async () =>
				new Response(
					JSON.stringify({
						error: {
							code: "INTERNAL_RUNTIME_ERROR",
							docsUrl: "https://dsar-sdk.dev/errors/dsar-be-1500",
							id: "DSAR-BE-1500",
							message: "Unhandled runtime error.",
							status: 500,
						},
						ok: false,
					}),
					{
						headers: { "content-type": "application/json" },
						status: 500,
					}
				),
			retryMaxAttempts: 1,
		});

		const err = await sdk.status().catch((error: unknown) => error);
		expect(err).toBeInstanceOf(Error);
		const { message } = err as Error;
		expect(message).toContain("INTERNAL_RUNTIME_ERROR");
		expect(message).toContain("DSAR-BE-1500");
		expect(message).toContain("https://dsar-sdk.dev/errors/dsar-be-1500");
	});

	it("enriches sdk-native failures with catalog docs metadata", async () => {
		const sdk = createNodeSdk({
			baseUrl: "https://example.test",
			fetch: async () =>
				new Response(JSON.stringify({ data: { status: "ok" } }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
			retryMaxAttempts: 1,
		});

		const err = await sdk.status().catch((error: unknown) => error);
		expect(err).toBeInstanceOf(Error);
		const { message } = err as Error;
		expect(message).toContain("SDK_INVALID_ENVELOPE");
		expect(message).toContain("DSAR-SDK-1301");
		expect(message).toContain("https://dsar-sdk.dev/errors/dsar-sdk-1301");
	});

	it("maps backend error.id to sdk errorId and never exposes id or details", () => {
		const sdkError = normalizeHttpFailure({
			body: {
				error: {
					code: "LIFECYCLE_TRANSITION_DISALLOWED",
					docsUrl: "https://dsar-sdk.dev/errors/dsar-be-1401",
					id: "DSAR-BE-1401",
					message:
						'Lifecycle transition disallowed: cannot apply "extension" from "captured" state.',
					status: 409,
					trace: {
						lifecycle: {
							allowedTransitions: ["verification_request"],
							attemptedTransition: "extension",
							currentState: "captured",
						},
					},
				},
				ok: false,
			},
			status: 409,
		});

		expect(sdkError.type).toBe("dsar.sdk.error");
		expect(sdkError.name).toBe("DsarSdkError");
		expect(sdkError.errorId).toBe("DSAR-BE-1401");
		expect(sdkError.docsUrl).toBe("https://dsar-sdk.dev/errors/dsar-be-1401");
		expect(sdkError.code).toBe("LIFECYCLE_TRANSITION_DISALLOWED");
		expect(sdkError).not.toHaveProperty("id");
		expect(sdkError).not.toHaveProperty("details");
		expect(sdkError.meta).toBeDefined();
		expect(sdkError.meta).toStrictEqual({
			lifecycle: {
				allowedTransitions: ["verification_request"],
				attemptedTransition: "extension",
				currentState: "captured",
			},
		});
	});

	it("does not include lifecycle context for non-lifecycle errors", () => {
		const sdkError = normalizeHttpFailure({
			body: {
				error: {
					code: "REQUEST_VALIDATION_FAILED",
					docsUrl: "https://dsar-sdk.dev/errors/dsar-be-1199",
					id: "DSAR-BE-1199",
					message: "Validation failed.",
					status: 400,
				},
				ok: false,
			},
			status: 400,
		});

		expect(sdkError.type).toBe("dsar.sdk.error");
		expect(sdkError.errorId).toBe("DSAR-BE-1199");
		expect(sdkError.meta).toBeUndefined();
	});

	it("dispatches a webhook through sdk.webhooks.receiver()", async () => {
		const sdk = createNodeSdk({
			baseUrl: "http://localhost:3000/api/v1",
			token: TEST_API_TOKEN,
		});
		const verify = vi.fn().mockResolvedValue();
		const handler = vi.fn();
		const receiver = sdk.webhooks.receiver({
			handlers: { request_captured: handler },
			signingSecret: "test-secret",
			verify,
		});
		const rawBody = JSON.stringify({
			correlationId: "corr_1",
			eventId: "evt_1",
			eventType: "request_captured",
			idempotencyKey: "idem_1",
			locale: "en-US",
			payload: { source: "test" },
			policyVersion: "2026.1",
			requestId: "req_1",
		});

		const result = await receiver.handle({
			rawBody,
			signature: "valid-signature",
		});

		expect(verify).toHaveBeenCalledWith({
			payload: rawBody,
			signature: "valid-signature",
			signingSecret: "test-secret",
		});
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				eventId: "evt_1",
				eventType: "request_captured",
				requestId: "req_1",
			})
		);
		expect(result).toEqual({ body: { ok: true }, status: 200 });
	});
});

import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type {
	ErrorEnvelope,
	NotificationAdapterContract,
	StorageAdapterContract,
} from "../src";
import { assertTenantOptions, dsarInstance, isOriginTrusted } from "../src";
import {
	TEST_ADMIN_HEADERS,
	TEST_ADMIN_TOKEN,
	TEST_RUNTIME_AUTH,
} from "./auth";
import { makeMemoryPersistence } from "./e2e/fixtures";

type WideEvent = Readonly<Record<string, unknown>>;

const OTHER_TENANT_TOKEN = "other-tenant-token";
const UNSCOPED_TOKEN = "unscoped-token";

const authWithExtraTokens = {
	staticBearerTokens: {
		...TEST_RUNTIME_AUTH.config.auth.staticBearerTokens,
		[OTHER_TENANT_TOKEN]: {
			actorId: "other-admin",
			principalKind: "operator" as const,
			role: "admin",
			tenantId: "tenant-other",
		},
		[UNSCOPED_TOKEN]: {
			actorId: "gateway",
			principalKind: "service" as const,
			role: "admin",
		},
	},
};

const recordEvents = () => {
	const events: WideEvent[] = [];
	return {
		drain: ({ event }: { readonly event: WideEvent }) => {
			events.push(event);
		},
		events,
	};
};

const makeMemoryStorage = (): StorageAdapterContract => {
	const objects = new Map<
		string,
		{ readonly bytes: Uint8Array; readonly contentType: string }
	>();
	const missing = (key: string) => new Error(`Missing object ${key}`);
	return {
		capability: "storage",
		deleteObject: (key) =>
			Effect.succeed({ deleted: objects.delete(key), key }),
		diagnostics: () =>
			Effect.succeed({ capability: "storage", key: "memory-storage" }),
		getObject: (key) => {
			const object = objects.get(key);
			return object
				? Effect.succeed({
						bytes: object.bytes,
						contentType: object.contentType,
						key,
						metadata: {
							contentType: object.contentType,
							key,
							sizeBytes: object.bytes.byteLength,
						},
					})
				: Effect.fail(missing(key));
		},
		headObject: (key) => {
			const object = objects.get(key);
			return object
				? Effect.succeed({
						contentType: object.contentType,
						key,
						sizeBytes: object.bytes.byteLength,
					})
				: Effect.fail(missing(key));
		},
		healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
		init: () => Effect.void,
		key: "memory-storage",
		putObject: (input) => {
			objects.set(input.key, {
				bytes: input.bytes,
				contentType: input.contentType,
			});
			return Effect.succeed({
				key: input.key,
				metadata: {
					contentType: input.contentType,
					key: input.key,
					requestId: input.requestId,
					sizeBytes: input.bytes.byteLength,
				},
				reference: { key: input.key, requestId: input.requestId },
			});
		},
		validateConfig: () => Effect.void,
	} as StorageAdapterContract;
};

describe(assertTenantOptions, () => {
	it.each([
		[{ requireTenantId: true }, "tenantId is missing"],
		[{ tenantId: "" }, "empty or has surrounding whitespace"],
		[{ tenantId: " tenant-a" }, "empty or has surrounding whitespace"],
	])("refuses %j", (options, message) => {
		expect(() => assertTenantOptions(options)).toThrow(message);
	});

	it("refuses a non-string tenantId from an untyped config", () => {
		expect(() =>
			assertTenantOptions({ tenantId: null as unknown as string })
		).toThrow(TypeError);
	});

	it("builds no instance from refused tenant options", () => {
		expect(() =>
			dsarInstance({
				repos: { persistence: makeMemoryPersistence() },
				requireTenantId: true,
			})
		).toThrow("tenantId is missing");
	});
});

describe("tenant-bound instance", () => {
	const makeBound = () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			config: { auth: authWithExtraTokens },
			observability: { drain: recorder.drain, level: "info" },
			repos: { persistence: makeMemoryPersistence() },
			tenantId: "tenant-default",
		});
		return { instance, recorder };
	};

	it("refuses credentials scoped to another tenant", async () => {
		const { instance } = makeBound();

		const response = await instance.handler(
			new Request("https://example.test/requests", {
				headers: { authorization: `Bearer ${OTHER_TENANT_TOKEN}` },
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.error.code]).toStrictEqual([
			403,
			"AUTH_REQUEST_ACCESS_FORBIDDEN",
		]);
	});

	it("acts for its tenant when credentials name none", async () => {
		const { instance, recorder } = makeBound();

		const response = await instance.handler(
			new Request("https://example.test/requests", {
				headers: { authorization: `Bearer ${UNSCOPED_TOKEN}` },
			})
		);

		expect(response.status).toBe(200);
		await vi.waitFor(() => expect(recorder.events).toHaveLength(1));
		expect(recorder.events[0]).toMatchObject({
			dsar: { principalKind: "service", tenantId: "tenant-default" },
		});
	});

	it("still refuses credentials without a tenant when unbound", async () => {
		const instance = dsarInstance({
			config: { auth: authWithExtraTokens },
			observability: { level: "silent" },
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await instance.handler(
			new Request("https://example.test/requests", {
				headers: { authorization: `Bearer ${UNSCOPED_TOKEN}` },
			})
		);

		expect(response.status).toBe(401);
	});
});

describe("request logging", () => {
	it("emits nothing for a successful request at the default level", async () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			observability: { drain: recorder.drain },
			repos: { persistence: makeMemoryPersistence() },
		});

		const ok = await instance.handler(
			new Request("https://example.test/status")
		);
		const unauthenticated = await instance.handler(
			new Request("https://example.test/requests")
		);

		expect([ok.status, unauthenticated.status]).toStrictEqual([200, 401]);
		await vi.waitFor(() => expect(recorder.events).toHaveLength(1));
		expect(recorder.events[0]).toMatchObject({
			dsar: { route: "GET /requests" },
			error: { code: "AUTH_ACTOR_CONTEXT_MISSING", status: 401 },
			level: "warn",
			status: 401,
		});
	});

	it("does not put the bearer token on the event", async () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			observability: { drain: recorder.drain, level: "info" },
			repos: { persistence: makeMemoryPersistence() },
		});

		await instance.handler(
			new Request("https://example.test/requests", {
				headers: TEST_ADMIN_HEADERS,
			})
		);

		await vi.waitFor(() => expect(recorder.events).toHaveLength(1));
		expect(JSON.stringify(recorder.events)).not.toContain(TEST_ADMIN_TOKEN);
	});
});

describe("cross-origin requests", () => {
	const instance = dsarInstance({
		...TEST_RUNTIME_AUTH,
		observability: { level: "silent" },
		repos: { persistence: makeMemoryPersistence() },
		trustedOrigins: ["https://app.example.com", "https://*.inth.app"],
	});

	it.each([
		["https://app.example.com", true],
		["https://acme.inth.app", true],
		["https://inth.app", false],
		["http://acme.inth.app", false],
		["https://evil.example.com", false],
	])(
		"answers a preflight from %s with CORS headers: %s",
		async (origin, allowed) => {
			const response = await instance.handler(
				new Request("https://example.test/requests", {
					headers: {
						"access-control-request-method": "POST",
						origin,
					},
					method: "OPTIONS",
				})
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("access-control-allow-origin")).toBe(
				allowed ? origin : null
			);
		}
	);

	it("matches a wildcard against subdomains only", () => {
		expect(
			isOriginTrusted("https://a.b.inth.app", ["https://*.inth.app"])
		).toBe(true);
		expect(isOriginTrusted("https://inth.app", ["https://*.inth.app"])).toBe(
			false
		);
		expect(isOriginTrusted("https://notinth.app", ["https://*.inth.app"])).toBe(
			false
		);
	});
});

describe("response bodies", () => {
	it("returns a downloaded artifact byte for byte", async () => {
		// Not valid UTF-8: a text round trip would replace these bytes.
		const bytes = new Uint8Array([
			0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x80,
		]);
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: { storage: makeMemoryStorage() },
			observability: { level: "silent" },
			repos: { persistence: makeMemoryPersistence() },
		});

		const upload = await instance.handler(
			new Request(
				"https://example.test/requests/req-binary/manifest/artifact/upload",
				{
					body: bytes,
					headers: {
						...TEST_ADMIN_HEADERS,
						"content-type": "application/octet-stream",
						"x-artifact-content-type": "application/pdf",
						"x-artifact-filename": "export.pdf",
					},
					method: "POST",
				}
			)
		);
		expect(upload.status).toBe(202);
		const { data } = (await upload.json()) as {
			readonly data: { readonly artifactId: string };
		};

		const download = await instance.handler(
			new Request(
				`https://example.test/requests/req-binary/manifest/artifact/download?artifactId=${data.artifactId}`,
				{ headers: TEST_ADMIN_HEADERS }
			)
		);

		expect(download.status).toBe(200);
		expect(new Uint8Array(await download.arrayBuffer())).toStrictEqual(bytes);
	});
});

describe("webhook retries without a worker", () => {
	it("delivers due retries when the host runs a pass", async () => {
		const persistence = makeMemoryPersistence();
		await Effect.runPromise(
			persistence.notificationEvents.append({
				correlationId: "corr-due",
				createdAt: "1970-01-01T00:00:00.000Z",
				eventType: "request_captured",
				id: "ne-due",
				idempotencyKey: "idem-due",
				locale: "en-GB",
				payload: {},
				policyVersion: "policy-v1",
				requestId: "req-due",
			})
		);
		await Effect.runPromise(
			persistence.notificationDeliveryAttempts.append({
				attempt: 1,
				channel: "webhook",
				createdAt: "1970-01-01T00:00:00.000Z",
				destination: "https://tenant.example/webhook",
				id: "nda-due",
				nextAttemptAt: "1970-01-01T00:00:00.000Z",
				notificationEventId: "ne-due",
				requestId: "req-due",
				status: "pending",
			})
		);
		let sent = 0;
		const notifications: NotificationAdapterContract = {
			capability: "notifications",
			channels: ["webhook"],
			diagnostics: () =>
				Effect.succeed({ capability: "notifications", key: "test" }),
			healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
			init: () => Effect.void,
			key: "test",
			send: () =>
				Effect.sync(() => {
					sent += 1;
					return { responseCode: 202, status: "delivered" as const };
				}),
			validateConfig: () => Effect.void,
		};
		const instance = dsarInstance({
			adapters: { notifications },
			config: {
				notificationWebhook: {
					retryDelayMs: 1,
					retryMaxAttempts: 3,
					signingSecret: "secret",
					tenantScoped: true,
					timeoutMs: 1000,
					url: "https://tenant.example/webhook",
				},
			},
			observability: { level: "silent" },
			repos: { persistence },
			tenantId: "tenant-default",
		});

		await instance.runWebhookRetries();

		expect(sent).toBe(1);
		const job = await Effect.runPromise(
			persistence.notificationDeliveryAttempts.getById("nda-due")
		);
		expect(job.status).toBe("delivered");
		await instance.dispose();
	});
});

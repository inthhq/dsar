import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withTenant } from "@dsar/persistence";
import type { PersistenceService } from "@dsar/persistence";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { initLogger } from "evlog";

import { makeSqlitePersistenceService } from "../../persistence-sqlite/src";
import type {
	ErrorEnvelope,
	InboundAdapterContract,
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
	it("emits nothing for a successful request at the warn level", async () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			observability: { drain: recorder.drain, level: "warn" },
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

	it("leaves the host's evlog configuration in place by default", async () => {
		const host = recordEvents();
		// The host drops every info event and drains to its own pipeline.
		initLogger({ drain: host.drain, sampling: { rates: { info: 0 } } });
		try {
			const instance = dsarInstance({
				...TEST_RUNTIME_AUTH,
				observability: { service: "dsar" },
				repos: { persistence: makeMemoryPersistence() },
			});

			await instance.handler(new Request("https://example.test/status"));
			await instance.handler(new Request("https://example.test/requests"));

			await vi.waitFor(() => expect(host.events).toHaveLength(1));
			expect(host.events[0]).toMatchObject({ service: "dsar", status: 401 });
		} finally {
			initLogger();
		}
	});

	it("puts the request id on events for unmatched routes", async () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			basePath: "/api/dsar",
			observability: { drain: recorder.drain, level: "warn" },
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await instance.handler(
			new Request("https://example.test/elsewhere")
		);

		expect(response.status).toBe(404);
		await vi.waitFor(() => expect(recorder.events).toHaveLength(1));
		expect(recorder.events[0]).toMatchObject({
			dsar: { requestId: expect.any(String) },
			error: { code: "REQUEST_ROUTE_NOT_FOUND" },
		});
	});

	it("keeps error messages and stacks off 4xx events", async () => {
		const recorder = recordEvents();
		const instance = dsarInstance({
			...TEST_RUNTIME_AUTH,
			observability: { drain: recorder.drain, level: "warn" },
			repos: { persistence: makeMemoryPersistence() },
		});

		// Rejected inside auth resolution, which throws.
		await instance.handler(
			new Request("https://example.test/requests", {
				headers: { authorization: "Bearer unknown-token" },
			})
		);

		await vi.waitFor(() => expect(recorder.events).toHaveLength(1));
		expect(recorder.events[0]).toMatchObject({ status: 401 });
		expect(recorder.events[0]?.error).toStrictEqual({
			code: "AUTH_ACTOR_CONTEXT_MISSING",
			id: "DSAR-BE-1001",
			status: 401,
		});
	});

	it("redacts the console line when DSAR configures evlog", async () => {
		const lines: string[] = [];
		const capture = (...args: unknown[]) => {
			lines.push(
				args.map((arg) => JSON.stringify(arg) ?? String(arg)).join(" ")
			);
		};
		const spies = (["log", "info", "warn", "error"] as const).map((method) =>
			vi.spyOn(console, method).mockImplementation(capture)
		);
		try {
			const instance = dsarInstance({
				...TEST_RUNTIME_AUTH,
				observability: { level: "warn" },
				repos: { persistence: makeMemoryPersistence() },
			});

			await instance.handler(
				new Request("https://example.test/subjects/jane@example.com")
			);

			await vi.waitFor(() => expect(lines.join("\n")).toContain("/subjects/"));
			expect(lines.join("\n")).not.toContain("jane@example.com");
		} finally {
			for (const spy of spies) {
				spy.mockRestore();
			}
			initLogger();
		}
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

	it.each([
		["a successful route", "/status", 200],
		["a rejected request", "/requests", 401],
		["an unmatched route", "/elsewhere", 404],
	])("adds CORS headers to %s", async (_label, path, status) => {
		const response = await instance.handler(
			new Request(`https://example.test${path}`, {
				headers: { origin: "https://app.example.com" },
			})
		);

		expect(response.status).toBe(status);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"https://app.example.com"
		);
		expect(response.headers.get("access-control-allow-credentials")).toBe(
			"true"
		);
	});

	it("answers any origin with a literal * and no credentials", async () => {
		const open = dsarInstance({
			...TEST_RUNTIME_AUTH,
			observability: { level: "silent" },
			repos: { persistence: makeMemoryPersistence() },
			trustedOrigins: ["*"],
		});

		const response = await open.handler(
			new Request("https://example.test/status", {
				headers: { origin: "https://evil.example.com" },
			})
		);

		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-credentials")).toBeNull();
	});

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

describe("tenant-bound background work", () => {
	const seedDueAttempt = (
		persistence: PersistenceService,
		tenantId: string
	): Promise<void> =>
		Effect.runPromise(
			Effect.gen(function* seedDueAttemptProgram() {
				yield* persistence.requests.create({
					appeals: [],
					authority: {},
					capture: {
						intakeSource: {
							channel: "portal",
							receivedAt: "1970-01-01T00:00:00.000Z",
							type: "portal",
						},
						subject: { subjectId: `subject-${tenantId}` },
					},
					clockMode: "policy_controlled",
					dueAt: "1970-02-01T00:00:00.000Z",
					id: `req-${tenantId}`,
					receivedAt: "1970-01-01T00:00:00.000Z",
					requestor: { email: "subject@example.com", type: "subject" },
					status: "in_progress",
				});
				yield* persistence.notificationEvents.append({
					correlationId: `corr-${tenantId}`,
					createdAt: "1970-01-01T00:00:00.000Z",
					eventType: "request_captured",
					id: `ne-${tenantId}`,
					idempotencyKey: `idem-${tenantId}`,
					locale: "en-GB",
					payload: {},
					policyVersion: "policy-v1",
					requestId: `req-${tenantId}`,
				});
				yield* persistence.notificationDeliveryAttempts.append({
					attempt: 1,
					channel: "webhook",
					createdAt: "1970-01-01T00:00:00.000Z",
					destination: "https://tenant.example/webhook",
					id: `nda-${tenantId}`,
					nextAttemptAt: "1970-01-01T00:00:00.000Z",
					notificationEventId: `ne-${tenantId}`,
					requestId: `req-${tenantId}`,
					status: "pending",
				});
			}).pipe(withTenant(tenantId))
		);

	const attemptStatus = (
		persistence: PersistenceService,
		tenantId: string
	): Promise<string> =>
		Effect.runPromise(
			persistence.notificationDeliveryAttempts.getById(`nda-${tenantId}`).pipe(
				Effect.map((attempt) => attempt.status),
				withTenant(tenantId)
			)
		);

	it("only drains its own tenant's retries in the background worker", async () => {
		const root = await mkdtemp(join(tmpdir(), "dsar-worker-tenant-"));
		const persistence = await makeSqlitePersistenceService({
			create: true,
			filename: join(root, "dsar.sqlite"),
		});
		await seedDueAttempt(persistence, "tenant-a");
		await seedDueAttempt(persistence, "tenant-b");
		const destinations: string[] = [];
		const notifications: NotificationAdapterContract = {
			capability: "notifications",
			channels: ["webhook"],
			diagnostics: () =>
				Effect.succeed({ capability: "notifications", key: "test" }),
			healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
			init: () => Effect.void,
			key: "test",
			send: (input) =>
				Effect.sync(() => {
					destinations.push(input.requestId);
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
					url: "https://tenant-a.example/webhook",
				},
			},
			observability: { level: "silent" },
			repos: { persistence },
			runWebhookRetryWorker: true,
			tenantId: "tenant-a",
		});

		try {
			// The worker picked up this tenant's job...
			await vi.waitFor(async () =>
				expect(await attemptStatus(persistence, "tenant-a")).not.toBe("pending")
			);
			// ...and never touched the other tenant's.
			expect(await attemptStatus(persistence, "tenant-b")).toBe("pending");
			expect(destinations).not.toContain("req-tenant-b");
		} finally {
			await instance.dispose();
			await rm(root, { force: true, recursive: true });
		}
	});

	it("refuses an inbound capture routed to another tenant", async () => {
		const persistence = makeMemoryPersistence();
		const inbound: InboundAdapterContract = {
			capability: "inbound",
			diagnostics: () =>
				Effect.succeed({ capability: "inbound", key: "resend" }),
			healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
			init: () => Effect.void,
			key: "resend",
			receive: () =>
				Effect.succeed({
					payload: {
						fromEmail: "jane@example.com",
						intent: { isDsar: true, reason: "matched token" },
						route: { jurisdiction: "uk", tenantId: "tenant-default" },
						subject: "Subject access request",
					},
					receivedAt: "2026-01-01T00:00:00.000Z",
					sourceId: "resend-cross-tenant",
				}),
			validateConfig: () => Effect.void,
		};
		const instance = dsarInstance({
			adapters: { inbound },
			observability: { level: "silent" },
			repos: { persistence },
			tenantId: "tenant-other",
		});

		const response = await instance.handler(
			new Request("https://example.test/webhooks/inbound/resend", {
				body: JSON.stringify({ type: "email.received" }),
				headers: {
					"content-type": "application/json",
					"svix-id": "svix-id-1",
					"svix-signature": "svix-signature-1",
					"svix-timestamp": "123",
				},
				method: "POST",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.error.code]).toStrictEqual([
			403,
			"AUTH_REQUEST_ACCESS_FORBIDDEN",
		]);
		expect(await Effect.runPromise(persistence.requests.list())).toHaveLength(
			0
		);
	});
});

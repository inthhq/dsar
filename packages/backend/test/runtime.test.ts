import { PersistenceInvalidRecordError, withTenant } from "@dsar/persistence";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type {
	ErrorEnvelope,
	InboundAdapterContract,
	RateLimitStore,
} from "../src";
import { dsarInstance } from "../src";
import {
	TEST_ADMIN_HEADERS,
	TEST_MEMBER_HEADERS,
	TEST_SUBJECT_HEADERS,
	TEST_RUNTIME_AUTH,
} from "./auth";
import { makeMemoryPersistence } from "./e2e/fixtures";

const actorHeaders = TEST_MEMBER_HEADERS;
const adminHeaders = TEST_ADMIN_HEADERS;
const subjectHeaders = TEST_SUBJECT_HEADERS;
const resolveTrustedRuntimeSubjectIdentity = () => ({
	actorId: "subject-ctx",
	principalKind: "subject" as const,
	role: "subject",
	tenantId: "tenant-default",
});

const seedRequest = async (
	persistence: ReturnType<typeof makeMemoryPersistence>,
	input?: {
		readonly id?: string;
		readonly policyPack?: string;
		readonly receivedAt?: string;
		readonly requestorEmail?: string;
		readonly status?: string;
		readonly subjectId?: string;
	}
): Promise<void> => {
	const receivedAt = input?.receivedAt ?? "2026-02-20T00:00:00.000Z";
	await Effect.runPromise(
		persistence.requests.create({
			appeals: [],
			authority: {},
			capture: {
				intakeSource: {
					channel: "portal",
					receivedAt,
					type: "portal",
				},
				...(input?.policyPack
					? {
							policy: {
								policyPack: input.policyPack,
							},
						}
					: {}),
				subject: {
					subjectId: input?.subjectId ?? "subject-1",
				},
			},
			clockMode: "policy_controlled",
			dueAt: "2026-03-20T00:00:00.000Z",
			id: input?.id ?? "req-owned",
			receivedAt,
			requestor: {
				email: input?.requestorEmail ?? "subject@example.com",
				type: "subject",
			},
			status: input?.status ?? "in_progress",
		})
	);
};

const filteredSubjectSeedInput = (index: number) => ({
	id: `req-filtered-${index.toString().padStart(2, "0")}`,
	policyPack: index % 2 === 0 ? "pack-a" : "pack-b",
	receivedAt: `2026-02-${(10 + index).toString().padStart(2, "0")}T00:00:00.000Z`,
	status: index % 2 === 0 ? "fulfilled" : "in_progress",
	subjectId: "subject-filtered",
});

const makePolicyPack = (version: string) => ({
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "uk",
	packId: "custom-uk-pack",
	sections: {
		appeals: {
			deadlineDays: 45,
			extensionDays: 30,
			mustBeEasyAsOriginalRequest: true,
			mustIncludeAGContactIfDenied: true,
			required: true,
		},
		audit: {
			requireClockExplainability: true,
			requireRuleTrace: true,
		},
		clock: {
			ackDeadlineBusinessDays: 10,
			ackRequired: true,
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 45,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
			rules: [],
			start: "receipt",
			verificationEffect: "stop_clock",
		},
		delivery: {
			allowedChannels: ["portal", "email", "secure_remote_access"],
			securityLevel: "token",
			stepUpRequired: false,
			tokenTtlSeconds: 86_400,
		},
		representation: {
			authorityEvidenceRequiredFor: ["representative", "authorised_agent"],
			enableDeliveryTargeting: true,
		},
		response: {
			allowedMediaTypes: ["application/json"],
			preferredFormatCapture: true,
			requireDownloadableCopyForRemoteAccess: true,
			requireManifest: true,
		},
		retention: {
			minimums: {
				audit_event: 365,
				delivery_log: 365,
				fulfilment_artifact: 365,
				notification_log: 365,
				request_record: 365,
				verification_evidence: 90,
			},
			verificationDeleteAfterProcessing: true,
		},
		verification: {
			allowedMethods: ["existing_auth", "email_link", "manual"],
			deleteCollectedDataAfterProcessing: true,
			redactionSupported: true,
			requiredWhen: "policy_controlled",
		},
	},
	version,
});

const makeSlackInboundFailureAdapter = (input: {
	readonly category: string;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
	readonly retriable: boolean;
}): InboundAdapterContract => ({
	capability: "inbound",
	diagnostics: () =>
		Effect.succeed({
			capability: "inbound",
			key: "slack",
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "slack",
	receive: () =>
		Effect.fail({
			_tag: "AdapterInvocationError",
			adapterKey: "slack",
			capability: "inbound",
			category: input.category,
			details: input.details,
			message: input.message,
			retriable: input.retriable,
		}),
	validateConfig: () => Effect.void,
});

const makeResendInboundFailureAdapter = (input: {
	readonly category: string;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
	readonly retriable: boolean;
}): InboundAdapterContract => ({
	capability: "inbound",
	diagnostics: () =>
		Effect.succeed({
			capability: "inbound",
			key: "resend",
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "resend",
	receive: () =>
		Effect.fail({
			_tag: "AdapterInvocationError",
			adapterKey: "resend",
			capability: "inbound",
			category: input.category,
			details: input.details,
			message: input.message,
			retriable: input.retriable,
		}),
	validateConfig: () => Effect.void,
});

const makeResendInboundSuccessAdapter = (
	sourceId = "resend-rate-limit-email"
): InboundAdapterContract => ({
	capability: "inbound",
	diagnostics: () =>
		Effect.succeed({
			capability: "inbound",
			key: "resend",
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "resend",
	receive: () =>
		Effect.succeed({
			payload: {
				from: "Jane Subject <jane@example.com>",
				fromEmail: "jane@example.com",
				intent: {
					isDsar: true,
					reason: "matched token",
				},
				route: {
					jurisdiction: "uk",
					tenantId: "tenant-default",
				},
				subject: "Subject access request",
				to: ["privacy@tenant.example"],
			},
			receivedAt: "2026-01-01T00:00:00.000Z",
			sourceId,
		}),
	validateConfig: () => Effect.void,
});

const makeResendWebhookRequest = (): Request =>
	new Request("https://example.test/webhooks/inbound/resend", {
		body: JSON.stringify({ type: "email.received" }),
		headers: {
			"content-type": "application/json",
			"svix-id": "svix-id-1",
			"svix-signature": "svix-signature-1",
			"svix-timestamp": "123",
		},
		method: "POST",
	});

describe(dsarInstance, () => {
	it("creates runtime handler and metadata", () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			config: {
				...TEST_RUNTIME_AUTH.config,
				auth: {
					...TEST_RUNTIME_AUTH.config.auth,
					resolveTrustedRequestIdentity: resolveTrustedRuntimeSubjectIdentity,
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});
		expectTypeOf(runtime.handler).toBeFunction();
		expect(runtime.app.routes.length).toBeGreaterThan(6);
		expect(runtime.context.config.enableManifestReview).toBeTruthy();
		expect(runtime.context.config.auth?.resolveTrustedRequestIdentity).toBe(
			resolveTrustedRuntimeSubjectIdentity
		);
	});

	it("rejects invalid basePath", () => {
		expect(() =>
			dsarInstance({
				...TEST_RUNTIME_AUTH,
				basePath: "api",
				repos: { persistence: makeMemoryPersistence() },
			})
		).toThrow("basePath must start with '/'");
	});

	it("rewrites basePath before route matching", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			basePath: "/api/v1",
			repos: { persistence: makeMemoryPersistence() },
		});
		const response = await runtime.handler(
			new Request("https://example.test/api/v1/status", { method: "GET" })
		);
		expect(response.status).toBe(200);
	});

	it("returns normalized error envelopes", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const notFound = await runtime.handler(
			new Request("https://example.test/unknown", { method: "GET" })
		);
		const unauthorized = await runtime.handler(
			new Request("https://example.test/requests/req-1", { method: "GET" })
		);
		const badPayload = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);

		const notFoundBody = (await notFound.json()) as {
			readonly error: {
				readonly code: string;
				readonly docsUrl: string;
				readonly id: string;
			};
		};
		const unauthorizedBody = (await unauthorized.json()) as {
			readonly error: {
				readonly code: string;
				readonly docsUrl: string;
				readonly id: string;
			};
		};
		const badPayloadBody = (await badPayload.json()) as {
			readonly error: {
				readonly code: string;
				readonly docsUrl: string;
				readonly id: string;
			};
		};

		expect([
			notFound.status,
			notFoundBody.error.code,
			unauthorized.status,
			unauthorizedBody.error.code,
		] as const).toStrictEqual([
			404,
			"REQUEST_ROUTE_NOT_FOUND",
			401,
			"AUTH_ACTOR_CONTEXT_MISSING",
		]);
		expect([400, 500]).toContain(badPayload.status);
		expect(["REQUEST_VALIDATION_FAILED", "INTERNAL_RUNTIME_ERROR"]).toContain(
			badPayloadBody.error.code
		);
		expect([
			{
				docsUrl: notFoundBody.error.docsUrl,
				id: notFoundBody.error.id,
			},
			{
				docsUrl: unauthorizedBody.error.docsUrl,
				id: unauthorizedBody.error.id,
			},
		]).toStrictEqual([
			{
				docsUrl: expect.stringContaining("/dsar-be-1201"),
				id: "DSAR-BE-1201",
			},
			{
				docsUrl: expect.stringContaining("/dsar-be-1001"),
				id: "DSAR-BE-1001",
			},
		]);
		expect(badPayloadBody.error.docsUrl).toContain(
			"https://dsar-sdk.dev/errors/"
		);
	});

	it("rotates configured webhook endpoint signing keys and audits the change", async () => {
		const basePersistence = makeMemoryPersistence();
		const auditEvents: unknown[] = [];
		const baseAuditEvents = basePersistence.auditEvents;
		const persistence = {
			...basePersistence,
			auditEvents: {
				append: (input: Parameters<typeof baseAuditEvents.append>[0]) => {
					auditEvents.push(input);
					return baseAuditEvents.append(input);
				},
				listByRequestId: baseAuditEvents.listByRequestId,
			},
		};
		const runtime = dsarInstance({
			config: {
				...TEST_RUNTIME_AUTH.config,
				notificationWebhook: {
					endpointId: "default",
					retryDelayMs: 1,
					retryMaxAttempts: 1,
					signingSecret: "old-secret",
					tenantScoped: true,
					timeoutMs: 1000,
					url: "https://tenant.example/webhook",
				},
			},
			repos: { persistence },
		});

		const unauthorized = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/default/rotate-key",
				{ method: "POST" }
			)
		);
		expect(unauthorized.status).toBe(401);

		const forbiddenSubject = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/default/rotate-key",
				{
					body: "{}",
					headers: {
						"content-type": "application/json",
						...subjectHeaders,
					},
					method: "POST",
				}
			)
		);
		expect(forbiddenSubject.status).toBe(403);

		for (const invalidGracePeriod of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
			const invalid = await runtime.handler(
				new Request(
					"https://example.test/webhooks/endpoints/default/rotate-key",
					{
						body: JSON.stringify({ gracePeriodDays: invalidGracePeriod }),
						headers: {
							"content-type": "application/json",
							...adminHeaders,
						},
						method: "POST",
					}
				)
			);
			expect(invalid.status).toBe(400);
		}

		const response = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/default/rotate-key",
				{
					body: JSON.stringify({ gracePeriodDays: 0 }),
					headers: {
						"content-type": "application/json",
						...adminHeaders,
					},
					method: "POST",
				}
			)
		);
		const body = (await response.json()) as {
			readonly data: {
				readonly activeKeyIds: readonly string[];
				readonly endpointId: string;
				readonly newPrimaryKeyId: string;
				readonly newSigningSecret: string;
				readonly previousKeyExpiresAt?: string;
				readonly previousKeyId?: string;
			};
		};

		expect(response.status).toBe(200);
		expect(body.data.endpointId).toBe("default");
		expect(body.data.newSigningSecret).not.toBe("old-secret");
		expect(body.data.previousKeyId).toBe("default:primary");
		expect(body.data.previousKeyExpiresAt).toBeDefined();
		expect(body.data.activeKeyIds).toContain(body.data.newPrimaryKeyId);
		expect(JSON.stringify(body)).not.toContain("old-secret");
		expect(auditEvents).toHaveLength(1);
		expect(auditEvents[0]).toMatchObject({
			action: "webhook_signing_key_rotated",
			actor: "tester-admin",
			object: "webhook_endpoint:default",
		});
	});

	it("defaults omitted webhook signing key rotation grace period", async () => {
		const runtime = dsarInstance({
			config: {
				...TEST_RUNTIME_AUTH.config,
				notificationWebhook: {
					endpointId: "default",
					retryDelayMs: 1,
					retryMaxAttempts: 1,
					signingSecret: "old-secret",
					tenantScoped: true,
					timeoutMs: 1000,
					url: "https://tenant.example/webhook",
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/default/rotate-key",
				{
					headers: adminHeaders,
					method: "POST",
				}
			)
		);
		const body = (await response.json()) as {
			readonly data: { readonly previousKeyExpiresAt?: string };
		};

		expect(response.status).toBe(200);
		expect(body.data.previousKeyExpiresAt).toBeDefined();
	});

	it("returns not found when rotating a missing webhook endpoint", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/missing/rotate-key",
				{
					body: "{}",
					headers: {
						"content-type": "application/json",
						...adminHeaders,
					},
					method: "POST",
				}
			)
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect(response.status).toBe(404);
		expect(body.error.code).toBe("PERSISTENCE_ENTITY_NOT_FOUND");
	});

	it("rolls back webhook signing key rotation when audit append fails", async () => {
		const basePersistence = makeMemoryPersistence();
		const baseAuditEvents = basePersistence.auditEvents;
		const persistence = {
			...basePersistence,
			auditEvents: {
				append: (_input: Parameters<typeof baseAuditEvents.append>[0]) =>
					Effect.fail(
						new PersistenceInvalidRecordError({
							entity: "audit_events",
							field: "hash",
							value: "audit unavailable",
						})
					),
				listByRequestId: baseAuditEvents.listByRequestId,
			},
		};
		const runtime = dsarInstance({
			config: {
				...TEST_RUNTIME_AUTH.config,
				notificationWebhook: {
					endpointId: "default",
					retryDelayMs: 1,
					retryMaxAttempts: 1,
					signingSecret: "old-secret",
					tenantScoped: true,
					timeoutMs: 1000,
					url: "https://tenant.example/webhook",
				},
			},
			repos: { persistence },
		});

		const response = await runtime.handler(
			new Request(
				"https://example.test/webhooks/endpoints/default/rotate-key",
				{
					body: "{}",
					headers: {
						"content-type": "application/json",
						...adminHeaders,
					},
					method: "POST",
				}
			)
		);
		const activeKeys = await Effect.runPromise(
			basePersistence.webhookEndpoints
				.listActiveKeys("default", new Date().toISOString())
				.pipe(withTenant("tenant-default"))
		);

		expect(response.status).toBe(500);
		expect(activeKeys).toStrictEqual([
			expect.objectContaining({
				id: "default:primary",
				role: "primary",
				secret: "old-secret",
			}),
		]);
	});

	it("allows subject principals to read their own requests", async () => {
		const persistence = makeMemoryPersistence();
		await seedRequest(persistence);
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence },
		});

		const response = await runtime.handler(
			new Request("https://example.test/requests/req-owned", {
				headers: subjectHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as {
			readonly data: { readonly id: string };
			readonly ok: boolean;
		};

		expect([response.status, body.ok, body.data.id]).toStrictEqual([
			200,
			true,
			"req-owned",
		]);
	});

	it("forbids subject principals from reading unowned requests", async () => {
		const persistence = makeMemoryPersistence();
		await seedRequest(persistence, {
			id: "req-other",
			requestorEmail: "another-subject@example.com",
			subjectId: "subject-2",
		});
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence },
		});

		const response = await runtime.handler(
			new Request("https://example.test/requests/req-other", {
				headers: subjectHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			403,
			false,
			"AUTH_REQUEST_ACCESS_FORBIDDEN",
		]);
		expect(body.error.docsUrl).toContain("/dsar-be-1003");
	});

	it("forbids subject principals from staff-only request routes", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/requests", {
				headers: subjectHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			403,
			false,
			"AUTH_REQUEST_ACCESS_FORBIDDEN",
		]);
	});

	it("returns subject profile requests matched by alternate subject identifiers", async () => {
		const persistence = makeMemoryPersistence();
		await seedRequest(persistence, { id: "req-subject-id" });
		await seedRequest(persistence, {
			id: "req-subject-email",
			requestorEmail: "subject@example.com",
			subjectId: "legacy-subject-id",
		});
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence },
		});

		const response = await runtime.handler(
			new Request("https://example.test/subjects/subject-1", {
				headers: subjectHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as {
			readonly data: {
				readonly requests: readonly { readonly id: string }[];
				readonly subjectId: string;
			};
			readonly ok: boolean;
		};

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.data.subjectId).toBe("subject-1");
		expect(
			body.data.requests.map((request) => request.id).toSorted()
		).toStrictEqual(["req-subject-email", "req-subject-id"]);
	});

	it("falls back to request listing for legacy subject lookup repositories", async () => {
		const basePersistence = makeMemoryPersistence();
		const legacyRequests = { ...basePersistence.requests };
		Reflect.deleteProperty(legacyRequests, "listBySubject");
		const persistence = {
			...basePersistence,
			requests: legacyRequests,
		};
		await seedRequest(persistence, { id: "req-subject-id" });
		await seedRequest(persistence, {
			id: "req-subject-email",
			requestorEmail: "subject-1",
			subjectId: "other-subject",
		});
		await seedRequest(persistence, {
			id: "req-other-subject",
			subjectId: "other-subject",
		});
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence },
		});

		const response = await runtime.handler(
			new Request("https://example.test/subjects/subject-1", {
				headers: actorHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as {
			readonly data: {
				readonly requests: readonly { readonly id: string }[];
			};
			readonly ok: boolean;
		};

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(
			body.data.requests.map((request) => request.id).toSorted()
		).toStrictEqual(["req-subject-email", "req-subject-id"]);
	});

	it("paginates and filters subject profile request lookup without using full request list", async () => {
		const basePersistence = makeMemoryPersistence();
		const persistence = {
			...basePersistence,
			requests: {
				...basePersistence.requests,
				list: () =>
					Effect.fail(new Error("subject lookup must use listBySubject")),
			},
		};
		for (let index = 0; index < 12; index += 1) {
			await seedRequest(persistence, filteredSubjectSeedInput(index));
		}
		await seedRequest(persistence, {
			id: "req-other-subject",
			policyPack: "pack-a",
			status: "fulfilled",
			subjectId: "other-subject",
		});
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence },
		});

		const firstResponse = await runtime.handler(
			new Request(
				"https://example.test/subjects/subject-filtered?status=fulfilled&policy_pack=pack-a&created_after=2026-02-09T00:00:00.000Z&created_before=2026-02-22T00:00:00.000Z&limit=2",
				{
					headers: actorHeaders,
					method: "GET",
				}
			)
		);
		const firstBody = (await firstResponse.json()) as {
			readonly data: {
				readonly pagination: {
					readonly limit: number;
					readonly nextCursor?: string;
				};
				readonly requests: readonly { readonly id: string }[];
			};
			readonly ok: boolean;
		};
		expect(firstResponse.status).toBe(200);
		expect(firstBody.data.pagination.limit).toBe(2);
		expect(firstBody.data.requests.map((request) => request.id)).toStrictEqual([
			"req-filtered-10",
			"req-filtered-08",
		]);
		expect(firstBody.data.pagination.nextCursor).toBeDefined();

		const secondResponse = await runtime.handler(
			new Request(
				`https://example.test/subjects/subject-filtered?status=fulfilled&policy_pack=pack-a&limit=2&cursor=${firstBody.data.pagination.nextCursor}`,
				{
					headers: actorHeaders,
					method: "GET",
				}
			)
		);
		const secondBody = (await secondResponse.json()) as {
			readonly data: {
				readonly requests: readonly { readonly id: string }[];
			};
		};
		expect(secondBody.data.requests.map((request) => request.id)).toStrictEqual(
			["req-filtered-06", "req-filtered-04"]
		);
	});

	it("rejects invalid subject lookup date filters", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request(
				"https://example.test/subjects/subject-1?created_after=not-a-date",
				{
					headers: actorHeaders,
					method: "GET",
				}
			)
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			400,
			false,
			"REQUEST_VALIDATION_FAILED",
		]);
	});

	it("rejects malformed subject lookup cursors", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});
		const cursor = Buffer.from(
			JSON.stringify({ createdAt: "zzz", id: "" }),
			"utf8"
		).toString("base64url");

		const response = await runtime.handler(
			new Request(`https://example.test/subjects/subject-1?cursor=${cursor}`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			400,
			false,
			"REQUEST_VALIDATION_FAILED",
		]);
	});

	it("forbids policy scope mismatches against authenticated tenant context", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/policies/upgrades/propose", {
				body: JSON.stringify({
					fromVersion: "1.0.0",
					tenantId: "tenant-other",
					toVersion: "2.0.0",
				}),
				headers: {
					"content-type": "application/json",
					...adminHeaders,
				},
				method: "POST",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			403,
			false,
			"AUTH_REQUEST_ACCESS_FORBIDDEN",
		]);
	});

	it("maps Slack webhook validation failures to 400 responses", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeSlackInboundFailureAdapter({
						category: "validation",
						details: {
							field: "signature",
						},
						message: "Slack request signature verification failed.",
						retriable: false,
					}),
				],
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			400,
			false,
			"REQUEST_VALIDATION_FAILED",
		]);
		expect(body.error.message).toBe(
			"Slack request signature verification failed."
		);
	});

	it("registers multiple inbound adapters from an array", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeResendInboundFailureAdapter({
						category: "validation",
						message: "Resend webhook signature verification failed.",
						retriable: false,
					}),
					makeSlackInboundFailureAdapter({
						category: "validation",
						message: "Slack request signature verification failed.",
						retriable: false,
					}),
				],
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const [resendResponse, slackResponse] = await Promise.all([
			runtime.handler(
				new Request("https://example.test/webhooks/inbound/resend", {
					body: "{}",
					headers: {
						"content-type": "text/plain",
						"svix-id": "msg_123",
						"svix-signature": "v1,test",
						"svix-timestamp": "123",
					},
					method: "POST",
				})
			),
			runtime.handler(
				new Request("https://example.test/webhooks/inbound/slack", {
					body: JSON.stringify({ type: "event_callback" }),
					headers: {
						"content-type": "application/json",
						"x-slack-request-timestamp": "123",
						"x-slack-signature": "v0=test",
					},
					method: "POST",
				})
			),
		]);
		const resendBody = (await resendResponse.json()) as ErrorEnvelope;
		const slackBody = (await slackResponse.json()) as ErrorEnvelope;

		expect([resendResponse.status, resendBody.error.message]).toStrictEqual([
			400,
			"Resend webhook signature verification failed.",
		]);
		expect([slackResponse.status, slackBody.error.message]).toStrictEqual([
			400,
			"Slack request signature verification failed.",
		]);
	});

	it("rate limits public inbound routes by client IP", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeResendInboundFailureAdapter({
						category: "validation",
						message: "Resend webhook signature verification failed.",
						retriable: false,
					}),
					makeSlackInboundFailureAdapter({
						category: "validation",
						message: "Slack request signature verification failed.",
						retriable: false,
					}),
				],
			},
			config: {
				...TEST_RUNTIME_AUTH.config,
				rateLimit: {
					intake: {
						ip: {
							limit: 1,
							windowMs: 60_000,
						},
						tenant: {
							enabled: false,
						},
					},
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const resendFirst = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/resend", {
				body: "{}",
				headers: {
					"content-type": "text/plain",
					"svix-id": "msg_123",
					"svix-signature": "v1,test",
					"svix-timestamp": "123",
					"x-forwarded-for": "203.0.113.10",
				},
				method: "POST",
			})
		);
		const resendSecond = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/resend", {
				body: "{}",
				headers: {
					"content-type": "text/plain",
					"svix-id": "msg_123",
					"svix-signature": "v1,test",
					"svix-timestamp": "123",
					"x-forwarded-for": "203.0.113.10",
				},
				method: "POST",
			})
		);
		const slackFirst = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "203.0.113.10",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		const slackSecond = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "203.0.113.10",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		const resendBody = (await resendSecond.json()) as ErrorEnvelope;
		const slackBody = (await slackSecond.json()) as ErrorEnvelope;

		expect(resendFirst.status).toBe(400);
		expect([resendSecond.status, resendBody.error.code]).toStrictEqual([
			429,
			"REQUEST_RATE_LIMITED",
		]);
		expect(Number(resendSecond.headers.get("retry-after"))).toBeGreaterThan(0);
		expect(slackFirst.status).toBe(400);
		expect([slackSecond.status, slackBody.error.code]).toStrictEqual([
			429,
			"REQUEST_RATE_LIMITED",
		]);
		expect(Number(slackSecond.headers.get("retry-after"))).toBeGreaterThan(0);
	});

	it("does not rate limit protected request capture with intake limits", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			config: {
				...TEST_RUNTIME_AUTH.config,
				rateLimit: {
					intake: {
						ip: {
							limit: 1,
							windowMs: 60_000,
						},
						tenant: {
							limit: 1,
							windowMs: 60_000,
						},
					},
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});
		const request = () =>
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({}),
				headers: {
					"content-type": "application/json",
					"x-forwarded-for": "203.0.113.20",
					...actorHeaders,
				},
				method: "POST",
			});

		const first = await runtime.handler(request());
		const second = await runtime.handler(request());

		expect(first.status).not.toBe(429);
		expect(second.status).not.toBe(429);
	});

	it("rate limits public inbound routes by tenant after adapter normalization", async () => {
		const events: unknown[] = [];
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [makeResendInboundSuccessAdapter()],
			},
			config: {
				...TEST_RUNTIME_AUTH.config,
				rateLimit: {
					intake: {
						ip: {
							enabled: false,
						},
						tenant: {
							limit: 1,
							windowMs: 60_000,
						},
					},
					onLimitExceeded: (event) => {
						events.push(event);
					},
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const first = await runtime.handler(makeResendWebhookRequest());
		const second = await runtime.handler(makeResendWebhookRequest());
		const secondBody = (await second.json()) as ErrorEnvelope;

		expect(first.status).toBe(202);
		expect([second.status, secondBody.error.code]).toStrictEqual([
			429,
			"REQUEST_RATE_LIMITED",
		]);
		expect(events).toMatchObject([
			{
				route: {
					method: "POST",
					path: "/webhooks/inbound/resend",
				},
				scope: "tenant",
				tenantId: "tenant-default",
			},
		]);
	});

	it("uses a custom rate limit store with stable fixed-window inputs", async () => {
		const inputs: unknown[] = [];
		const store: RateLimitStore = {
			consume: (input) => {
				inputs.push(input);
				return {
					allowed: true,
					limit: input.limit,
					remaining: input.limit - 1,
					resetAtMs: input.nowMs + input.windowMs,
				};
			},
		};
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeSlackInboundFailureAdapter({
						category: "validation",
						message: "Slack request signature verification failed.",
						retriable: false,
					}),
				],
			},
			config: {
				...TEST_RUNTIME_AUTH.config,
				rateLimit: {
					intake: {
						ip: {
							limit: 7,
							windowMs: 12_000,
						},
						tenant: {
							enabled: false,
						},
					},
					store,
				},
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-real-ip": "198.51.100.5",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);

		expect(response.status).toBe(400);
		expect(inputs).toMatchObject([
			{
				key: "intake:ip:POST:/webhooks/inbound/slack:198.51.100.5",
				limit: 7,
				windowMs: 12_000,
			},
		]);
	});

	it("maps Slack webhook auth failures to 400 responses", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeSlackInboundFailureAdapter({
						category: "auth",
						details: {
							stage: "signature_verification",
						},
						message: "Slack request signature verification failed.",
						retriable: false,
					}),
				],
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			400,
			false,
			"REQUEST_VALIDATION_FAILED",
		]);
		expect(body.error.message).toBe(
			"Slack request signature verification failed."
		);
	});

	it("preserves Slack runtime adapter failures as 500 responses", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				inbound: [
					makeSlackInboundFailureAdapter({
						category: "network",
						details: {
							operation: "users.info",
						},
						message: "Slack profile lookup timed out.",
						retriable: true,
					}),
				],
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: {
					"content-type": "application/json",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		const body = (await response.json()) as ErrorEnvelope;

		expect([response.status, body.ok, body.error.code]).toStrictEqual([
			500,
			false,
			"INTERNAL_RUNTIME_ERROR",
		]);
		expect(body.error.trace).toMatchObject({
			adapterKey: "slack",
			capability: "inbound",
			category: "network",
			retriable: true,
			type: "AdapterInvocationError",
		});
	});

	it("mounts all root route groups", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});

		const responses = await Promise.all([
			runtime.handler(
				new Request("https://example.test/init", { method: "POST" })
			),
			runtime.handler(
				new Request("https://example.test/status", { method: "GET" })
			),
			runtime.handler(
				new Request("https://example.test/requests", {
					body: JSON.stringify({
						intakeSource: {
							channel: "api",
							receivedAt: "2026-01-01T00:00:00.000Z",
							type: "api",
						},
						jurisdiction: "uk",
					}),
					headers: {
						"content-type": "application/json",
						...actorHeaders,
					},
					method: "POST",
				})
			),
			runtime.handler(
				new Request("https://example.test/subjects/sub-1", {
					headers: actorHeaders,
					method: "GET",
				})
			),
			runtime.handler(
				new Request("https://example.test/policies", {
					headers: actorHeaders,
					method: "GET",
				})
			),
			runtime.handler(
				new Request("https://example.test/policies/upgrades/propose", {
					headers: actorHeaders,
					method: "POST",
				})
			),
		]);

		expect(responses.map((response) => response.status)).toStrictEqual([
			200, 200, 202, 200, 200, 400,
		]);
	});

	it("mounts representative capability-upgrade endpoint categories", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});
		const responseByPath = await Promise.all([
			runtime.handler(
				new Request("https://example.test/requests/req-1/clock/explain", {
					headers: actorHeaders,
					method: "GET",
				})
			),
			runtime.handler(
				new Request(
					"https://example.test/requests/req-1/verification/request",
					{
						headers: actorHeaders,
						method: "POST",
					}
				)
			),
			runtime.handler(
				new Request("https://example.test/requests/req-1/fulfilment/callback", {
					body: JSON.stringify({ manifest: { artifacts: [] } }),
					headers: {
						"content-type": "application/json",
						...actorHeaders,
					},
					method: "POST",
				})
			),
			runtime.handler(
				new Request("https://example.test/requests/req-1/appeals", {
					headers: actorHeaders,
					method: "POST",
				})
			),
			runtime.handler(
				new Request("https://example.test/tenants/tenant-1/retention", {
					headers: actorHeaders,
					method: "GET",
				})
			),
			runtime.handler(
				new Request("https://example.test/requests/req-1/audit/export", {
					headers: actorHeaders,
					method: "GET",
				})
			),
		]);

		for (const response of responseByPath) {
			expect(response.status).not.toBe(404);
		}
	});

	it("enforces role checks for custom policy registration", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});
		const payload = {
			jurisdiction: "uk",
			metadata: {
				changelog: "Initial custom release",
				compatibilityNotes: "Compatible with launch contracts",
				releaseType: "major",
			},
			name: "uk-custom",
			pack: makePolicyPack("2.0.0"),
			version: "2.0.0",
		};

		const forbidden = await runtime.handler(
			new Request("https://example.test/policies/custom/register", {
				body: JSON.stringify(payload),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(forbidden.status).toBe(403);
		const forbiddenBody = (await forbidden.json()) as {
			readonly error: {
				readonly code: string;
				readonly docsUrl: string;
				readonly id: string;
			};
		};
		expect(forbiddenBody.error.code).toBe("AUTH_APPROVER_ROLE_FORBIDDEN");
		expect(forbiddenBody.error.id).toBe("DSAR-BE-1002");
		expect(forbiddenBody.error.docsUrl).toContain("/dsar-be-1002");

		const accepted = await runtime.handler(
			new Request("https://example.test/policies/custom/register", {
				body: JSON.stringify(payload),
				headers: {
					"content-type": "application/json",
					...adminHeaders,
				},
				method: "POST",
			})
		);
		expect(accepted.status).toBe(202);
	});
});

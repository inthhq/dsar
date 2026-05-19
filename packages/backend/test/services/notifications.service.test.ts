import type {
	CreateAuditEventInput,
	CreateClockSegmentInput,
	CreateNotificationDeliveryAttemptInput,
	CreateNotificationEventInput,
	CreatePolicyAssignmentInput,
	CreateRequestInput,
	CreateRequestTimelineEventInput,
	CreateVerificationEvidenceInput,
	PersistenceService,
	UpdateRequestInput,
	WebhookEndpointRecord,
	WebhookSigningKeyRecord,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";

import { makeAdapterRegistry } from "../../src/adapters";
import { deriveLifecycleNotificationDrafts } from "../../src/events/contracts";
import {
	emitNotificationEvent,
	makeNotificationDraft,
} from "../../src/services/notifications/service";
import { RuntimeServicesTag } from "../../src/types/runtime";
import type {
	NotificationDispatchInput,
	RuntimeServices,
} from "../../src/types/runtime";

const sortWebhookSigningKeys = (
	keys: readonly WebhookSigningKeyRecord[]
): readonly WebhookSigningKeyRecord[] =>
	keys.toSorted((left, right) => {
		if (left.role !== right.role) {
			return left.role === "primary" ? -1 : 1;
		}
		return left.createdAt === right.createdAt
			? left.id.localeCompare(right.id)
			: right.createdAt.localeCompare(left.createdAt);
	});

const getFetchHeaders = (
	input: string | URL | Request,
	init: RequestInit | undefined
): HeadersInit | undefined =>
	input instanceof Request ? input.headers : init?.headers;

const makeMemoryPersistence = (): {
	readonly persistence: PersistenceService;
	readonly getAttempts: () => readonly {
		readonly id: string;
		readonly tenantId: string;
		readonly notificationEventId: string;
		readonly requestId: string;
		readonly channel: string;
		readonly destination: string;
		readonly attempt: number;
		readonly status: "pending" | "delivered" | "failed" | "skipped";
		readonly responseCode?: number;
		readonly error?: string;
		readonly createdAt: string;
	}[];
} => {
	const notificationEvents: {
		readonly id: string;
		readonly tenantId: string;
		readonly requestId: string;
		readonly eventType: string;
		readonly payload: unknown;
		readonly correlationId: string;
		readonly idempotencyKey: string;
		readonly policyVersion: string;
		readonly locale: string;
		readonly createdAt: string;
	}[] = [];
	const webhookEndpoints = new Map<string, WebhookEndpointRecord>();
	const webhookSigningKeys: WebhookSigningKeyRecord[] = [];
	const attempts: {
		readonly id: string;
		readonly tenantId: string;
		readonly notificationEventId: string;
		readonly requestId: string;
		readonly channel: string;
		readonly destination: string;
		readonly attempt: number;
		readonly status: "pending" | "delivered" | "failed" | "skipped";
		readonly responseCode?: number;
		readonly error?: string;
		readonly createdAt: string;
	}[] = [];

	const failNotImplemented = (name: string) =>
		Effect.fail(new Error(`not implemented in test persistence: ${name}`));

	return {
		getAttempts: () => attempts,
		persistence: {
			auditEvents: {
				append: (_input: CreateAuditEventInput) =>
					failNotImplemented("auditEvents.append"),
				listByRequestId: () => Effect.succeed([]),
			},
			chatRuntimeState: {
				acquireLock: () => Effect.succeed(null),
				delete: () => Effect.succeed(),
				extendLock: () => Effect.succeed(false),
				get: () => Effect.succeed(null),
				isSubscribed: () => Effect.succeed(false),
				releaseLock: () => Effect.succeed(),
				set: (input) =>
					Effect.succeed({ ...input, tenantId: "tenant-default" }),
				setIfNotExists: () => Effect.succeed(true),
				subscribe: (input) =>
					Effect.succeed({ ...input, tenantId: "tenant-default" }),
				unsubscribe: () => Effect.succeed(),
			},
			clockSegments: {
				append: (_input: CreateClockSegmentInput) =>
					failNotImplemented("clockSegments.append"),
				listByRequestId: () => Effect.succeed([]),
			},
			fulfillmentArtifacts: {
				create: () => failNotImplemented("fulfillmentArtifacts.create"),
				listByRequestId: () => Effect.succeed([]),
			},
			notificationDeliveryAttempts: {
				append: (input: CreateNotificationDeliveryAttemptInput) => {
					const record = { ...input, tenantId: "tenant-default" };
					attempts.push(record);
					return Effect.succeed(record);
				},
				getById: (id: string) =>
					Effect.fromNullishOr(
						attempts.find((attempt) => attempt.id === id)
					).pipe(
						Effect.mapError(
							() => new Error(`missing notification attempt in test: ${id}`)
						)
					),
				list: (input) =>
					Effect.succeed(
						attempts.filter((attempt) => {
							if (input?.channel && attempt.channel !== input.channel) {
								return false;
							}
							if (
								input?.status &&
								input.status.length > 0 &&
								!input.status.includes(attempt.status)
							) {
								return false;
							}
							return true;
						})
					),
				listByNotificationEventId: (notificationEventId: string) =>
					Effect.succeed(
						attempts.filter(
							(attempt) => attempt.notificationEventId === notificationEventId
						)
					),
			},
			notificationEvents: {
				append: (input: CreateNotificationEventInput) => {
					const record = { ...input, tenantId: "tenant-default" };
					notificationEvents.push(record);
					return Effect.succeed(record);
				},
				getById: (id: string) =>
					Effect.fromNullishOr(
						notificationEvents.find((event) => event.id === id)
					).pipe(
						Effect.mapError(
							() => new Error(`missing notification event in test: ${id}`)
						)
					),
				listByRequestId: (requestId: string) =>
					Effect.succeed(
						notificationEvents.filter((event) => event.requestId === requestId)
					),
			},
			policyAssignments: {
				assign: (_input: CreatePolicyAssignmentInput) =>
					failNotImplemented("policyAssignments.assign"),
				listByRequestId: () => Effect.succeed([]),
			},
			requests: {
				create: (_input: CreateRequestInput) =>
					failNotImplemented("requests.create"),
				getById: (id: string) =>
					Effect.succeed({
						appeals: [],
						authority: { status: "not_required" },
						capture: { subject: { email: "subject@example.com" } },
						clockMode: "receipt",
						createdAt: "2026-01-01T00:00:00.000Z",
						dueAt: "2026-01-31T00:00:00.000Z",
						id,
						receivedAt: "2026-01-01T00:00:00.000Z",
						requestor: { email: "requestor@example.com", type: "subject" },
						status: "captured",
						tenantId: "tenant-default",
						updatedAt: "2026-01-01T00:00:00.000Z",
					}),
				list: () => Effect.succeed([]),
				listBySubject: () =>
					Effect.succeed({
						items: [],
						limit: 50,
					}),
				remove: () => Effect.succeed(),
				update: (_id: string, _input: UpdateRequestInput) =>
					failNotImplemented("requests.update"),
			},
			retentionPolicies: {
				list: () => Effect.succeed([]),
				upsert: () => failNotImplemented("retentionPolicies.upsert"),
			},
			timeline: {
				append: (_input: CreateRequestTimelineEventInput) =>
					failNotImplemented("timeline.append"),
				listByRequestId: () => Effect.succeed([]),
			},
			verificationEvidence: {
				create: (_input: CreateVerificationEvidenceInput) =>
					failNotImplemented("verificationEvidence.create"),
				listByRequestId: () => Effect.succeed([]),
			},
			webhookEndpoints: {
				ensureConfigured: (input) => {
					const endpoint: WebhookEndpointRecord = {
						createdAt:
							webhookEndpoints.get(input.id)?.createdAt ?? input.createdAt,
						id: input.id,
						tenantId: "tenant-default",
						updatedAt: input.createdAt,
						url: input.url,
					};
					webhookEndpoints.set(input.id, endpoint);
					let primaryKey = webhookSigningKeys.find(
						(key) => key.endpointId === input.id && key.role === "primary"
					);
					if (!primaryKey) {
						primaryKey = {
							createdAt: input.createdAt,
							endpointId: input.id,
							id: input.keyId ?? `${input.id}:primary`,
							role: "primary",
							secret: input.signingSecret,
							tenantId: "tenant-default",
						};
						webhookSigningKeys.push(primaryKey);
					}
					return Effect.succeed({ endpoint, primaryKey });
				},
				getById: (id) =>
					Effect.fromNullishOr(webhookEndpoints.get(id)).pipe(
						Effect.mapError(() => new Error(`missing webhook endpoint ${id}`))
					),
				listActiveKeys: (endpointId, now) =>
					Effect.succeed(
						sortWebhookSigningKeys(
							webhookSigningKeys.filter(
								(key) =>
									key.endpointId === endpointId &&
									(key.role === "primary" ||
										key.expiresAt === undefined ||
										key.expiresAt > now)
							)
						)
					),
				rollbackSigningKeyRotation: (input) => {
					const removedPrimary = webhookSigningKeys.some(
						(key) =>
							key.endpointId === input.endpointId &&
							key.id === input.newKeyId &&
							key.role === "primary"
					);
					const retainedKeys = webhookSigningKeys.filter(
						(key) =>
							!(
								key.endpointId === input.endpointId &&
								key.id === input.newKeyId &&
								key.role === "primary"
							)
					);
					webhookSigningKeys.splice(
						0,
						webhookSigningKeys.length,
						...retainedKeys
					);
					if (!(removedPrimary && input.previousPrimary)) {
						return Effect.void;
					}
					const previousIndex = webhookSigningKeys.findIndex(
						(key) =>
							key.endpointId === input.endpointId &&
							key.id === input.previousPrimary?.id
					);
					if (previousIndex !== -1) {
						webhookSigningKeys[previousIndex] = {
							...input.previousPrimary,
							expiresAt: undefined,
							role: "primary",
						};
					}
					return Effect.void;
				},
				rotateSigningKey: (input) => {
					const endpoint = webhookEndpoints.get(input.endpointId);
					if (!endpoint) {
						return Effect.fail(
							new Error(`missing webhook endpoint ${input.endpointId}`)
						);
					}
					const previousIndex = webhookSigningKeys.findIndex(
						(key) =>
							key.endpointId === input.endpointId && key.role === "primary"
					);
					const previousPrimary =
						previousIndex === -1
							? undefined
							: {
									...(webhookSigningKeys[
										previousIndex
									] as WebhookSigningKeyRecord),
									expiresAt: input.graceExpiresAt,
									role: "secondary" as const,
								};
					if (previousPrimary) {
						webhookSigningKeys[previousIndex] = previousPrimary;
					}
					const newPrimary: WebhookSigningKeyRecord = {
						createdAt: input.rotatedAt,
						endpointId: input.endpointId,
						id: input.newKeyId,
						role: "primary",
						secret: input.newSecret,
						tenantId: "tenant-default",
					};
					webhookSigningKeys.push(newPrimary);
					return Effect.succeed({
						activeKeys: sortWebhookSigningKeys(
							webhookSigningKeys.filter(
								(key) =>
									key.endpointId === input.endpointId &&
									(key.role === "primary" ||
										key.expiresAt === undefined ||
										key.expiresAt > input.rotatedAt)
							)
						),
						endpoint,
						newPrimary,
						previousPrimary,
					});
				},
			},
		},
	};
};

const makeServices = (input: {
	readonly persistence: PersistenceService;
	readonly dispatch: RuntimeServices["adapters"]["notifications"];
	readonly retryMaxAttempts: number;
	readonly retryDelayMs: number;
	readonly adapterKey?: string;
	readonly webhookEnabled?: boolean;
	readonly outboundResendConfig?: RuntimeServices["config"]["outboundResend"];
	readonly disableBuiltInEmail?: boolean;
}): RuntimeServices => ({
	adapterRegistry: makeAdapterRegistry(
		input.dispatch === "stub"
			? []
			: [
					{
						capability: "notifications",
						diagnostics: () =>
							Effect.succeed({
								capability: "notifications",
								key: "test-notifications",
							}),
						healthCheck: () =>
							Effect.succeed({
								ok: true,
								status: "healthy",
							}),
						init: () => Effect.succeed(),
						key: input.adapterKey ?? "test-notifications",
						send: input.dispatch.send,
						validateConfig: () => Effect.succeed(),
					},
				]
	),
	adapters: {
		notifications: input.dispatch,
		storage: "stub",
	},
	config: {
		aiEnabled: false,
		defaultLocale: "en-GB",
		enableManifestReview: true,
		environment: "test",
		notificationWebhook:
			input.webhookEnabled === false
				? undefined
				: {
						disableBuiltInEmail: input.disableBuiltInEmail,
						retryDelayMs: input.retryDelayMs,
						retryMaxAttempts: input.retryMaxAttempts,
						signingSecret: "test-secret",
						timeoutMs: 1000,
						url: "https://tenant.example/webhook",
					},
		outboundResend: input.outboundResendConfig,
	},
	repos: {
		persistence: input.persistence,
	},
	requestContext: {
		requestId: "corr-test-1",
		tenantId: "tenant-default",
	},
});

describe("notification retry/backoff behavior", () => {
	it("retries failed webhook dispatches using configured backoff", async () => {
		const { vi } = await import("vitest");
		vi.useFakeTimers();
		try {
			const memory = makeMemoryPersistence();
			const retryDelayMs = 1000;
			let callCount = 0;
			const attemptTimes: number[] = [];
			const outcomes = [
				{ error: "temporary failure", status: "failed" as const },
				{ error: "temporary failure", status: "failed" as const },
				{ responseCode: 202, status: "delivered" as const },
			] as const;
			const dispatch = {
				send: () =>
					Effect.sync(() => {
						attemptTimes.push(Date.now());
						callCount += 1;
						return outcomes[callCount - 1] as (typeof outcomes)[number];
					}),
			};
			const services = makeServices({
				dispatch,
				persistence: memory.persistence,
				retryDelayMs,
				retryMaxAttempts: 3,
			});
			const notificationPromise = Effect.runPromise(
				pipe(
					emitNotificationEvent({
						draft: makeNotificationDraft({
							eventType: "clock_due_changed",
							payload: { dueAt: "2026-03-01T00:00:00.000Z" },
							requestId: "req-1",
						}),
						idempotencyKey: "idem-1",
						tenantId: "tenant-default",
					}),
					Effect.provideService(RuntimeServicesTag, services)
				)
			);
			await vi.advanceTimersByTimeAsync(1);
			expect(callCount).toBe(1);
			await vi.advanceTimersByTimeAsync(998);
			expect(callCount).toBe(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(callCount).toBe(2);
			await vi.advanceTimersByTimeAsync(1000);
			const result = await notificationPromise;
			expect(result.status).toBe("generated");
			expect(callCount).toBe(3);
			expect(attemptTimes).toHaveLength(3);
			expect(typeof attemptTimes[0]).toBe("number");
			expect(typeof attemptTimes[1]).toBe("number");
			const firstAttemptAt = attemptTimes[0] as number;
			const secondAttemptAt = attemptTimes[1] as number;
			expect(secondAttemptAt - firstAttemptAt).toBeGreaterThanOrEqual(
				retryDelayMs
			);
			expect(
				memory
					.getAttempts()
					.filter((attempt) => attempt.channel === "webhook")
					.map((attempt) => attempt.status)
			).toStrictEqual(["failed", "failed", "delivered"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("stops retrying after max attempts", async () => {
		const memory = makeMemoryPersistence();
		let callCount = 0;
		const dispatch = {
			send: () =>
				Effect.sync(() => {
					callCount += 1;
					return { error: "still failing", status: "failed" as const };
				}),
		};
		const services = makeServices({
			dispatch,
			persistence: memory.persistence,
			retryDelayMs: 1,
			retryMaxAttempts: 2,
		});

		await Effect.runPromise(
			pipe(
				emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "clock_segment_opened",
						payload: { reason: "verification_request" },
						requestId: "req-2",
					}),
					idempotencyKey: "idem-2",
					tenantId: "tenant-default",
				}),
				Effect.provideService(RuntimeServicesTag, services)
			)
		);
		expect(callCount).toBe(2);
		expect(
			memory
				.getAttempts()
				.filter((attempt) => attempt.channel === "webhook")
				.map((attempt) => attempt.status)
		).toStrictEqual(["failed", "failed"]);
	});

	it("sends built-in email when webhook is disabled", async () => {
		const memory = makeMemoryPersistence();
		const dispatch = {
			send: () =>
				Effect.succeed({
					responseCode: 202,
					status: "delivered" as const,
				}),
		};
		const services = makeServices({
			adapterKey: "outbound-resend",
			dispatch,
			persistence: memory.persistence,
			retryDelayMs: 100,
			retryMaxAttempts: 1,
			webhookEnabled: false,
		});
		await Effect.runPromise(
			emitNotificationEvent({
				draft: makeNotificationDraft({
					eventType: "request_captured",
					payload: { note: "email only" },
					requestId: "req-email-1",
				}),
				idempotencyKey: "idem-email-1",
				tenantId: "tenant-default",
				workspaceId: "workspace-a",
			}).pipe(Effect.provideService(RuntimeServicesTag, services))
		);
		const attempts = memory.getAttempts();
		expect(
			attempts.map((attempt) => `${attempt.channel}:${attempt.status}`)
		).toContain("email:delivered");
	});

	it("skips built-in email when disabled by policy", async () => {
		const memory = makeMemoryPersistence();
		let sendCount = 0;
		const dispatch = {
			send: () =>
				Effect.sync(() => {
					sendCount += 1;
					return {
						responseCode: 202,
						status: "delivered" as const,
					};
				}),
		};
		const services = makeServices({
			adapterKey: "outbound-resend",
			dispatch,
			outboundResendConfig: {
				enabled: false,
				tenants: {
					"tenant-default": {
						enabled: false,
					},
				},
			},
			persistence: memory.persistence,
			retryDelayMs: 100,
			retryMaxAttempts: 1,
			webhookEnabled: false,
		});
		await Effect.runPromise(
			emitNotificationEvent({
				draft: makeNotificationDraft({
					eventType: "manifest_review_recorded",
					payload: { status: "approved" },
					requestId: "req-email-2",
				}),
				idempotencyKey: "idem-email-2",
				tenantId: "tenant-default",
			}).pipe(Effect.provideService(RuntimeServicesTag, services))
		);
		expect(sendCount).toBe(0);
		expect(
			memory
				.getAttempts()
				.map((attempt) => `${attempt.channel}:${attempt.status}`)
		).toContain("email:skipped");
	});

	it("applies workspace override precedence over global disable", async () => {
		const memory = makeMemoryPersistence();
		let sendCount = 0;
		const dispatch = {
			send: () =>
				Effect.sync(() => {
					sendCount += 1;
					return {
						responseCode: 202,
						status: "delivered" as const,
					};
				}),
		};
		const services = makeServices({
			adapterKey: "outbound-resend",
			disableBuiltInEmail: true,
			dispatch,
			outboundResendConfig: {
				enabled: false,
				tenants: {
					"tenant-default": {
						enabled: false,
						workspaces: {
							"workspace-allow": {
								enabled: true,
							},
						},
					},
				},
			},
			persistence: memory.persistence,
			retryDelayMs: 100,
			retryMaxAttempts: 1,
			webhookEnabled: false,
		});
		await Effect.runPromise(
			emitNotificationEvent({
				draft: makeNotificationDraft({
					eventType: "appeal_recorded",
					payload: { status: "decided" },
					requestId: "req-email-3",
				}),
				idempotencyKey: "idem-email-3",
				tenantId: "tenant-default",
				workspaceId: "workspace-allow",
			}).pipe(Effect.provideService(RuntimeServicesTag, services))
		);
		expect(sendCount).toBe(1);
	});

	it("signs fallback webhooks with persisted primary key id", async () => {
		const { vi } = await import("vitest");
		const memory = makeMemoryPersistence();
		const receivedHeaders: Record<string, string> = {};
		vi.stubGlobal(
			"fetch",
			vi.fn((input: string | URL | Request, init?: RequestInit) => {
				const headers = new Headers(getFetchHeaders(input, init));
				for (const [key, value] of headers.entries()) {
					receivedHeaders[key] = value;
				}
				return Promise.resolve(new Response(null, { status: 202 }));
			})
		);
		try {
			const services = makeServices({
				disableBuiltInEmail: true,
				dispatch: "stub",
				persistence: memory.persistence,
				retryDelayMs: 1,
				retryMaxAttempts: 1,
			});
			await Effect.runPromise(
				emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "request_captured",
						payload: { note: "signed webhook" },
						requestId: "req-signed-webhook",
					}),
					idempotencyKey: "idem-signed-webhook",
					tenantId: "tenant-default",
				}).pipe(Effect.provideService(RuntimeServicesTag, services))
			);
			expect(receivedHeaders["x-dsar-signature"]).toMatch(/^[0-9a-f]+$/);
			expect(receivedHeaders["x-dsar-signature-key-id"]).toBe(
				"default:primary"
			);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("passes persisted signing keys to webhook adapters", async () => {
		const memory = makeMemoryPersistence();
		let receivedInput: NotificationDispatchInput | undefined;
		const dispatch = {
			send: (input: NotificationDispatchInput) =>
				Effect.sync(() => {
					receivedInput = input;
					return {
						responseCode: 202,
						status: "delivered" as const,
					};
				}),
		};
		const services = makeServices({
			adapterKey: "custom-webhook",
			disableBuiltInEmail: true,
			dispatch,
			persistence: memory.persistence,
			retryDelayMs: 1,
			retryMaxAttempts: 1,
		});

		await Effect.runPromise(
			emitNotificationEvent({
				draft: makeNotificationDraft({
					eventType: "request_captured",
					payload: { note: "adapter signed webhook" },
					requestId: "req-adapter-webhook",
				}),
				idempotencyKey: "idem-adapter-webhook",
				tenantId: "tenant-default",
			}).pipe(Effect.provideService(RuntimeServicesTag, services))
		);

		expect(receivedInput?.webhookSigningKey).toStrictEqual({
			id: "default:primary",
			secret: "test-secret",
		});
	});

	it("uses capability-spec clock webhook event names for lifecycle derivation", () => {
		const opened = deriveLifecycleNotificationDrafts({
			action: "verification_request",
			dueAt: "2026-03-01T00:00:00.000Z",
			from: "captured",
			locale: "en-GB",
			policyVersion: "uk-v1",
			requestId: "req-3",
			to: "verification_pending",
		});
		const closed = deriveLifecycleNotificationDrafts({
			action: "verification_approve",
			dueAt: "2026-03-01T00:00:00.000Z",
			from: "verification_pending",
			locale: "en-GB",
			policyVersion: "uk-v1",
			requestId: "req-3",
			to: "in_progress",
		});

		expect(opened.map((event) => event.eventType)).toContain(
			"clock_segment_opened"
		);
		expect(opened.map((event) => event.eventType)).toContain(
			"clock_due_changed"
		);
		expect(closed.map((event) => event.eventType)).toContain(
			"clock_segment_closed"
		);
		expect(closed.map((event) => event.eventType)).toContain(
			"clock_due_changed"
		);
	});
});

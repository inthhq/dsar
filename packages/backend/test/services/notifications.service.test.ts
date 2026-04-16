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
import type { RuntimeServices } from "../../src/types/runtime";

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

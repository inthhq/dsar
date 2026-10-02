import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { makeAdapterRegistry } from "../../src/adapters";
import {
	deliverDueWebhookRetries,
	WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE,
} from "../../src/services/notifications/retry";
import {
	emitNotificationEvent,
	makeNotificationDraft,
} from "../../src/services/notifications/service";
import type { RuntimeServices } from "../../src/types/runtime";
import { RuntimeServicesTag } from "../../src/types/runtime";
import { makeMemoryPersistence } from "../e2e/fixtures";

const makeServices = (input: {
	readonly persistence: ReturnType<typeof makeMemoryPersistence>;
	readonly send: () => Effect.Effect<{
		readonly status: "delivered" | "failed" | "skipped";
		readonly responseCode?: number;
		readonly error?: string;
	}>;
	readonly retryMaxAttempts?: number;
	readonly retryScheduleMs?: readonly number[];
}): RuntimeServices => ({
	adapterRegistry: makeAdapterRegistry([
		{
			capability: "notifications",
			channels: ["webhook"],
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
			key: "test-notifications",
			send: input.send,
			validateConfig: () => Effect.succeed(),
		},
	]),
	adapters: {
		notifications: {
			send: input.send,
		} as RuntimeServices["adapters"]["notifications"],
		storage: "stub",
	},
	config: {
		aiEnabled: false,
		defaultLocale: "en-GB",
		enableManifestReview: true,
		environment: "test",
		notificationWebhook: {
			disableBuiltInEmail: true,
			retryDelayMs: 250,
			retryMaxAttempts: input.retryMaxAttempts ?? 3,
			retryScheduleMs: input.retryScheduleMs,
			signingSecret: "test-secret",
			timeoutMs: 1000,
			url: "https://tenant.example/webhook",
		},
	},
	repos: {
		persistence: input.persistence,
	},
	requestContext: {
		requestId: "corr-retry-worker",
		tenantId: "tenant-default",
	},
});

describe("webhook retry worker", () => {
	it.effect(
		"retries a flaky webhook twice then delivers on the third attempt",
		() =>
			Effect.gen(function* flakyWebhookRetryProgram() {
				const persistence = makeMemoryPersistence();
				let callCount = 0;
				const outcomes = [
					{ error: "temporary failure", status: "failed" as const },
					{ error: "temporary failure", status: "failed" as const },
					{ responseCode: 202, status: "delivered" as const },
				] as const;
				const services = makeServices({
					persistence,
					retryMaxAttempts: 3,
					retryScheduleMs: [60_000, 5 * 60_000],
					send: () =>
						Effect.sync(() => {
							callCount += 1;
							return outcomes[callCount - 1] as (typeof outcomes)[number];
						}),
				});

				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "request_captured",
						payload: { action: "capture" },
						requestId: "req-flaky",
					}),
					idempotencyKey: "idem-flaky",
					tenantId: "tenant-default",
				}).pipe(Effect.provideService(RuntimeServicesTag, services));

				expect(callCount).toBe(1);
				const events =
					yield* persistence.notificationEvents.listByRequestId("req-flaky");
				const eventId = events[0]?.id;
				expect(eventId).toBeDefined();
				const webhookJobs = (input: readonly { readonly channel: string }[]) =>
					input.filter((attempt) => attempt.channel === "webhook");
				let jobs = webhookJobs(
					yield* persistence.notificationDeliveryAttempts.listByNotificationEventId(
						eventId ?? ""
					)
				);
				expect(jobs).toHaveLength(1);
				expect(jobs[0]?.status).toBe("failed");
				expect(jobs[0]?.attempt).toBe(1);
				const attemptId = jobs[0]?.id;

				yield* TestClock.adjust("1 minute");
				yield* deliverDueWebhookRetries({
					tenantId: "tenant-default",
				}).pipe(Effect.provideService(RuntimeServicesTag, services));
				expect(callCount).toBe(2);

				yield* TestClock.adjust("5 minutes");
				yield* deliverDueWebhookRetries({
					tenantId: "tenant-default",
				}).pipe(Effect.provideService(RuntimeServicesTag, services));
				expect(callCount).toBe(3);

				jobs = webhookJobs(
					yield* persistence.notificationDeliveryAttempts.listByNotificationEventId(
						eventId ?? ""
					)
				);
				expect(jobs).toHaveLength(1);
				expect(jobs[0]?.id).toBe(attemptId);
				expect(jobs[0]?.status).toBe("delivered");
				expect(jobs[0]?.attempt).toBe(3);
				expect(jobs[0]?.nextAttemptAt).toBeUndefined();

				const timeline =
					yield* persistence.timeline.listByRequestId("req-flaky");
				const attemptEvents = timeline.filter(
					(event) => event.eventType === WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE
				);
				expect(attemptEvents).toHaveLength(3);
				expect(
					attemptEvents.map((event) => {
						const payload = event.payload as {
							readonly attempt: number;
							readonly attemptId: string;
							readonly notificationEventId: string;
							readonly status: string;
						};
						return {
							attempt: payload.attempt,
							attemptId: payload.attemptId,
							notificationEventId: payload.notificationEventId,
							status: payload.status,
						};
					})
				).toStrictEqual([
					{
						attempt: 1,
						attemptId,
						notificationEventId: eventId,
						status: "failed",
					},
					{
						attempt: 2,
						attemptId,
						notificationEventId: eventId,
						status: "failed",
					},
					{
						attempt: 3,
						attemptId,
						notificationEventId: eventId,
						status: "delivered",
					},
				]);
			})
	);

	it.effect("resumes a pending job after a crash before send", () =>
		Effect.gen(function* crashBeforeSendProgram() {
			const persistence = makeMemoryPersistence();
			let callCount = 0;
			const services = makeServices({
				persistence,
				retryMaxAttempts: 3,
				retryScheduleMs: [60_000],
				send: () =>
					Effect.sync(() => {
						callCount += 1;
						return { responseCode: 202, status: "delivered" as const };
					}),
			});

			yield* persistence.notificationEvents.append({
				correlationId: "corr-crash",
				createdAt: "1970-01-01T00:00:00.000Z",
				eventType: "request_captured",
				id: "ne-crash",
				idempotencyKey: "idem-crash",
				locale: "en-GB",
				payload: {},
				policyVersion: "policy-v1",
				requestId: "req-crash",
			});
			yield* persistence.notificationDeliveryAttempts.append({
				attempt: 1,
				channel: "webhook",
				createdAt: "1970-01-01T00:00:00.000Z",
				destination: "https://tenant.example/webhook",
				id: "nda-crash",
				nextAttemptAt: "1970-01-01T00:00:00.000Z",
				notificationEventId: "ne-crash",
				requestId: "req-crash",
				status: "pending",
			});

			expect(callCount).toBe(0);
			yield* deliverDueWebhookRetries({ tenantId: "tenant-default" }).pipe(
				Effect.provideService(RuntimeServicesTag, services)
			);
			expect(callCount).toBe(1);
			const job =
				yield* persistence.notificationDeliveryAttempts.getById("nda-crash");
			expect(job.status).toBe("delivered");
			expect(job.id).toBe("nda-crash");
		})
	);
});

import { asRecordOrEmpty } from "@dsar/guards";
/* oxlint-disable complexity */
import { withTenant } from "@dsar/persistence";
import type { JsonValue, NotificationEventRecord } from "@dsar/persistence";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type { AdapterContractError } from "../../adapters";
import { normalizeAdapterError, toAdapterFailureEvent } from "../../adapters";
import type {
	NotificationEventDraft,
	NotificationEventType,
} from "../../events/contracts";
import { makeRequestId } from "../../middleware/auth-context";
import { RequestValidationError } from "../../types/errors";
import type {
	NotificationDispatchInput,
	NotificationDispatchResult,
	RuntimeServices,
} from "../../types/runtime";
import { RuntimeServicesTag } from "../../types/runtime";
import {
	delayAfterAttemptMs,
	resolveWebhookRetryPolicy,
	WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE,
	WEBHOOK_RETRY_WORKER_POLL_MS,
} from "./schedule";
import { dispatchWebhookNotification } from "./webhook";

const DEFAULT_WEBHOOK_ENDPOINT_ID = "default";
const NOTIFICATION_EVENT_TYPES = [
	"request_captured",
	"clock_due_changed",
	"clock_segment_opened",
	"clock_segment_closed",
	"request_acknowledged",
	"acknowledgement_sent",
	"verification_outcome_recorded",
	"manifest_review_recorded",
	"appeal_recorded",
	"fulfillment_callback_received",
	"delivery_prepared",
	"step_up_challenge_issued",
	"request_fulfilled",
	"request_refused",
] as const satisfies readonly NotificationEventType[];

const isNotificationEventType = (
	value: string
): value is NotificationEventType => {
	for (const eventType of NOTIFICATION_EVENT_TYPES) {
		if (eventType === value) {
			return true;
		}
	}
	return false;
};

const parseNotificationEventType = (
	value: string
): Effect.Effect<NotificationEventType, RequestValidationError> => {
	if (isNotificationEventType(value)) {
		return Effect.succeed(value);
	}
	return Effect.fail(
		new RequestValidationError({
			details: { eventType: value },
			message:
				"Webhook dispatch cannot be replayed because the persisted notification event type is not supported.",
			reasonCode: "REQUEST_VALIDATION_FAILED",
		})
	);
};

/**
 * Reads the Effect clock as an ISO-8601 timestamp so TestClock can drive retries.
 */
export const currentIsoTimestamp = Effect.fn("currentIsoTimestamp")(
	function* currentIsoTimestampProgram() {
		const millis = yield* Clock.currentTimeMillis;
		return new Date(millis).toISOString();
	}
);

const toDispatchInput = (input: {
	readonly eventId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string;
	readonly draft: NotificationEventDraft;
}): NotificationDispatchInput => {
	const normalizedPayload =
		typeof input.draft.payload === "object" &&
		input.draft.payload !== null &&
		!Array.isArray(input.draft.payload)
			? asRecordOrEmpty(input.draft.payload)
			: { value: input.draft.payload };
	return {
		correlationId: input.correlationId,
		eventId: input.eventId,
		eventType: input.draft.eventType,
		idempotencyKey: input.idempotencyKey,
		locale: input.draft.locale,
		payload: normalizedPayload,
		policyVersion: input.draft.policyVersion,
		requestId: input.draft.requestId,
	};
};

const supportsNotificationChannel = (
	adapter:
		| { readonly channels?: readonly string[]; readonly key: string }
		| undefined,
	channel: "email" | "webhook"
): boolean => {
	if (!adapter) {
		return false;
	}
	if (adapter.channels) {
		return adapter.channels.includes(channel);
	}
	return channel === "webhook" && adapter.key !== "outbound-resend";
};

const resolveWebhookSigningKey = (input: {
	readonly config: NonNullable<
		RuntimeServices["config"]["notificationWebhook"]
	>;
	readonly services: RuntimeServices;
	readonly tenantId: string;
}) =>
	Effect.gen(function* resolveWebhookSigningKeyProgram() {
		const createdAt = yield* currentIsoTimestamp();
		return yield* input.services.repos.persistence.webhookEndpoints
			.ensureConfigured({
				createdAt,
				id: input.config.endpointId ?? DEFAULT_WEBHOOK_ENDPOINT_ID,
				signingSecret: input.config.signingSecret,
				url: input.config.url,
			})
			.pipe(
				withTenant(input.tenantId),
				Effect.map(({ primaryKey }) => ({
					id: primaryKey.id,
					secret: primaryKey.secret,
				}))
			);
	});

const toTimelinePayload = (input: {
	readonly attempt: number;
	readonly attemptId: string;
	readonly destination: string;
	readonly notificationEventId: string;
	readonly status: string;
	readonly error?: string;
	readonly nextAttemptAt?: string;
	readonly responseCode?: number;
}): JsonValue => {
	const payload: Record<string, JsonValue> = {
		attempt: input.attempt,
		attemptId: input.attemptId,
		channel: "webhook",
		destination: input.destination,
		notificationEventId: input.notificationEventId,
		status: input.status,
	};
	if (input.error !== undefined) {
		payload.error = input.error;
	}
	if (input.nextAttemptAt !== undefined) {
		payload.nextAttemptAt = input.nextAttemptAt;
	}
	if (input.responseCode !== undefined) {
		payload.responseCode = input.responseCode;
	}
	return payload;
};

const appendWebhookAttemptTimeline = (input: {
	readonly tenantId: string;
	readonly requestId: string;
	readonly createdAt: string;
	readonly payload: JsonValue;
}) =>
	Effect.gen(function* appendWebhookAttemptTimelineProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		yield* services.repos.persistence.timeline
			.append({
				createdAt: input.createdAt,
				eventType: WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE,
				id: makeRequestId(),
				payload: input.payload,
				requestId: input.requestId,
			})
			.pipe(withTenant(input.tenantId));
	});

const sendWebhook = (input: {
	readonly services: RuntimeServices;
	readonly tenantId: string;
	readonly event: NotificationEventRecord;
	readonly idempotencyKey: string;
}): Effect.Effect<
	NotificationDispatchResult,
	AdapterContractError | RequestValidationError
> =>
	Effect.gen(function* sendWebhookProgram() {
		const webhookConfig = input.services.config.notificationWebhook;
		if (!webhookConfig || webhookConfig.url.length === 0) {
			return yield* Effect.fail(
				new RequestValidationError({
					message:
						"Webhook dispatch cannot be sent because no webhook endpoint is configured.",
					reasonCode: "REQUEST_VALIDATION_FAILED",
				})
			);
		}
		const resolvedNotificationAdapter =
			input.services.adapterRegistry.resolveNotification();
		const webhookAdapter = supportsNotificationChannel(
			resolvedNotificationAdapter,
			"webhook"
		)
			? resolvedNotificationAdapter
			: undefined;
		const signingKey = yield* resolveWebhookSigningKey({
			config: webhookConfig,
			services: input.services,
			tenantId: input.tenantId,
		});
		const eventType = yield* parseNotificationEventType(input.event.eventType);
		const dispatchInput = toDispatchInput({
			correlationId: input.services.requestContext.requestId,
			draft: {
				eventType,
				locale: input.event.locale,
				payload: input.event.payload,
				policyVersion: input.event.policyVersion,
				requestId: input.event.requestId,
			},
			eventId: input.event.id,
			idempotencyKey: input.idempotencyKey,
		});
		if (webhookAdapter) {
			return yield* webhookAdapter.send({
				...dispatchInput,
				webhookSigningKey: signingKey,
			});
		}
		return yield* dispatchWebhookNotification({
			event: dispatchInput,
			signingKey,
			timeoutMs: webhookConfig.timeoutMs,
			url: webhookConfig.url,
		});
	});

const recordAdapterFailure = (input: {
	readonly services: RuntimeServices;
	readonly adapterKey: string;
	readonly error: unknown;
}) =>
	Effect.gen(function* recordAdapterFailureProgram() {
		const normalized = normalizeAdapterError({
			adapterKey: input.adapterKey,
			capability: "notifications",
			error: input.error,
		});
		const adapterEvent = toAdapterFailureEvent({
			error: normalized,
			requestId: input.services.requestContext.requestId,
		});
		if (input.services.config.onAdapterEvent) {
			yield* Effect.tryPromise(() =>
				Promise.resolve(input.services.config.onAdapterEvent?.(adapterEvent))
			).pipe(Effect.catch(() => Effect.void));
		}
		return normalized;
	});

const notifyDeadWebhook = (input: {
	readonly services: RuntimeServices;
	readonly tenantId: string;
	readonly attempt: number;
	readonly attemptId: string;
	readonly destination: string;
	readonly notificationEventId: string;
	readonly occurredAt: string;
	readonly requestId: string;
	readonly error?: string;
	readonly responseCode?: number;
}) =>
	Effect.gen(function* notifyDeadWebhookProgram() {
		const hook = input.services.config.onDeadWebhook;
		if (!hook) {
			return;
		}
		yield* Effect.tryPromise(() =>
			Promise.resolve(
				hook({
					attempt: input.attempt,
					attemptId: input.attemptId,
					destination: input.destination,
					error: input.error,
					notificationEventId: input.notificationEventId,
					occurredAt: input.occurredAt,
					requestId: input.requestId,
					responseCode: input.responseCode,
					tenantId: input.tenantId,
				})
			)
		).pipe(Effect.catch(() => Effect.void));
	});

/**
 * Claims a persisted webhook job, sends once, then records the outcome.
 *
 * The delivery-attempt id is the dispatch identity. Retries increment `attempt`
 * on the same row and append a timeline event per send.
 *
 * @param input - Tenant and job id to process.
 * @returns The send result, or `undefined` when the claim lost the race.
 */
export const processWebhookDeliveryJob = Effect.fn("processWebhookDeliveryJob")(
	function* processWebhookDeliveryJobProgram(input: {
		readonly tenantId: string;
		readonly attemptId: string;
		readonly idempotencyKey?: string;
	}) {
		const services = yield* Effect.service(RuntimeServicesTag);
		const webhookConfig = services.config.notificationWebhook;
		if (!webhookConfig || webhookConfig.url.length === 0) {
			return;
		}
		const now = yield* currentIsoTimestamp();
		const timeoutMs =
			Number.isFinite(webhookConfig.timeoutMs) && webhookConfig.timeoutMs > 0
				? Math.floor(webhookConfig.timeoutMs)
				: 30_000;
		const leaseMs = Math.max(timeoutMs, 30_000) + 5000;
		const nowMs = yield* Clock.currentTimeMillis;
		const claimed =
			yield* services.repos.persistence.notificationDeliveryAttempts
				.claimDue({
					claimExpiresAt: new Date(nowMs + leaseMs).toISOString(),
					claimedAt: now,
					id: input.attemptId,
					now,
				})
				.pipe(withTenant(input.tenantId));
		if (!claimed) {
			return;
		}
		const event = yield* services.repos.persistence.notificationEvents
			.getById(claimed.notificationEventId)
			.pipe(withTenant(input.tenantId));
		const policy = resolveWebhookRetryPolicy({
			retryMaxAttempts: webhookConfig.retryMaxAttempts,
			retryScheduleMs: webhookConfig.retryScheduleMs,
		});
		const attemptNumber =
			claimed.status === "pending" ? claimed.attempt : claimed.attempt + 1;
		const resolvedNotificationAdapter =
			services.adapterRegistry.resolveNotification();
		const webhookAdapter = supportsNotificationChannel(
			resolvedNotificationAdapter,
			"webhook"
		)
			? resolvedNotificationAdapter
			: undefined;
		const sendResult = yield* Effect.result(
			sendWebhook({
				event,
				idempotencyKey: input.idempotencyKey ?? event.idempotencyKey,
				services,
				tenantId: input.tenantId,
			})
		);
		let result: NotificationDispatchResult;
		let retriable = true;
		if (sendResult._tag === "Failure") {
			if (sendResult.failure instanceof RequestValidationError) {
				result = {
					error: sendResult.failure.message,
					status: "failed",
				};
				retriable = false;
			} else {
				const normalized = yield* recordAdapterFailure({
					adapterKey: webhookAdapter?.key ?? "webhook-fallback",
					error: sendResult.failure,
					services,
				});
				result = {
					error: normalized.message,
					status: "failed",
				};
				({ retriable } = normalized);
			}
		} else {
			result = sendResult.success;
		}
		const completedAt = yield* currentIsoTimestamp();
		if (result.status === "delivered" || result.status === "skipped") {
			yield* services.repos.persistence.notificationDeliveryAttempts
				.update(claimed.id, {
					attempt: attemptNumber,
					claimExpiresAt: null,
					claimedAt: null,
					error: result.error,
					nextAttemptAt: null,
					responseCode: result.responseCode,
					status: result.status,
				})
				.pipe(withTenant(input.tenantId));
			yield* appendWebhookAttemptTimeline({
				createdAt: completedAt,
				payload: toTimelinePayload({
					attempt: attemptNumber,
					attemptId: claimed.id,
					destination: claimed.destination,
					error: result.error,
					notificationEventId: claimed.notificationEventId,
					responseCode: result.responseCode,
					status: result.status,
				}),
				requestId: claimed.requestId,
				tenantId: input.tenantId,
			});
			return result;
		}
		const exhausted = attemptNumber >= policy.maxAttempts || !retriable;
		const delayMs = exhausted
			? undefined
			: delayAfterAttemptMs(policy.scheduleMs, attemptNumber);
		const nextAttemptAt =
			delayMs === undefined
				? undefined
				: new Date((yield* Clock.currentTimeMillis) + delayMs).toISOString();
		const status = exhausted || nextAttemptAt === undefined ? "dead" : "failed";
		yield* services.repos.persistence.notificationDeliveryAttempts
			.update(claimed.id, {
				attempt: attemptNumber,
				claimExpiresAt: null,
				claimedAt: null,
				error: result.error,
				nextAttemptAt: nextAttemptAt ?? null,
				responseCode: result.responseCode,
				status,
			})
			.pipe(withTenant(input.tenantId));
		yield* appendWebhookAttemptTimeline({
			createdAt: completedAt,
			payload: toTimelinePayload({
				attempt: attemptNumber,
				attemptId: claimed.id,
				destination: claimed.destination,
				error: result.error,
				nextAttemptAt,
				notificationEventId: claimed.notificationEventId,
				responseCode: result.responseCode,
				status,
			}),
			requestId: claimed.requestId,
			tenantId: input.tenantId,
		});
		if (status === "dead") {
			yield* notifyDeadWebhook({
				attempt: attemptNumber,
				attemptId: claimed.id,
				destination: claimed.destination,
				error: result.error,
				notificationEventId: claimed.notificationEventId,
				occurredAt: completedAt,
				requestId: claimed.requestId,
				responseCode: result.responseCode,
				services,
				tenantId: input.tenantId,
			});
		}
		return {
			error: result.error,
			responseCode: result.responseCode,
			status: status === "dead" ? "failed" : status,
		} satisfies NotificationDispatchResult;
	}
);

const processDueJobsForTenant = (input: {
	readonly tenantId: string;
	readonly now: string;
}) =>
	Effect.gen(function* processDueJobsForTenantProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const due = yield* services.repos.persistence.notificationDeliveryAttempts
			.listDue({
				channel: "webhook",
				limit: 50,
				now: input.now,
			})
			.pipe(withTenant(input.tenantId));
		for (const job of due) {
			yield* processWebhookDeliveryJob({
				attemptId: job.id,
				tenantId: input.tenantId,
			}).pipe(Effect.catch(() => Effect.void));
		}
	});

/**
 * Processes due webhook jobs. Tenant-scoped when `tenantId` is passed,
 * otherwise scans tenant ids then runs each batch through `withTenant`.
 *
 * @param input - Optional tenant filter for tests and request-path drains.
 * @returns An effect that completes after the current due batch.
 */
export const deliverDueWebhookRetries = Effect.fn("deliverDueWebhookRetries")(
	function* deliverDueWebhookRetriesProgram(input?: {
		readonly tenantId?: string;
	}) {
		const services = yield* Effect.service(RuntimeServicesTag);
		const now = yield* currentIsoTimestamp();
		const tenantIds =
			input?.tenantId === undefined
				? yield* services.repos.persistence.notificationDeliveryAttempts.listDueTenantIds(
						{ now }
					)
				: [input.tenantId];
		for (const tenantId of tenantIds) {
			yield* processDueJobsForTenant({ now, tenantId });
		}
	}
);

/**
 * Background retry worker. Polls due webhook jobs until interrupted.
 *
 * Drive time with TestClock in tests. Hosts should fork this effect beside
 * the HTTP server.
 *
 * @returns An effect that runs until interrupted.
 */
export const runWebhookRetryWorker = Effect.fn("runWebhookRetryWorker")(
	function* runWebhookRetryWorkerProgram() {
		yield* deliverDueWebhookRetries();
		yield* Effect.forever(
			Effect.gen(function* pollDueWebhookRetries() {
				yield* Effect.sleep(Duration.millis(WEBHOOK_RETRY_WORKER_POLL_MS));
				yield* deliverDueWebhookRetries().pipe(Effect.catch(() => Effect.void));
			})
		);
	}
);

export {
	delayAfterAttemptMs,
	DEFAULT_WEBHOOK_RETRY_SCHEDULE_MS,
	resolveWebhookRetryPolicy,
	WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE,
	WEBHOOK_RETRY_WORKER_POLL_MS,
} from "./schedule";

export {
	parseNotificationEventType,
	resolveWebhookSigningKey,
	supportsNotificationChannel,
	toDispatchInput,
};

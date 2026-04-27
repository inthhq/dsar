import type { NotificationEventType } from "@dsar/backend/events/contracts";

/**
 * Runtime list of outbound DSAR webhook event type strings.
 */
export const webhookEventTypes = [
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

/**
 * Event type accepted by the DSAR webhook receiver.
 */
export type WebhookEventType = (typeof webhookEventTypes)[number];

/**
 * Compile-time check that the runtime event list matches backend events.
 */
export const webhookEventTypeExhaustivenessCheck = true satisfies Exclude<
	NotificationEventType,
	WebhookEventType
> extends never
	? Exclude<WebhookEventType, NotificationEventType> extends never
		? true
		: never
	: never;

/**
 * Per-event payload map for outbound DSAR webhooks.
 */
export interface WebhookEventPayloadMap {
	/** Payload for a newly captured request notification. */
	readonly request_captured: Record<string, unknown>;
	/** Payload for a request due-date change notification. */
	readonly clock_due_changed: Record<string, unknown>;
	/** Payload for a clock segment opening notification. */
	readonly clock_segment_opened: Record<string, unknown>;
	/** Payload for a clock segment closing notification. */
	readonly clock_segment_closed: Record<string, unknown>;
	/** Payload for a request acknowledgement policy notification. */
	readonly request_acknowledged: Record<string, unknown>;
	/** Payload for an acknowledgement delivery notification. */
	readonly acknowledgement_sent: Record<string, unknown>;
	/** Payload for a verification outcome notification. */
	readonly verification_outcome_recorded: Record<string, unknown>;
	/** Payload for a manifest review notification. */
	readonly manifest_review_recorded: Record<string, unknown>;
	/** Payload for an appeal recorded notification. */
	readonly appeal_recorded: Record<string, unknown>;
	/** Payload for a fulfillment callback notification. */
	readonly fulfillment_callback_received: Record<string, unknown>;
	/** Payload for a delivery preparation notification. */
	readonly delivery_prepared: Record<string, unknown>;
	/** Payload for a step-up challenge notification. */
	readonly step_up_challenge_issued: Record<string, unknown>;
	/** Payload for a request fulfilled notification. */
	readonly request_fulfilled: Record<string, unknown>;
	/** Payload for a request refused notification. */
	readonly request_refused: Record<string, unknown>;
}

/**
 * Compile-time check that the payload map covers every backend event.
 */
export const webhookPayloadMapExhaustivenessCheck = true satisfies Exclude<
	NotificationEventType,
	keyof WebhookEventPayloadMap
> extends never
	? Exclude<keyof WebhookEventPayloadMap, NotificationEventType> extends never
		? true
		: never
	: never;

/**
 * Parsed outbound DSAR webhook event delivered to registered handlers.
 *
 * @typeParam T - Event type key used to narrow the payload shape.
 */
export interface WebhookEvent<
	T extends keyof WebhookEventPayloadMap = keyof WebhookEventPayloadMap,
> {
	/** Unique notification event identifier. */
	readonly eventId: string;
	/** Domain event type for handler dispatch. */
	readonly eventType: T;
	/** DSAR request identifier associated with the event. */
	readonly requestId: string;
	/** Correlation identifier shared across pipeline steps. */
	readonly correlationId: string;
	/** Idempotency key for duplicate delivery handling. */
	readonly idempotencyKey: string;
	/** Policy version active when the event was emitted. */
	readonly policyVersion: string;
	/** Locale associated with the notification event. */
	readonly locale: string;
	/** Event-specific business payload. */
	readonly payload: WebhookEventPayloadMap[T];
}

const webhookEventTypeSet = new Set<string>(webhookEventTypes);

/**
 * Checks whether a value is a known DSAR webhook event type.
 *
 * @param value - Candidate event type value.
 * @returns Whether the value is a supported webhook event type.
 */
export const isWebhookEventType = (value: unknown): value is WebhookEventType =>
	typeof value === "string" && webhookEventTypeSet.has(value);

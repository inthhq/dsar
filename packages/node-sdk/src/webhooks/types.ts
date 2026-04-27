import type { NotificationEventType } from "@dsar/backend";

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

export type WebhookEventType = (typeof webhookEventTypes)[number];

export const webhookEventTypeExhaustivenessCheck = true satisfies Exclude<
	NotificationEventType,
	WebhookEventType
> extends never
	? Exclude<WebhookEventType, NotificationEventType> extends never
		? true
		: never
	: never;

export interface WebhookEventPayloadMap {
	readonly request_captured: Record<string, unknown>;
	readonly clock_due_changed: Record<string, unknown>;
	readonly clock_segment_opened: Record<string, unknown>;
	readonly clock_segment_closed: Record<string, unknown>;
	readonly request_acknowledged: Record<string, unknown>;
	readonly acknowledgement_sent: Record<string, unknown>;
	readonly verification_outcome_recorded: Record<string, unknown>;
	readonly manifest_review_recorded: Record<string, unknown>;
	readonly appeal_recorded: Record<string, unknown>;
	readonly fulfillment_callback_received: Record<string, unknown>;
	readonly delivery_prepared: Record<string, unknown>;
	readonly step_up_challenge_issued: Record<string, unknown>;
	readonly request_fulfilled: Record<string, unknown>;
	readonly request_refused: Record<string, unknown>;
}

export const webhookPayloadMapExhaustivenessCheck = true satisfies Exclude<
	NotificationEventType,
	keyof WebhookEventPayloadMap
> extends never
	? Exclude<keyof WebhookEventPayloadMap, NotificationEventType> extends never
		? true
		: never
	: never;

export interface WebhookEvent<
	T extends keyof WebhookEventPayloadMap = keyof WebhookEventPayloadMap,
> {
	readonly eventId: string;
	readonly eventType: T;
	readonly requestId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string;
	readonly policyVersion: string;
	readonly locale: string;
	readonly payload: WebhookEventPayloadMap[T];
}

const webhookEventTypeSet = new Set<string>(webhookEventTypes);

export const isWebhookEventType = (value: unknown): value is WebhookEventType =>
	typeof value === "string" && webhookEventTypeSet.has(value);

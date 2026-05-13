import type { JsonValue } from "@dsar/persistence";

import type {
	LifecycleAction,
	LifecycleStatus,
} from "../lifecycle/state-machine";

/**
 * Notification event types emitted by lifecycle and fulfillment workflows.
 */
export type NotificationEventType =
	| "request_captured"
	| "clock_due_changed"
	| "clock_segment_opened"
	| "clock_segment_closed"
	// Reserved: policy-gated acknowledgement webhook (see T09 spec)
	| "request_acknowledged"
	| "acknowledgement_sent"
	| "verification_outcome_recorded"
	| "manifest_review_recorded"
	| "appeal_recorded"
	| "fulfillment_callback_received"
	| "delivery_prepared"
	| "step_up_challenge_issued"
	| "request_fulfilled"
	| "request_refused";

/**
 * Draft notification event persisted before channel delivery attempts.
 */
export interface NotificationEventDraft {
	/** Domain event type identifier. */
	readonly eventType: NotificationEventType;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Policy version used for this record or decision. */
	readonly policyVersion: string;
	/** Locale used for template rendering and localized text. */
	readonly locale: string;
	/** Structured payload associated with this event. */
	readonly payload: JsonValue;
}

/**
 * Event emitted when a webhook/email dispatch goes dead after exhausting retries.
 */
export interface DeadDispatchAlertEvent {
	/** Unique event identifier. */
	readonly eventId: string;
	/** Channel that failed (webhook or email). */
	readonly channel: string;
	/** Destination URL or email address. */
	readonly destination: string;
	/** Tenant identifier. */
	readonly tenantId: string;
	/** When the dispatch was marked dead. */
	readonly deadAt: string;
}

/**
 * Derives notification event drafts from a lifecycle transition.
 *
 * @param input - Lifecycle transition context and optional due-date/rationale data.
 * @returns Notification drafts to persist and dispatch for the transition.
 */
export const deriveLifecycleNotificationDrafts = (input: {
	readonly requestId: string;
	readonly action: LifecycleAction;
	readonly from: LifecycleStatus;
	readonly to: LifecycleStatus;
	readonly policyVersion: string;
	readonly locale: string;
	readonly dueAt?: string;
	readonly rationale?: string;
}): readonly NotificationEventDraft[] => {
	const drafts: NotificationEventDraft[] = [];

	const trimmedDueAt = input.dueAt?.trim();
	if (trimmedDueAt && trimmedDueAt.length > 0) {
		drafts.push({
			eventType: "clock_due_changed",
			locale: input.locale,
			payload: {
				action: input.action,
				dueAt: trimmedDueAt,
			},
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	if (
		input.action === "clarification_request" ||
		input.action === "verification_request"
	) {
		drafts.push({
			eventType: "clock_segment_opened",
			locale: input.locale,
			payload: {
				action: input.action,
				from: input.from,
				reason: input.action,
				to: input.to,
			},
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	if (
		input.action === "clarification_receive" ||
		input.action === "verification_approve" ||
		input.action === "verification_reject"
	) {
		drafts.push({
			eventType: "clock_segment_closed",
			locale: input.locale,
			payload: {
				action: input.action,
				from: input.from,
				reason: input.action,
				to: input.to,
			},
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	if (
		input.action === "verification_approve" ||
		input.action === "verification_reject"
	) {
		drafts.push({
			eventType: "verification_outcome_recorded",
			locale: input.locale,
			payload: {
				outcome:
					input.action === "verification_approve" ? "approved" : "rejected",
			},
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	if (input.action === "fulfil") {
		drafts.push({
			eventType: "request_fulfilled",
			locale: input.locale,
			payload: { from: input.from, to: input.to },
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	if (input.action === "refuse") {
		drafts.push({
			eventType: "request_refused",
			locale: input.locale,
			payload: {
				from: input.from,
				rationale: input.rationale ?? null,
				to: input.to,
			},
			policyVersion: input.policyVersion,
			requestId: input.requestId,
		});
	}

	return drafts;
};

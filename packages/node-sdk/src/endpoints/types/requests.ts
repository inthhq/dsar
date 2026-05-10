import type {
	Appeal,
	Authority,
	CapturedIntake,
	DeliveryPackage,
	FulfillmentManifest,
	Requestor,
	VerificationCase,
} from "@dsar/schema";

/**
 * Payload used when creating or receiving a DSAR intake.
 */
export interface IntakePayload {
	/** Jurisdiction used to resolve active policy pack. */
	readonly jurisdiction: string;
	/** Intake source metadata describing where the request originated. */
	readonly intakeSource: CapturedIntake & {
		/** Intake source type used by admin queue provenance views. */
		readonly type?: string;
		/** Optional pointer to raw intake context in upstream systems. */
		readonly rawContextRef?: string;
	};
	/** Optional explicit receipt timestamp for legal clock anchoring. */
	readonly receivedAt?: string;
	/** Optional requestor profile supplied during intake. */
	readonly requestor?: Requestor;
	/** Optional authority evidence context for represented requests. */
	readonly authority?: Authority;
}

/**
 * Minimal request fields returned by list and detail endpoints.
 */
export interface RequestRecord {
	/** Request id in DSAR backend. */
	readonly id?: string;
	/** Current lifecycle status of the request. */
	readonly status: string;
	/** Intake timestamp used for legal-clock calculations. */
	readonly receivedAt?: string;
	/** Current due date after policy and lifecycle adjustments. */
	readonly dueAt?: string;
}

/**
 * Query parameters accepted by the request-list endpoint.
 */
export interface RequestListQuery {
	/** Optional status filter (comma-separated statuses also supported by API). */
	readonly status?: string;
	/** Field used to sort the result set. */
	readonly sortBy?: "receivedAt" | "dueAt" | "status";
	/** Sort direction for ordered results. */
	readonly sortOrder?: "asc" | "desc";
	/** Max rows to return. */
	readonly limit?: number;
	/** Zero-based pagination offset. */
	readonly offset?: number;
	/** Optional due-date risk window in days. */
	readonly atRiskDays?: number;
	/** Optional free-text search across requestor name, email, and request text. */
	readonly search?: string;
}

/**
 * Normalized intake-source details returned in queue and detail payloads.
 */
export interface IntakeSourceSummary {
	/** Provider or domain type discriminator for this payload. */
	readonly type: string;
	/** Timestamp when the request or event was received. */
	readonly receivedAt: string;
	/** Reference to upstream raw intake context for traceability. */
	readonly rawContextRef?: string;
}

/**
 * Request queue row used by triage and operations dashboards.
 */
export interface RequestQueueItem extends RequestRecord {
	/** Intake source details describing request origin. */
	readonly intakeSource?: IntakeSourceSummary;
	/** Requestor identity details associated with the request. */
	readonly requestor?: unknown;
	/** Representative authority evidence for acted-on-behalf requests. */
	readonly authority?: unknown;
}

/**
 * Paginated response payload for request queue queries.
 */
export interface RequestQueueResponse {
	/** Page items returned by this list response. */
	readonly items: readonly RequestQueueItem[];
	/** Total number of records matching the query. */
	readonly total: number;
	/** Maximum number of records to return in one page. */
	readonly limit: number;
	/** Zero-based pagination offset. */
	readonly offset: number;
	/** Field used to sort the result set. */
	readonly sortBy: "receivedAt" | "dueAt" | "status";
	/** Sort direction for ordered results. */
	readonly sortOrder: "asc" | "desc";
}

/**
 * Detailed request payload returned by request detail endpoints.
 */
export interface RequestDetailResponse extends RequestRecord {
	/** Timestamp when the request or event was received. */
	readonly receivedAt?: string;
	/** Clock mode currently governing this request's deadline behavior. */
	readonly clockMode?: string;
	/** Intake source details describing request origin. */
	readonly intakeSource?: unknown;
	/** Requestor identity details associated with the request. */
	readonly requestor?: unknown;
	/** Representative authority evidence for acted-on-behalf requests. */
	readonly authority?: unknown;
	/** Appeal data associated with this request. */
	readonly appeals?: readonly unknown[];
	/** Captured intake payload retained for auditability. */
	readonly capture?: unknown;
}

/**
 * Single timeline event entry returned for a request.
 */
export interface RequestTimelineEventPayload {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Domain event type identifier. */
	readonly eventType: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Structured payload associated with this event. */
	readonly payload: unknown;
}

/**
 * Timeline payload returned by request timeline endpoints.
 */
export interface RequestTimelinePayload {
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Ordered events included in this response payload. */
	readonly events: readonly RequestTimelineEventPayload[];
}

/**
 * Payload accepted by refusal and denial decision endpoints.
 */
export interface RefusalPayload {
	/** Operator rationale for refusal action. */
	readonly rationale?: string;
	/** Alternate refusal reason field accepted by API. */
	readonly reason?: string;
	/** Optional freeform refusal message. */
	readonly message?: string;
}

/**
 * Single delivery attempt attached to a notification event.
 */
export interface NotificationAttemptPayload {
	/** Attempt number in the retry sequence, starting at 1. */
	readonly attempt: number;
	/** Channel used for delivery (for example email or webhook). */
	readonly channel: string;
	/** Resolved destination address or endpoint. */
	readonly destination: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Delivery result for this specific attempt. */
	readonly status: "pending" | "delivered" | "failed" | "skipped" | "dead";
	/** Provider response code returned for this attempt. */
	readonly responseCode?: number;
	/** Failure reason returned by the provider or runtime. */
	readonly error?: string;
}

/**
 * Notification event payload with associated delivery attempts.
 */
export interface NotificationEventPayload {
	/** Identifier of the related event. */
	readonly eventId: string;
	/** Domain event type identifier. */
	readonly eventType: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Aggregate delivery status for the notification event. */
	readonly status: "generated" | "delivered" | "failed" | "skipped";
	/** Delivery attempts recorded for this notification event. */
	readonly attempts: readonly NotificationAttemptPayload[];
}

/**
 * Notification history payload scoped to a request.
 */
export interface RequestNotificationsPayload {
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Ordered events included in this response payload. */
	readonly events: readonly NotificationEventPayload[];
}

/**
 * Computed legal-clock explanation payload for a request.
 */
export interface ClockExplainPayload {
	/** Request id the explanation belongs to. */
	readonly requestId?: string;
	/** Base deadline field from older/alternate payloads. */
	readonly baseDeadline?: string;
	/** Base due date before adjustments. */
	readonly baseDueAt?: string;
	/** Final due date after pauses/extensions. */
	readonly finalDueAt: string;
	/** Policy pack identifier used for deadline computation. */
	readonly policyPack: string;
	/** Policy version used for this computation. */
	readonly policyVersion: string;
	/** Clock pause intervals applied to the deadline calculation. */
	readonly pauses: readonly {
		/** Pause reason contributing to deadline suspension. */
		readonly reason: string;
		/** Duration of the pause interval (ISO-8601 duration string). */
		readonly duration: string;
	}[];
	/** Deadline extensions applied by policy or operator action. */
	readonly extensions: readonly {
		/** Additional days granted via extensions. */
		readonly additionalDays: number;
		/** Business justification for extension grant. */
		readonly justification: string;
	}[];
	/** Computed legal-clock details used for explainability. */
	readonly clock: {
		/** Intake timestamp used as clock baseline. */
		readonly receivedAt: string;
		/** Current computed due date. */
		readonly dueAt: string;
		/** Clock mode that governs due-date behavior. */
		readonly clockMode: string;
		/** Detailed segment breakdown for explainability/audit. */
		readonly segments: readonly unknown[];
	};
}

/**
 * Verification summary payload for request identity checks.
 */
export interface VerificationPayload {
	/** Verification assurance level required or recorded. */
	readonly level?: string;
	/** Verification method selected or completed. */
	readonly method?: string;
	/** Reason verification is required for this request. */
	readonly reasonForDoubt?: string;
}

/**
 * Address-verification outcome payload for delivery workflows.
 */
export interface DeliveryAddressVerifyPayload {
	/** Delivery address that was verified. */
	readonly address: string;
	/** Request id associated with the address verification step. */
	readonly requestId: string;
	/** Whether the delivery address passed verification checks. */
	readonly verified: boolean;
	/** Timestamp the verification outcome was recorded. */
	readonly verifiedAt: string;
}

/**
 * Step-up verification challenge payload issued to the subject.
 */
export interface StepUpChallengePayload {
	/** Challenge identifier issued for step-up verification. */
	readonly challengeId: string;
	/** Channel selected for challenge delivery. */
	readonly channel: "email" | "sms" | "auth_app";
	/** Timestamp when this challenge was issued. */
	readonly issuedAt: string;
	/** Request id bound to this challenge flow. */
	readonly requestId: string;
}

/**
 * Step-up challenge completion payload.
 */
export interface StepUpCompletePayload {
	/** Challenge identifier being completed. */
	readonly challengeId: string;
	/** Completion timestamp for audit and timeout checks. */
	readonly completedAt: string;
	/** Whether step-up verification succeeded. */
	readonly success: boolean;
}

/**
 * Signed artifact-download payload returned by delivery endpoints.
 */
export interface ArtifactDownloadPayload {
	/** Artifact id being authorized for download. */
	readonly artifactId: string;
	/** Token expiry timestamp for secure link handling. */
	readonly expiresAt: string;
	/** Access token used for gated artifact retrieval. */
	readonly token: string;
}

/**
 * Single delivery lifecycle log entry.
 */
export interface DeliveryLogPayload {
	/** Delivery log event id. */
	readonly id: string;
	/** Request id this delivery lifecycle event belongs to. */
	readonly requestId: string;
	/** Delivery lifecycle event emitted for this request. */
	readonly event:
		| "prepare"
		| "address_verified"
		| "step_up_issued"
		| "step_up_completed"
		| "download";
	/** Timestamp this delivery event occurred. */
	readonly occurredAt: string;
}

/**
 * Decision payload used to approve or reject a fulfilment manifest.
 */
export interface ManifestValidatePayload {
	/** Approval decision for the fulfilment manifest. */
	readonly action: "approved" | "rejected";
}

/**
 * Callback payload posted by fulfilment integrations.
 */
export interface FulfilmentCallbackPayload {
	/** Artifact manifest sent by the fulfilment integration when processing is complete. */
	readonly manifest: {
		/** Artifact entries describing the files produced during fulfilment. */
		readonly artifacts: readonly unknown[];
	};
}

/**
 * Appeal-decision payload accepted by appeals endpoints.
 */
export interface AppealDecisionPayload {
	/** Appeal outcome selected by reviewer/workflow. */
	readonly decision: "approve" | "deny" | "partial";
	/** Optional reviewer explanation for decision transparency. */
	readonly explanation?: string;
}

/**
 * Response payload for notification replay operations.
 */
export interface NotificationReplayResponse {
	/** Identifier of the related event. */
	readonly eventId: string;
	/** Replay status returned by the backend. */
	readonly status: "replayed";
}

export type { Appeal, DeliveryPackage, FulfillmentManifest, VerificationCase };

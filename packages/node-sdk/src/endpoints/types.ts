import type { AuditEvent, RetentionPolicy } from "@dsar/schema";

import type { CallApiInput, DsarResult } from "../types";

export type {
	Appeal,
	DeliveryPackage,
	FulfillmentManifest,
	VerificationCase,
} from "./types/requests";
export type {
	AppealDecisionPayload,
	ArtifactDownloadPayload,
	ClockExplainPayload,
	DeliveryAddressVerifyPayload,
	DeliveryLogPayload,
	FulfilmentCallbackPayload,
	IntakePayload,
	IntakeSourceSummary,
	ManifestValidatePayload,
	NotificationReplayResponse,
	RefusalPayload,
	RequestDetailResponse,
	RequestListQuery,
	RequestNotificationsPayload,
	RequestQueueItem,
	RequestQueueResponse,
	RequestRecord,
	RequestTimelineEventPayload,
	RequestTimelinePayload,
	StepUpChallengePayload,
	StepUpCompletePayload,
	VerificationPayload,
} from "./types/requests";

/**
 * Response payload returned when creating a policy-upgrade proposal.
 */
export interface PolicyUpgradeProposalResponse {
	/** Identifier of the policy-upgrade proposal. */
	readonly proposalId: string;
	/** Current workflow status for the upgrade proposal. */
	readonly status: string;
	/** Next recommended state or action from the workflow. */
	readonly next: string;
}

/**
 * Response payload for policy-upgrade approval or rejection actions.
 */
export interface PolicyUpgradeActionResponse {
	/** Resulting workflow status after applying the action. */
	readonly status: string;
	/** Identifier of the policy-upgrade proposal. */
	readonly proposalId: string;
}

/**
 * Response payload returned after registering a custom policy pack.
 */
export interface CustomPolicyRegisterResponse {
	/** Jurisdiction the custom policy pack was registered under. */
	readonly jurisdiction: string;
	/** Name of the custom policy pack that was registered. */
	readonly name: string;
	/** Registration status for the custom policy pack. */
	readonly status: "registered";
	/** Version that was registered for the custom policy pack. */
	readonly version: string;
}

/**
 * Response payload returned after activating a custom policy pack.
 */
export interface CustomPolicyActivateResponse {
	/** Jurisdiction where the policy pack was activated. */
	readonly jurisdiction: string;
	/** Activation status for the custom policy pack. */
	readonly status: "activated";
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId: string;
	/** Version of the policy pack that is now active. */
	readonly version: string;
	/** Workspace identifier when the record is workspace-scoped. */
	readonly workspaceId?: string;
}

/**
 * Response payload returned after deactivating a custom policy pack.
 */
export interface CustomPolicyDeactivateResponse {
	/** Deactivation status for the custom policy pack. */
	readonly status: "deactivated";
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId: string;
	/** Workspace identifier when the record is workspace-scoped. */
	readonly workspaceId?: string;
}

/**
 * Raw inbound Resend webhook event payload.
 */
export interface WebhookInboundResendPayload {
	/** Provider timestamp for when the webhook event was created. */
	readonly created_at: string;
	/** Raw provider event body forwarded by the webhook transport. */
	readonly data: unknown;
	/** Provider event type discriminator. */
	readonly type: string;
}

/**
 * Normalized response returned after processing an inbound webhook event.
 */
export interface WebhookInboundResendResponse {
	/** Stable identifier for this record. */
	readonly id?: string;
	/** Jurisdiction inferred for policy resolution during intake. */
	readonly jurisdiction?: string;
	/** Timestamp when the request or event was received. */
	readonly receivedAt?: string;
	/** Provider/source identifier used for cross-system correlation. */
	readonly sourceId: string;
	/** Processing outcome for the inbound event. */
	readonly status: "captured" | "ignored_non_dsar";
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId?: string;
	/** Workspace identifier when the record is workspace-scoped. */
	readonly workspaceId?: string;
}

/**
 * Raw inbound Slack webhook payload forwarded to DSAR.
 */
export type WebhookInboundSlackPayload = unknown;

/**
 * Payload accepted by webhook signing-key rotation.
 */
export interface WebhookRotateKeyPayload {
	/** Grace-window duration in days for the demoted previous primary key. */
	readonly gracePeriodDays?: number;
}

/**
 * Response returned after rotating a webhook endpoint signing key.
 */
export interface WebhookRotateKeyResponse {
	/** Key ids currently valid for this endpoint after rotation. */
	readonly activeKeyIds: readonly string[];
	/** Endpoint whose key was rotated. */
	readonly endpointId: string;
	/** New primary key identifier. */
	readonly newPrimaryKeyId: string;
	/** Newly generated signing secret, returned once. */
	readonly newSigningSecret: string;
	/** Grace-window expiry for the demoted previous primary key. */
	readonly previousKeyExpiresAt?: string;
	/** Previous primary key identifier, when one existed. */
	readonly previousKeyId?: string;
}

/**
 * Slack inbound webhook may either echo a challenge or return a normal DSAR
 * capture/ignore response envelope.
 */
export type WebhookInboundSlackResponse =
	| {
			readonly challenge: string;
	  }
	| {
			readonly callbackId?: string;
			readonly channelId?: string;
			readonly id?: string;
			readonly jurisdiction?: string;
			readonly reason?: string;
			readonly receivedAt?: string;
			readonly sourceId: string;
			readonly status: "captured" | "ignored_non_dsar";
			readonly surface?: string;
			readonly teamId?: string;
			readonly tenantId?: string;
			readonly workspaceId?: string;
	  };

/**
 * Subject profile payload with a summary of related requests.
 */
export interface SubjectProfileResponse {
	/** Subject identifier used to correlate profile and request history. */
	readonly subjectId: string;
	/** Cursor pagination metadata for the associated request summaries. */
	readonly pagination: {
		/** Bounded page size used by the backend. */
		readonly limit: number;
		/** Cursor to pass on the next call when more records are available. */
		readonly nextCursor?: string;
	};
	/** Summaries of DSAR requests associated with this subject. */
	readonly requests: readonly {
		readonly id: string;
		readonly status: string;
		readonly receivedAt: string;
	}[];
}

/**
 * Query parameters accepted by subject profile request lookup.
 */
export interface SubjectProfileQuery {
	readonly [key: string]: string | number | boolean | undefined;
	/** Cursor returned by a previous subject profile lookup page. */
	readonly cursor?: string;
	/** Maximum request summaries to return. */
	readonly limit?: number;
	/** Optional comma-separated lifecycle status filter. */
	readonly status?: string;
	/** Return requests created strictly after this ISO timestamp. */
	readonly created_after?: string;
	/** Return requests created strictly before this ISO timestamp. */
	readonly created_before?: string;
	/** Optional active policy pack filter. */
	readonly policy_pack?: string;
}

/**
 * Initialization status payload returned by system endpoints.
 */
export interface InitResponse {
	/** Indicates whether startup initialization completed successfully. */
	readonly initialized: boolean;
}

/**
 * Service health/status payload returned by system endpoints.
 */
export interface StatusResponse {
	/** Service/system identifier reporting status. */
	readonly service: string;
	/** Current service health status. */
	readonly status: string;
}

/**
 * Audit export payload for a request.
 */
export interface AuditExportResponse {
	/** Request id whose audit chain is exported. */
	readonly requestId: string;
	/** Export format chosen by caller. */
	readonly format: "jsonl" | "csv";
	/** Ordered immutable audit events in the export payload. */
	readonly events: readonly AuditEvent[];
	/** Root hash used to verify full-chain integrity (absent when the event list is empty). */
	readonly rootHash?: string;
}

/**
 * Audit-chain verification result payload.
 */
export interface AuditVerifyResponse {
	/** Whether the provided/exported audit chain verified successfully. */
	readonly verified: boolean;
	/** Verification status for quick branching in clients. */
	readonly status: "verified" | "failed";
	/** Hash mismatches detected during audit-chain verification. */
	readonly mismatches: readonly {
		/** Audit event id where mismatch was detected. */
		readonly eventId: string;
		/** Expected hash value from chain computation. */
		readonly expectedHash: string;
		/** Actual hash value observed in payload/store. */
		readonly actualHash: string;
	}[];
}

/**
 * Shared request context used by endpoint factory modules.
 */
export interface EndpointContext {
	/** Generic API caller used by endpoint modules. */
	readonly call: <T>(input: CallApiInput) => Promise<DsarResult<T>>;
}

export type { RetentionPolicy };

import type { Effect } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { TenantContext } from "../tenant/context";
import type { PersistenceError } from "./errors";

/**
 * JSON primitive value supported by persistence payload fields.
 *
 * @public
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON-like payload value supported by persistence metadata fields.
 *
 * @public
 */
export type JsonValue =
	| JsonPrimitive
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[];

/**
 * Mandatory tenant scope for all repository operations.
 *
 * @public
 */
export interface TenantScope {
	/** Tenant identifier used for hard scoping every query/write. */
	readonly tenantId: string;
}

/**
 * Shared pagination contract for list operations.
 *
 * @public
 */
export interface PaginationInput {
	/** Zero-based pagination offset. */
	readonly offset?: number;
	/** Maximum rows to read for a single page. */
	readonly limit?: number;
}

/**
 * Stable cursor for request subject lookup pages.
 *
 * @public
 */
export interface RequestSubjectCursor {
	/** Creation timestamp of the last item returned to the caller. */
	readonly createdAt: string;
	/** Request id of the last item returned to the caller. */
	readonly id: string;
}

/**
 * Filter contract for indexed subject request lookup.
 *
 * @public
 */
export interface ListRequestsBySubjectInput {
	/** Normalized subject identifiers to match against subject id, external ref, or requestor email. */
	readonly identifiers: readonly string[];
	/** Optional lifecycle statuses to include. */
	readonly status?: readonly string[];
	/** Return records created strictly after this ISO timestamp. */
	readonly createdAfter?: string;
	/** Return records created strictly before this ISO timestamp. */
	readonly createdBefore?: string;
	/** Optional active policy pack id filter. */
	readonly policyPack?: string;
	/** Cursor returned by the previous page. */
	readonly cursor?: RequestSubjectCursor;
	/** Maximum rows to read for a single page. */
	readonly limit?: number;
}

/**
 * Cursor-paginated request page.
 *
 * @public
 */
export interface RequestSubjectPage {
	/** Matching request records in descending creation order. */
	readonly items: readonly RequestRecord[];
	/** Cursor for the next page when more records are available. */
	readonly nextCursor?: RequestSubjectCursor;
	/** Bounded page size used by the query. */
	readonly limit: number;
}

/**
 * Persistent request row with capability-upgrade fields.
 *
 * @public
 */
export interface RequestRecord {
	/** Stable request identifier used across lifecycle, audit, and notifications. */
	readonly id: string;
	/** Tenant ownership boundary for data-isolation enforcement. */
	readonly tenantId: string;
	/** Current lifecycle status used for route gating and SLA reporting. */
	readonly status: string;
	/** Intake timestamp that anchors statutory deadline calculations. */
	readonly receivedAt: string;
	/** Current computed due date after policy clock adjustments. */
	readonly dueAt: string;
	/** Clock model currently governing due-date calculations. */
	readonly clockMode: string;
	/** Captured requestor profile used for eligibility and fulfillment scope. */
	readonly requestor: JsonValue;
	/** Authority evidence state for representative/agent requests. */
	readonly authority: JsonValue;
	/** Raw intake capture payload retained for explainability. */
	readonly capture: JsonValue;
	/** Appeal records associated with this request lifecycle. */
	readonly appeals: JsonValue;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Last mutation timestamp for concurrency and audit trails. */
	readonly updatedAt: string;
}

/**
 * Input payload for creating request records.
 *
 * @public
 */
export interface CreateRequestInput {
	/** Caller-supplied stable request id (generated upstream). */
	readonly id: string;
	/** Initial lifecycle state on request creation. */
	readonly status: string;
	/** Intake timestamp anchoring legal deadline computation. */
	readonly receivedAt: string;
	/** Baseline due date at creation time. */
	readonly dueAt: string;
	/** Clock mode selected for this request. */
	readonly clockMode: string;
	/** Normalized requestor details for downstream processing. */
	readonly requestor: JsonValue;
	/** Authority context used for verification decisions. */
	readonly authority: JsonValue;
	/** Raw capture payload retained for legal traceability. */
	readonly capture: JsonValue;
	/** Initial appeals payload (often empty) for consistent schema shape. */
	readonly appeals: JsonValue;
}

/**
 * Patch payload for request updates.
 *
 * @public
 */
export interface UpdateRequestInput {
	/** Optional lifecycle status transition target. */
	readonly status?: string;
	/** Optional recomputed due date from policy/legal clock updates. */
	readonly dueAt?: string;
	/** Optional clock mode transition marker. */
	readonly clockMode?: string;
	/** Optional requestor profile patch. */
	readonly requestor?: JsonValue;
	/** Optional authority evidence patch. */
	readonly authority?: JsonValue;
	/** Optional capture payload patch for corrected intake data. */
	readonly capture?: JsonValue;
	/** Optional appeals payload patch. */
	readonly appeals?: JsonValue;
	/** Required mutation timestamp for deterministic audit sequencing. */
	readonly updatedAt: string;
}

/**
 * Request timeline event stored in append-only style.
 *
 * @public
 */
export interface RequestTimelineEventRecord {
	/** Immutable timeline event identifier. */
	readonly id: string;
	/** Tenant boundary for timeline event storage/query. */
	readonly tenantId: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Domain event name (captured, acknowledged, paused, etc.). */
	readonly eventType: string;
	/** Event payload with action-specific business context. */
	readonly payload: JsonValue;
	/** Event occurrence timestamp used in legal-clock reconstruction. */
	readonly createdAt: string;
}

/**
 * Input payload for creating request timeline events.
 *
 * @public
 */
export interface CreateRequestTimelineEventInput {
	/** Unique timeline event identifier (generated upstream). */
	readonly id: string;
	/** Parent request this event belongs to. */
	readonly requestId: string;
	/** Domain event name (captured, acknowledged, paused, extended, etc.). */
	readonly eventType: string;
	/** Event payload with action-specific business context. */
	readonly payload: JsonValue;
	/** ISO-8601 occurrence timestamp used for legal-clock reconstruction. */
	readonly createdAt: string;
}

/**
 * Persistent legal-clock segment row for explainability and audits.
 *
 * @public
 */
export interface ClockSegmentRecord {
	/** Immutable clock-segment identifier for auditability. */
	readonly id: string;
	/** Tenant boundary for this segment record. */
	readonly tenantId: string;
	/** Request id this segment contributes to. */
	readonly requestId: string;
	/** Segment start timestamp. */
	readonly from: string;
	/** Segment end timestamp. */
	readonly to: string;
	/** Business reason for this segment state (pause/run/extension). */
	readonly reason: string;
	/** Indicates whether elapsed time in this segment counts toward deadline. */
	readonly countsTowardDeadline: boolean;
	/** Policy version responsible for this segment behavior. */
	readonly policyVersion: string;
	/** Actor that caused this segment transition. */
	readonly actor: string;
}

/**
 * Input payload for creating legal-clock segments.
 *
 * @public
 */
export interface CreateClockSegmentInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Segment start timestamp. */
	readonly from: string;
	/** Segment end timestamp. */
	readonly to: string;
	/** Structured rationale payload for this operation. */
	readonly reason: string;
	/** Whether elapsed time in this segment reduces remaining deadline. */
	readonly countsTowardDeadline: boolean;
	/** Policy version used for this record or decision. */
	readonly policyVersion: string;
	/** Actor or principal responsible for this operation. */
	readonly actor: string;
}

/**
 * Policy assignment persisted against a request.
 *
 * @public
 */
export interface PolicyAssignmentRecord {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Policy pack identifier applied to this request. */
	readonly policyPack: string;
	/** Policy version used for this record or decision. */
	readonly policyVersion: string;
	/** Timestamp when the policy assignment was recorded. */
	readonly assignedAt: string;
}

/**
 * Input payload for policy assignments.
 *
 * @public
 */
export interface CreatePolicyAssignmentInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Policy pack identifier applied to this request. */
	readonly policyPack: string;
	/** Policy version used for this record or decision. */
	readonly policyVersion: string;
	/** Timestamp when the policy assignment was recorded. */
	readonly assignedAt: string;
}

/**
 * Verification evidence metadata record.
 *
 * @public
 */
export interface VerificationEvidenceRecord {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Verification assurance level required or recorded. */
	readonly level: string;
	/** Reason additional identity verification is required. */
	readonly reasonForDoubt: string;
	/** Verification methods allowed for this request. */
	readonly methodsAllowed: JsonValue;
	/** Current verification workflow status. */
	readonly status: string;
	/** Evidence artifacts captured during verification. */
	readonly evidenceArtifacts: JsonValue;
	/** Timestamp when verification evidence is eligible for retention expiry. */
	readonly retentionExpiresAt: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Timestamp when this record was last updated. */
	readonly updatedAt: string;
}

/**
 * Input payload for verification evidence metadata.
 *
 * @public
 */
export interface CreateVerificationEvidenceInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Verification assurance level required or recorded. */
	readonly level: string;
	/** Reason additional identity verification is required. */
	readonly reasonForDoubt: string;
	/** Verification methods allowed for this request. */
	readonly methodsAllowed: JsonValue;
	/** Initial verification workflow status to persist. */
	readonly status: string;
	/** Evidence artifacts captured during verification. */
	readonly evidenceArtifacts: JsonValue;
	/** Timestamp when verification evidence is eligible for retention expiry. */
	readonly retentionExpiresAt: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Timestamp when this record was last updated. Defaults to `createdAt` when omitted. */
	readonly updatedAt?: string;
}

/**
 * Fulfillment artifact metadata record.
 *
 * @public
 */
export interface FulfillmentArtifactRecord {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Tenant identifier used for isolation and access control. */
	readonly tenantId: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Manifest metadata describing the artifacts available for fulfillment. */
	readonly artifactManifest: JsonValue;
	/** Validation state of the fulfillment artifact set. */
	readonly validationState: string;
	/** Delivery preparation payload generated before outbound distribution. */
	readonly deliveryPrepare: JsonValue;
	/** Delivery activity log entries for this artifact set. */
	readonly deliveryLogs: JsonValue;
	/** Token-gating metadata used to secure artifact access. */
	readonly tokenGate: JsonValue;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Timestamp when this record was last updated. */
	readonly updatedAt: string;
}

/**
 * Input payload for fulfillment artifact metadata.
 *
 * @public
 */
export interface CreateFulfillmentArtifactInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Manifest metadata describing the artifacts being created. */
	readonly artifactManifest: JsonValue;
	/** Initial validation state for the artifact set. */
	readonly validationState: string;
	/** Delivery preparation payload persisted at creation time. */
	readonly deliveryPrepare: JsonValue;
	/** Initial delivery log payload persisted with the artifact set. */
	readonly deliveryLogs: JsonValue;
	/** Initial token-gating metadata for secure artifact delivery. */
	readonly tokenGate: JsonValue;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Timestamp when this record was last updated. Defaults to `createdAt` when omitted. */
	readonly updatedAt?: string;
}

/**
 * Patch payload for fulfillment artifact updates.
 *
 * @public
 */
export interface UpdateFulfillmentArtifactInput {
	/** Updated manifest metadata describing the artifacts available for fulfillment. */
	readonly artifactManifest?: JsonValue;
	/** Updated validation state for the artifact set. */
	readonly validationState?: string;
	/** Updated delivery preparation payload. */
	readonly deliveryPrepare?: JsonValue;
	/** Additional or replacement delivery log payload. */
	readonly deliveryLogs?: JsonValue;
	/** Updated token-gating metadata for artifact access control. */
	readonly tokenGate?: JsonValue;
	/** Timestamp when this record was last updated. */
	readonly updatedAt: string;
}

/**
 * Retention classes supported by tenant policy configuration.
 *
 * @public
 */
export type RetentionClass =
	| "request_record"
	| "audit_event"
	| "verification_evidence"
	| "fulfilment_artifact"
	| "delivery_log"
	| "notification_log";

/**
 * Tenant retention policy record.
 *
 * @public
 */
export interface RetentionPolicyRecord {
	/** Stable retention policy identifier. */
	readonly id: string;
	/** Tenant whose data-retention policy this record enforces. */
	readonly tenantId: string;
	/** Data class controlled by this retention policy rule. */
	readonly class: RetentionClass;
	/** Minimum legal retention period in days. */
	readonly minDays: number;
	/** Maximum retention period in days before purge eligibility. */
	readonly maxDays: number;
	/** Enables automated purging when true. */
	readonly purgeEnabled: boolean;
	/** Enables legal hold overrides for this data class. */
	readonly legalHoldEnabled: boolean;
	/** Last policy update timestamp for governance traceability. */
	readonly updatedAt: string;
}

/**
 * Upsert payload for retention policies.
 *
 * @public
 */
export interface UpsertRetentionPolicyInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Data class this retention policy governs. */
	readonly class: RetentionClass;
	/** Minimum retention period in days. */
	readonly minDays: number;
	/** Maximum retention period in days before purge eligibility. */
	readonly maxDays: number;
	/** Whether automated purge is enabled for this data class. */
	readonly purgeEnabled: boolean;
	/** Whether legal holds can suspend purging for this class. */
	readonly legalHoldEnabled: boolean;
	/** Timestamp when this record was last updated. */
	readonly updatedAt: string;
}

/**
 * Immutable audit event record with hash-chain fields.
 *
 * @public
 */
export interface AuditEventRecord {
	/** Immutable audit event identifier. */
	readonly id: string;
	/** Tenant scope for audit visibility and export filtering. */
	readonly tenantId: string;
	/** Optional related request id when event is request-scoped. */
	readonly requestId?: string;
	/** Actor responsible for the state transition. */
	readonly actor: string;
	/** Action verb describing what changed. */
	readonly action: string;
	/** Domain object impacted by the action. */
	readonly object: string;
	/** Before-state snapshot used for diff/reconstruction. */
	readonly before: JsonValue;
	/** After-state snapshot used for diff/reconstruction. */
	readonly after: JsonValue;
	/** Rationale and contextual evidence for the change. */
	readonly reason: JsonValue;
	/** Previous hash in the append-only hash chain. */
	readonly prevHash?: string;
	/** Hash of this event for tamper-evident audit guarantees. */
	readonly hash: string;
	/** Hash algorithm identifier used for verification. */
	readonly hashAlg: string;
	/** Monotonic event sequence within tenant/audit stream. */
	readonly sequence: number;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Input payload for immutable audit append operations.
 *
 * @public
 */
export interface CreateAuditEventInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId?: string;
	/** Actor or principal responsible for this operation. */
	readonly actor: string;
	/** Action name captured for this operation. */
	readonly action: string;
	/** Domain object targeted by this operation. */
	readonly object: string;
	/** State snapshot captured before this operation. */
	readonly before: JsonValue;
	/** State snapshot captured after this operation. */
	readonly after: JsonValue;
	/** Structured rationale payload for this operation. */
	readonly reason: JsonValue;
	/** Previous hash in the audit chain. */
	readonly prevHash?: string;
	/** Hash for this event in the tamper-evident chain. */
	readonly hash: string;
	/** Hash algorithm used to compute event hashes. */
	readonly hashAlg: string;
	/** Monotonic sequence number for deterministic ordering. */
	readonly sequence: number;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Immutable notification generation event record.
 *
 * @public
 */
export interface NotificationEventRecord {
	/** Immutable notification event identifier. */
	readonly id: string;
	/** Tenant scope for notification event storage and lookup. */
	readonly tenantId: string;
	/** Request id this notification event belongs to. */
	readonly requestId: string;
	/** Domain notification type used by channel adapters/templates. */
	readonly eventType: string;
	/** Business payload delivered to notification channels. */
	readonly payload: JsonValue;
	/** Correlation id linking this event to upstream request flow. */
	readonly correlationId: string;
	/** Idempotency key preventing duplicate event dispatch. */
	readonly idempotencyKey: string;
	/** Policy version active when event was generated. */
	readonly policyVersion: string;
	/** Locale used for user-facing notification rendering. */
	readonly locale: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Input payload for notification generation event append operations.
 *
 * @public
 */
export interface CreateNotificationEventInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Domain event type identifier. */
	readonly eventType: string;
	/** Structured payload associated with this event. */
	readonly payload: JsonValue;
	/** Correlation identifier linking this record to upstream flows. */
	readonly correlationId: string;
	/** Idempotency key used to prevent duplicate writes. */
	readonly idempotencyKey: string;
	/** Policy version used for this record or decision. */
	readonly policyVersion: string;
	/** Locale used for template rendering and localized text. */
	readonly locale: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Delivery outcome status for notification channels.
 *
 * @public
 */
export type NotificationDeliveryStatus =
	| "pending"
	| "delivered"
	| "failed"
	| "skipped"
	| "dead";

/**
 * Immutable delivery-attempt event record associated with a notification event.
 *
 * @public
 */
export interface NotificationDeliveryAttemptRecord {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Tenant scope for this attempt record. */
	readonly tenantId: string;
	/** Parent notification event id this attempt belongs to. */
	readonly notificationEventId: string;
	/** Owning request id for cross-surface tracing. */
	readonly requestId: string;
	/** Channel used for delivery (for example email or webhook). */
	readonly channel: string;
	/** Target destination endpoint/address for this attempt. */
	readonly destination: string;
	/** Attempt number in the retry sequence. */
	readonly attempt: number;
	/** Delivery outcome status for this attempt. */
	readonly status: NotificationDeliveryStatus;
	/** Optional provider response code for diagnostics. */
	readonly responseCode?: number;
	/** Optional failure reason when delivery was not successful. */
	readonly error?: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Input payload for immutable notification delivery attempt append operations.
 *
 * @public
 */
export interface CreateNotificationDeliveryAttemptInput {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Parent notification event identifier for this attempt. */
	readonly notificationEventId: string;
	/** Owning request identifier for this record. */
	readonly requestId: string;
	/** Channel used for delivery (for example email or webhook). */
	readonly channel: string;
	/** Resolved destination address or endpoint. */
	readonly destination: string;
	/** Attempt number in the retry sequence, starting at 1. */
	readonly attempt: number;
	/** Delivery outcome status recorded for this attempt. */
	readonly status: NotificationDeliveryStatus;
	/** Provider response code returned for this attempt. */
	readonly responseCode?: number;
	/** Failure reason returned by the provider or runtime. */
	readonly error?: string;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
}

/**
 * Persisted outbound webhook endpoint configuration.
 *
 * @public
 */
export interface WebhookEndpointRecord {
	/** Stable endpoint identifier within the tenant. */
	readonly id: string;
	/** Tenant scope for endpoint storage and lookup. */
	readonly tenantId: string;
	/** Destination URL receiving outbound webhook notifications. */
	readonly url: string;
	/** Timestamp when this endpoint was first recorded. */
	readonly createdAt: string;
	/** Timestamp when this endpoint was last updated. */
	readonly updatedAt: string;
}

/**
 * Role assigned to a persisted webhook signing key.
 *
 * @public
 */
export type WebhookSigningKeyRole = "primary" | "secondary";

/**
 * Persisted HMAC signing key for an outbound webhook endpoint.
 *
 * @public
 */
export interface WebhookSigningKeyRecord {
	/** Stable signing-key identifier. */
	readonly id: string;
	/** Tenant scope for key storage and lookup. */
	readonly tenantId: string;
	/** Endpoint this key signs for. */
	readonly endpointId: string;
	/** HMAC secret used to sign outbound payloads. */
	readonly secret: string;
	/** Whether this key is the current primary or a grace-window secondary. */
	readonly role: WebhookSigningKeyRole;
	/** Optional timestamp after which secondary keys are no longer accepted. */
	readonly expiresAt?: string;
	/** Timestamp when this key was created. */
	readonly createdAt: string;
}

/**
 * Input used to seed or update a configured outbound webhook endpoint.
 *
 * @public
 */
export interface EnsureWebhookEndpointInput {
	/** Stable endpoint identifier within the tenant. */
	readonly id: string;
	/** Destination URL receiving outbound webhook notifications. */
	readonly url: string;
	/** Initial signing secret used only when no primary key exists yet. */
	readonly signingSecret: string;
	/** Optional deterministic key identifier for tests or import tooling. */
	readonly keyId?: string;
	/** Timestamp used for endpoint/key creation and update fields. */
	readonly createdAt: string;
}

/**
 * Input used to rotate an outbound webhook endpoint signing key.
 *
 * @public
 */
export interface RotateWebhookSigningKeyInput {
	/** Endpoint whose primary signing key should rotate. */
	readonly endpointId: string;
	/** Stable identifier for the newly generated primary key. */
	readonly newKeyId: string;
	/** Newly generated HMAC signing secret. */
	readonly newSecret: string;
	/** Expiry assigned to the demoted previous primary key. */
	readonly graceExpiresAt: string;
	/** Timestamp when the rotation occurred. */
	readonly rotatedAt: string;
}

/**
 * Result returned by webhook signing-key rotation.
 *
 * @public
 */
export interface RotateWebhookSigningKeyResult {
	/** Endpoint whose key was rotated. */
	readonly endpoint: WebhookEndpointRecord;
	/** Newly persisted primary key. */
	readonly newPrimary: WebhookSigningKeyRecord;
	/** Previous primary key demoted into the grace window, when one existed. */
	readonly previousPrimary?: WebhookSigningKeyRecord;
	/** Currently usable primary/secondary keys after rotation. */
	readonly activeKeys: readonly WebhookSigningKeyRecord[];
}

/**
 * Input used to undo a failed signing-key rotation side effect.
 *
 * @public
 */
export interface RollbackWebhookSigningKeyRotationInput {
	/** Endpoint whose rotation should be undone. */
	readonly endpointId: string;
	/** Newly inserted primary key that should be removed. */
	readonly newKeyId: string;
	/** Previous primary key to promote back when one existed. */
	readonly previousPrimary?: WebhookSigningKeyRecord;
}

/**
 * Cached chat runtime state entry persisted for subscriptions, dedupe, and
 * per-thread state.
 *
 * @public
 */
export interface ChatStateRecord {
	/** Stable cache key. */
	readonly key: string;
	/** Tenant scope for this cache entry. */
	readonly tenantId: string;
	/** JSON-serializable value stored for the key. */
	readonly value: JsonValue;
	/** Optional expiry timestamp for TTL-managed entries. */
	readonly expiresAt?: string;
	/** Timestamp when this record was first created. */
	readonly createdAt: string;
	/** Timestamp when this record was last updated. */
	readonly updatedAt: string;
}

/**
 * Persisted thread subscription entry for Chat SDK follow-up routing.
 *
 * @public
 */
export interface ChatThreadSubscriptionRecord {
	/** Fully encoded thread identifier. */
	readonly threadId: string;
	/** Tenant scope for this subscription. */
	readonly tenantId: string;
	/** Timestamp when the thread was subscribed. */
	readonly subscribedAt: string;
}

/**
 * Persisted distributed lock record for thread-scoped webhook processing.
 *
 * @public
 */
export interface ChatThreadLockRecord {
	/** Fully encoded thread identifier. */
	readonly threadId: string;
	/** Tenant scope for this lock. */
	readonly tenantId: string;
	/** Opaque token proving lock ownership. */
	readonly token: string;
	/** Absolute expiry timestamp for the lock. */
	readonly expiresAt: string;
	/** Timestamp when the lock was acquired. */
	readonly acquiredAt: string;
}

/**
 * Tenant-scoped persistence contract used by Chat SDK state adapters.
 *
 * @public
 */
export interface ChatRuntimeStateRepository {
	/**
	 * Acquires a thread lock when no active lock exists.
	 *
	 * @returns The created lock record, or `null` when an active lock already exists.
	 */
	readonly acquireLock: (input: {
		readonly threadId: string;
		readonly token: string;
		readonly expiresAt: string;
		readonly acquiredAt: string;
	}) => Effect.Effect<
		ChatThreadLockRecord | null,
		PersistenceError | SqlError,
		TenantContext
	>;
	/** Deletes a cached state entry by key. */
	readonly delete: (
		key: string
	) => Effect.Effect<void, PersistenceError | SqlError, TenantContext>;
	/** Extends the TTL of an existing unexpired lock owned by `token`. */
	readonly extendLock: (input: {
		readonly threadId: string;
		readonly token: string;
		readonly expiresAt: string;
	}) => Effect.Effect<boolean, PersistenceError | SqlError, TenantContext>;
	/** Retrieves a cached state entry, returning `null` when absent or expired. */
	readonly get: (
		key: string
	) => Effect.Effect<
		ChatStateRecord | null,
		PersistenceError | SqlError,
		TenantContext
	>;
	/** Returns whether a thread is currently subscribed. */
	readonly isSubscribed: (
		threadId: string
	) => Effect.Effect<boolean, PersistenceError | SqlError, TenantContext>;
	/** Releases a lock only when the token matches the current owner. */
	readonly releaseLock: (input: {
		readonly threadId: string;
		readonly token: string;
	}) => Effect.Effect<void, PersistenceError | SqlError, TenantContext>;
	/** Creates or overwrites a cache entry. */
	readonly set: (input: {
		readonly key: string;
		readonly value: JsonValue;
		readonly expiresAt?: string;
		readonly createdAt: string;
		readonly updatedAt: string;
	}) => Effect.Effect<
		ChatStateRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Sets a cache entry only when the key does not already exist or has expired.
	 *
	 * @returns `true` when the value was written, otherwise `false`.
	 */
	readonly setIfNotExists: (input: {
		readonly key: string;
		readonly value: JsonValue;
		readonly expiresAt?: string;
		readonly createdAt: string;
		readonly updatedAt: string;
	}) => Effect.Effect<boolean, PersistenceError | SqlError, TenantContext>;
	/** Persists a thread subscription, overwriting the subscription timestamp when re-subscribed. */
	readonly subscribe: (input: {
		readonly threadId: string;
		readonly subscribedAt: string;
	}) => Effect.Effect<
		ChatThreadSubscriptionRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/** Removes a thread subscription if it exists. */
	readonly unsubscribe: (
		threadId: string
	) => Effect.Effect<void, PersistenceError | SqlError, TenantContext>;
}

/**
 * Requests repository contract requiring tenant-scoped access.
 *
 * @public
 */
export interface RequestsRepository {
	/**
	 * Persists a new request record within tenant scope.
	 *
	 * @param input - Fields for the new request.
	 * @returns The created {@link RequestRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly create: (
		input: CreateRequestInput
	) => Effect.Effect<RequestRecord, PersistenceError | SqlError, TenantContext>;
	/**
	 * Retrieves a request record by its unique identifier.
	 *
	 * @param id - Request identifier to look up.
	 * @returns The matching {@link RequestRecord}.
	 * @throws {@link PersistenceError} when no record exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly getById: (
		id: string
	) => Effect.Effect<RequestRecord, PersistenceError | SqlError, TenantContext>;
	/**
	 * Lists request records for the current tenant.
	 *
	 * @param pagination - Optional offset/limit controls; omit for defaults.
	 * @returns An ordered array of {@link RequestRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly list: (
		pagination?: PaginationInput
	) => Effect.Effect<
		readonly RequestRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists request records for subject profile lookup using indexed,
	 * tenant-scoped request metadata.
	 *
	 * @param input - Subject identifiers, filters, cursor, and page size.
	 * @returns A cursor-paginated page of matching request records.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listBySubject: (
		input: ListRequestsBySubjectInput
	) => Effect.Effect<
		RequestSubjectPage,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Applies a partial update to an existing request record.
	 *
	 * @param id - Identifier of the record to update.
	 * @param input - Fields to overwrite on the existing record.
	 * @returns The updated {@link RequestRecord}.
	 * @throws {@link PersistenceError} when no record exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly update: (
		id: string,
		input: UpdateRequestInput
	) => Effect.Effect<RequestRecord, PersistenceError | SqlError, TenantContext>;
	/**
	 * Deletes a request record by its unique identifier.
	 *
	 * @param id - Identifier of the record to remove.
	 * @returns An `Effect` that succeeds with `void` when the record is
	 *   deleted, or fails with {@link PersistenceError} when no record
	 *   exists for `id` and {@link SqlError} on database failures.
	 * @throws {@link PersistenceError} when no record exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly remove: (
		id: string
	) => Effect.Effect<void, PersistenceError | SqlError, TenantContext>;
}

/**
 * Request timeline repository contract requiring tenant scope.
 *
 * @public
 */
export interface RequestTimelineRepository {
	/**
	 * Appends an immutable timeline event for a request.
	 *
	 * @param input - Timeline event payload to persist.
	 * @returns The created {@link RequestTimelineEventRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly append: (
		input: CreateRequestTimelineEventInput
	) => Effect.Effect<
		RequestTimelineEventRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all timeline events for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link RequestTimelineEventRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly RequestTimelineEventRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Legal-clock segment repository contract requiring tenant scope.
 *
 * @public
 */
export interface ClockSegmentsRepository {
	/**
	 * Appends a computed legal-clock segment for a request.
	 *
	 * @param input - Segment payload to persist.
	 * @returns The created {@link ClockSegmentRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly append: (
		input: CreateClockSegmentInput
	) => Effect.Effect<
		ClockSegmentRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all clock segments for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link ClockSegmentRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly ClockSegmentRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Policy assignment repository contract requiring tenant scope.
 *
 * @public
 */
export interface PolicyAssignmentsRepository {
	/**
	 * Assigns a policy version to a request.
	 *
	 * @param input - Policy assignment payload to persist.
	 * @returns The created {@link PolicyAssignmentRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly assign: (
		input: CreatePolicyAssignmentInput
	) => Effect.Effect<
		PolicyAssignmentRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all policy assignments for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link PolicyAssignmentRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly PolicyAssignmentRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Verification evidence repository contract requiring tenant scope.
 *
 * @public
 */
export interface VerificationEvidenceRepository {
	/**
	 * Persists verification evidence metadata for a request.
	 *
	 * @param input - Evidence payload to persist.
	 * @returns The created {@link VerificationEvidenceRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly create: (
		input: CreateVerificationEvidenceInput
	) => Effect.Effect<
		VerificationEvidenceRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all verification evidence for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link VerificationEvidenceRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly VerificationEvidenceRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Fulfillment artifact repository contract requiring tenant scope.
 *
 * @public
 */
export interface FulfillmentArtifactsRepository {
	/**
	 * Persists fulfillment artifact metadata for a request.
	 *
	 * @param input - Artifact metadata payload to persist.
	 * @returns The created {@link FulfillmentArtifactRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly create: (
		input: CreateFulfillmentArtifactInput
	) => Effect.Effect<
		FulfillmentArtifactRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Applies a partial update to persisted fulfillment artifact metadata.
	 *
	 * @param id - Identifier of the artifact record to update.
	 * @param input - Fields to overwrite on the existing record.
	 * @returns The updated {@link FulfillmentArtifactRecord}.
	 * @throws {@link PersistenceError} when no record exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly update: (
		id: string,
		input: UpdateFulfillmentArtifactInput
	) => Effect.Effect<
		FulfillmentArtifactRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all fulfillment artifacts for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link FulfillmentArtifactRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly FulfillmentArtifactRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Retention policy repository contract requiring tenant scope.
 *
 * @public
 */
export interface RetentionPoliciesRepository {
	/**
	 * Creates or updates a retention-policy record.
	 *
	 * @param input - Retention policy payload to upsert.
	 * @returns The created or updated {@link RetentionPolicyRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly upsert: (
		input: UpsertRetentionPolicyInput
	) => Effect.Effect<
		RetentionPolicyRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all retention policy records for the current tenant.
	 *
	 * @returns An ordered array of {@link RetentionPolicyRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly list: () => Effect.Effect<
		readonly RetentionPolicyRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Immutable audit repository contract requiring tenant scope.
 *
 * @public
 */
export interface AuditEventsRepository {
	/**
	 * Appends an immutable audit event to the tenant audit chain.
	 *
	 * @param input - Audit event payload to persist.
	 * @returns The created {@link AuditEventRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly append: (
		input: CreateAuditEventInput
	) => Effect.Effect<
		AuditEventRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all audit events for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link AuditEventRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly AuditEventRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Immutable notification generation repository contract requiring tenant scope.
 *
 * @public
 */
export interface NotificationEventsRepository {
	/**
	 * Appends an immutable notification event for a request.
	 *
	 * @param input - Notification event payload to persist.
	 * @returns The created {@link NotificationEventRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly append: (
		input: CreateNotificationEventInput
	) => Effect.Effect<
		NotificationEventRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Retrieves a notification event by its unique identifier.
	 *
	 * @param id - Notification event identifier to look up.
	 * @returns The matching {@link NotificationEventRecord}.
	 * @throws {@link PersistenceError} when no record exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly getById: (
		id: string
	) => Effect.Effect<
		NotificationEventRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all notification events for a given request.
	 *
	 * @param requestId - Owning request identifier.
	 * @returns An ordered array of {@link NotificationEventRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByRequestId: (
		requestId: string
	) => Effect.Effect<
		readonly NotificationEventRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Immutable notification delivery-attempt repository contract requiring tenant scope.
 *
 * @public
 */
export interface NotificationDeliveryAttemptsRepository {
	/**
	 * Appends an immutable notification delivery attempt record.
	 *
	 * @param input - Delivery attempt payload to persist.
	 * @returns The created {@link NotificationDeliveryAttemptRecord}.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly append: (
		input: CreateNotificationDeliveryAttemptInput
	) => Effect.Effect<
		NotificationDeliveryAttemptRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists all delivery attempts for a given notification event.
	 *
	 * @param notificationEventId - Parent notification event identifier.
	 * @returns An ordered array of {@link NotificationDeliveryAttemptRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByNotificationEventId: (
		notificationEventId: string
	) => Effect.Effect<
		readonly NotificationDeliveryAttemptRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists delivery attempts filtered by status.
	 *
	 * @param status - Optional status filter (e.g. "dead" for DLQ).
	 * @param limit - Maximum number of results.
	 * @returns An ordered array of {@link NotificationDeliveryAttemptRecord} entries.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listByStatus: (
		status: NotificationDeliveryStatus,
		limit?: number
	) => Effect.Effect<
		readonly NotificationDeliveryAttemptRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
}

/**
 * Outbound webhook endpoint and signing-key repository requiring tenant scope.
 *
 * @public
 */
export interface WebhookEndpointsRepository {
	/**
	 * Creates or updates a configured endpoint and lazily seeds its primary key.
	 *
	 * @param input - Endpoint URL and initial signing secret.
	 * @returns The endpoint and currently active primary key.
	 * @throws {@link PersistenceError} on constraint violations or mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly ensureConfigured: (
		input: EnsureWebhookEndpointInput
	) => Effect.Effect<
		{
			readonly endpoint: WebhookEndpointRecord;
			readonly primaryKey: WebhookSigningKeyRecord;
		},
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Retrieves a webhook endpoint by identifier.
	 *
	 * @param id - Endpoint identifier.
	 * @returns The matching {@link WebhookEndpointRecord}.
	 * @throws {@link PersistenceError} when no endpoint exists for `id`.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly getById: (
		id: string
	) => Effect.Effect<
		WebhookEndpointRecord,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Lists active primary and unexpired secondary signing keys for an endpoint.
	 *
	 * @param endpointId - Endpoint identifier.
	 * @param now - Timestamp used for secondary-key expiry checks.
	 * @returns Active signing keys ordered primary first, then newest secondary.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly listActiveKeys: (
		endpointId: string,
		now: string
	) => Effect.Effect<
		readonly WebhookSigningKeyRecord[],
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Rotates the endpoint primary key and demotes the previous primary into the grace window.
	 *
	 * @param input - New key material and grace-window expiry.
	 * @returns Rotation metadata including the new primary and previous primary.
	 * @throws {@link PersistenceError} when the endpoint does not exist.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly rotateSigningKey: (
		input: RotateWebhookSigningKeyInput
	) => Effect.Effect<
		RotateWebhookSigningKeyResult,
		PersistenceError | SqlError,
		TenantContext
	>;
	/**
	 * Rolls back a completed signing-key rotation after a coupled side effect fails.
	 *
	 * @param input - Newly inserted key and prior primary metadata to restore.
	 * @throws {@link PersistenceError} on mapping failures.
	 * @throws {@link SqlError} on underlying database failures.
	 */
	readonly rollbackSigningKeyRotation: (
		input: RollbackWebhookSigningKeyRotationInput
	) => Effect.Effect<void, PersistenceError | SqlError, TenantContext>;
}

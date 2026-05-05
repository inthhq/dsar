import * as Effect from "effect/Effect";

import type {
	AuditEventRecord,
	ChatStateRecord,
	ChatThreadLockRecord,
	ChatThreadSubscriptionRecord,
	ClockSegmentRecord,
	FulfillmentArtifactRecord,
	NotificationDeliveryAttemptRecord,
	NotificationEventRecord,
	PolicyAssignmentRecord,
	RequestRecord,
	RequestTimelineEventRecord,
	RetentionPolicyRecord,
	VerificationEvidenceRecord,
	WebhookEndpointRecord,
	WebhookSigningKeyRecord,
} from "../../types/domain";
import type { PersistenceInvalidRecordError } from "../../types/errors";
import {
	jsonDecode,
	parseNotificationDeliveryStatus,
	parseRetentionClass,
} from "./shared";

/**
 * Maps a SQL row into a chat state domain record.
 *
 * @param row - SQL row selected from `chat_state`.
 * @returns Decoded chat state domain record.
 */
export const mapChatStateRecord = (row: {
	readonly cache_key: string;
	readonly tenant_id: string;
	readonly value_json: string;
	readonly expires_at: string | null;
	readonly created_at: string;
	readonly updated_at: string;
}): ChatStateRecord => ({
	createdAt: row.created_at,
	expiresAt: row.expires_at ?? undefined,
	key: row.cache_key,
	tenantId: row.tenant_id,
	updatedAt: row.updated_at,
	value: jsonDecode(row.value_json),
});

/**
 * Maps a SQL row into a chat thread subscription domain record.
 *
 * @param row - SQL row selected from `chat_thread_subscriptions`.
 * @returns Decoded chat thread subscription domain record.
 */
export const mapChatThreadSubscriptionRecord = (row: {
	readonly thread_id: string;
	readonly tenant_id: string;
	readonly subscribed_at: string;
}): ChatThreadSubscriptionRecord => ({
	subscribedAt: row.subscribed_at,
	tenantId: row.tenant_id,
	threadId: row.thread_id,
});

/**
 * Maps a SQL row into a chat thread lock domain record.
 *
 * @param row - SQL row selected from `chat_thread_locks`.
 * @returns Decoded chat thread lock domain record.
 */
export const mapChatThreadLockRecord = (row: {
	readonly thread_id: string;
	readonly tenant_id: string;
	readonly token: string;
	readonly expires_at: string;
	readonly acquired_at: string;
}): ChatThreadLockRecord => ({
	acquiredAt: row.acquired_at,
	expiresAt: row.expires_at,
	tenantId: row.tenant_id,
	threadId: row.thread_id,
	token: row.token,
});

/**
 * Maps a SQL row into a request domain record.
 *
 * @param row - SQL row selected from `requests`.
 * @returns Decoded request domain record.
 */
export const mapRequestRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly status: string;
	readonly received_at: string;
	readonly due_at: string;
	readonly clock_mode: string;
	readonly requestor_json: string;
	readonly authority_json: string;
	readonly capture_json: string;
	readonly appeals_json: string;
	readonly created_at: string;
	readonly updated_at: string;
}): RequestRecord => ({
	appeals: jsonDecode(row.appeals_json),
	authority: jsonDecode(row.authority_json),
	capture: jsonDecode(row.capture_json),
	clockMode: row.clock_mode,
	createdAt: row.created_at,
	dueAt: row.due_at,
	id: row.id,
	receivedAt: row.received_at,
	requestor: jsonDecode(row.requestor_json),
	status: row.status,
	tenantId: row.tenant_id,
	updatedAt: row.updated_at,
});

/**
 * Maps a SQL row into a request timeline event domain record.
 *
 * @param row - SQL row selected from `request_timeline_events`.
 * @returns Decoded request timeline event domain record.
 */
export const mapTimelineRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly event_type: string;
	readonly payload_json: string;
	readonly created_at: string;
}): RequestTimelineEventRecord => ({
	createdAt: row.created_at,
	eventType: row.event_type,
	id: row.id,
	payload: jsonDecode(row.payload_json),
	requestId: row.request_id,
	tenantId: row.tenant_id,
});

/**
 * Maps a SQL row into a persisted legal-clock segment record.
 *
 * @param row - SQL row selected from `clock_segments`.
 * @returns Decoded clock segment domain record.
 */
export const mapClockSegmentRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly from_at: string;
	readonly to_at: string;
	readonly reason: string;
	readonly counts_toward_deadline: number;
	readonly policy_version: string;
	readonly actor: string;
}): ClockSegmentRecord => ({
	actor: row.actor,
	countsTowardDeadline: row.counts_toward_deadline === 1,
	from: row.from_at,
	id: row.id,
	policyVersion: row.policy_version,
	reason: row.reason,
	requestId: row.request_id,
	tenantId: row.tenant_id,
	to: row.to_at,
});

/**
 * Maps a SQL row into a policy assignment domain record.
 *
 * @param row - SQL row selected from `policy_assignments`.
 * @returns Decoded policy assignment domain record.
 */
export const mapPolicyAssignmentRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly policy_pack: string;
	readonly policy_version: string;
	readonly assigned_at: string;
}): PolicyAssignmentRecord => ({
	assignedAt: row.assigned_at,
	id: row.id,
	policyPack: row.policy_pack,
	policyVersion: row.policy_version,
	requestId: row.request_id,
	tenantId: row.tenant_id,
});

/**
 * Maps a SQL row into a verification evidence domain record.
 *
 * @param row - SQL row selected from `verification_evidence`.
 * @returns Decoded verification evidence domain record.
 */
export const mapVerificationEvidenceRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly level: string;
	readonly reason_for_doubt: string;
	readonly methods_allowed_json: string;
	readonly status: string;
	readonly evidence_artifacts_json: string;
	readonly retention_expires_at: string;
	readonly created_at: string;
	readonly updated_at: string;
}): VerificationEvidenceRecord => ({
	createdAt: row.created_at,
	evidenceArtifacts: jsonDecode(row.evidence_artifacts_json),
	id: row.id,
	level: row.level,
	methodsAllowed: jsonDecode(row.methods_allowed_json),
	reasonForDoubt: row.reason_for_doubt,
	requestId: row.request_id,
	retentionExpiresAt: row.retention_expires_at,
	status: row.status,
	tenantId: row.tenant_id,
	updatedAt: row.updated_at,
});

/**
 * Maps a SQL row into a fulfillment artifact domain record.
 *
 * @param row - SQL row selected from `fulfillment_artifacts`.
 * @returns Decoded fulfillment artifact domain record.
 */
export const mapFulfillmentArtifactRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly artifact_manifest_json: string;
	readonly validation_state: string;
	readonly delivery_prepare_json: string;
	readonly delivery_logs_json: string;
	readonly token_gate_json: string;
	readonly created_at: string;
	readonly updated_at: string;
}): FulfillmentArtifactRecord => ({
	artifactManifest: jsonDecode(row.artifact_manifest_json),
	createdAt: row.created_at,
	deliveryLogs: jsonDecode(row.delivery_logs_json),
	deliveryPrepare: jsonDecode(row.delivery_prepare_json),
	id: row.id,
	requestId: row.request_id,
	tenantId: row.tenant_id,
	tokenGate: jsonDecode(row.token_gate_json),
	updatedAt: row.updated_at,
	validationState: row.validation_state,
});

/**
 * Maps a SQL row into a retention policy domain record with validation.
 *
 * @param row - SQL row selected from `retention_policies`.
 * @returns Effect yielding a validated retention policy domain record.
 */
export const mapRetentionPolicyRecordEffect = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly class: string;
	readonly min_days: number;
	readonly max_days: number;
	readonly purge_enabled: number;
	readonly legal_hold_enabled: number;
	readonly updated_at: string;
}): Effect.Effect<RetentionPolicyRecord, PersistenceInvalidRecordError> =>
	Effect.map(parseRetentionClass(row.class), (retentionClass) => ({
		class: retentionClass,
		id: row.id,
		legalHoldEnabled: row.legal_hold_enabled === 1,
		maxDays: row.max_days,
		minDays: row.min_days,
		purgeEnabled: row.purge_enabled === 1,
		tenantId: row.tenant_id,
		updatedAt: row.updated_at,
	}));

/**
 * Maps a SQL row into an audit event domain record.
 *
 * @param row - SQL row selected from `audit_events`.
 * @returns Decoded audit event domain record.
 */
export const mapAuditEventRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string | null;
	readonly actor: string;
	readonly action: string;
	readonly object: string;
	readonly before_json: string;
	readonly after_json: string;
	readonly reason_json: string;
	readonly prev_hash: string | null;
	readonly hash: string;
	readonly hash_alg: string;
	readonly sequence: number;
	readonly created_at: string;
}): AuditEventRecord => ({
	action: row.action,
	actor: row.actor,
	after: jsonDecode(row.after_json),
	before: jsonDecode(row.before_json),
	createdAt: row.created_at,
	hash: row.hash,
	hashAlg: row.hash_alg,
	id: row.id,
	object: row.object,
	prevHash: row.prev_hash ?? undefined,
	reason: jsonDecode(row.reason_json),
	requestId: row.request_id ?? undefined,
	sequence: row.sequence,
	tenantId: row.tenant_id,
});

/**
 * Maps a SQL row into a notification event domain record.
 *
 * @param row - SQL row selected from `notification_events`.
 * @returns Decoded notification event domain record.
 */
export const mapNotificationEventRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly request_id: string;
	readonly event_type: string;
	readonly payload_json: string;
	readonly correlation_id: string;
	readonly idempotency_key: string;
	readonly policy_version: string;
	readonly locale: string;
	readonly created_at: string;
}): NotificationEventRecord => ({
	correlationId: row.correlation_id,
	createdAt: row.created_at,
	eventType: row.event_type,
	id: row.id,
	idempotencyKey: row.idempotency_key,
	locale: row.locale,
	payload: jsonDecode(row.payload_json),
	policyVersion: row.policy_version,
	requestId: row.request_id,
	tenantId: row.tenant_id,
});

/**
 * Maps a SQL row into a notification delivery-attempt domain record with validation.
 *
 * @param row - SQL row selected from `notification_delivery_attempts`.
 * @returns Effect yielding a validated notification delivery-attempt domain record.
 */
export const mapNotificationDeliveryAttemptRecordEffect = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly notification_event_id: string;
	readonly request_id: string;
	readonly channel: string;
	readonly destination: string;
	readonly attempt: number;
	readonly status: string;
	readonly response_code: number | null;
	readonly error_text: string | null;
	readonly created_at: string;
}): Effect.Effect<
	NotificationDeliveryAttemptRecord,
	PersistenceInvalidRecordError
> =>
	Effect.map(parseNotificationDeliveryStatus(row.status), (status) => ({
		attempt: row.attempt,
		channel: row.channel,
		createdAt: row.created_at,
		destination: row.destination,
		error: row.error_text ?? undefined,
		id: row.id,
		notificationEventId: row.notification_event_id,
		requestId: row.request_id,
		responseCode: row.response_code ?? undefined,
		status,
		tenantId: row.tenant_id,
	}));

/**
 * Maps a SQL row into a webhook endpoint domain record.
 *
 * @param row - SQL row selected from `webhook_endpoints`.
 * @returns Decoded webhook endpoint domain record.
 */
export const mapWebhookEndpointRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly url: string;
	readonly created_at: string;
	readonly updated_at: string;
}): WebhookEndpointRecord => ({
	createdAt: row.created_at,
	id: row.id,
	tenantId: row.tenant_id,
	updatedAt: row.updated_at,
	url: row.url,
});

/**
 * Maps a SQL row into a webhook signing-key domain record.
 *
 * @param row - SQL row selected from `webhook_signing_keys`.
 * @returns Decoded webhook signing-key domain record.
 */
export const mapWebhookSigningKeyRecord = (row: {
	readonly id: string;
	readonly tenant_id: string;
	readonly endpoint_id: string;
	readonly secret: string;
	readonly role: string;
	readonly expires_at: string | null;
	readonly created_at: string;
}): WebhookSigningKeyRecord => ({
	createdAt: row.created_at,
	endpointId: row.endpoint_id,
	expiresAt: row.expires_at ?? undefined,
	id: row.id,
	role: row.role === "secondary" ? "secondary" : "primary",
	secret: row.secret,
	tenantId: row.tenant_id,
});

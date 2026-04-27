import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as ServiceMap from "effect/ServiceMap";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { PersistenceDriver } from "../sql/driver";
import { TenantContext, requireTenantId } from "../tenant/context";
import type {
	AuditEventsRepository,
	ChatRuntimeStateRepository,
	ClockSegmentsRepository,
	CreateClockSegmentInput,
	CreateNotificationDeliveryAttemptInput,
	CreateNotificationEventInput,
	FulfillmentArtifactsRepository,
	NotificationDeliveryAttemptsRepository,
	NotificationEventsRepository,
	PaginationInput,
	PolicyAssignmentsRepository,
	RequestsRepository,
	RequestTimelineRepository,
	RetentionPoliciesRepository,
	VerificationEvidenceRepository,
	WebhookEndpointsRepository,
} from "../types/domain";
import {
	mapAuditEventRecord,
	mapChatStateRecord,
	mapChatThreadLockRecord,
	mapChatThreadSubscriptionRecord,
	mapClockSegmentRecord,
	mapFulfillmentArtifactRecord,
	mapNotificationDeliveryAttemptRecordEffect,
	mapNotificationEventRecord,
	mapPolicyAssignmentRecord,
	mapRequestRecord,
	mapRetentionPolicyRecordEffect,
	mapTimelineRecord,
	mapVerificationEvidenceRecord,
	mapWebhookEndpointRecord,
	mapWebhookSigningKeyRecord,
} from "./persistence/mappers";
import { runMigrations } from "./persistence/migrations";
import {
	BOOTSTRAP_TENANT_ID,
	findRequired,
	jsonEncode,
	limitWithFallback,
	offsetWithFallback,
} from "./persistence/shared";
import type { Sql } from "./persistence/shared";

export { runMigrations } from "./persistence/migrations";

interface WebhookEndpointSqlRow {
	readonly id: string;
	readonly tenant_id: string;
	readonly url: string;
	readonly created_at: string;
	readonly updated_at: string;
}

interface WebhookSigningKeySqlRow {
	readonly id: string;
	readonly tenant_id: string;
	readonly endpoint_id: string;
	readonly secret: string;
	readonly role: string;
	readonly expires_at: string | null;
	readonly created_at: string;
}

/**
 * Effect service surface for all tenant-scoped persistence repositories.
 */
export interface PersistenceService {
	/** Request repository bound to mandatory tenant scope. */
	readonly requests: RequestsRepository;
	/** Timeline repository for request lifecycle and legal-clock events. */
	readonly timeline: RequestTimelineRepository;
	/** Legal-clock segment ledger for deterministic explainability. */
	readonly clockSegments: ClockSegmentsRepository;
	/** Policy assignment repository for request-to-policy linkage. */
	readonly policyAssignments: PolicyAssignmentsRepository;
	/** Verification evidence metadata repository. */
	readonly verificationEvidence: VerificationEvidenceRepository;
	/** Fulfillment artifact metadata repository. */
	readonly fulfillmentArtifacts: FulfillmentArtifactsRepository;
	/** Tenant retention policy repository. */
	readonly retentionPolicies: RetentionPoliciesRepository;
	/** Immutable audit repository with hash-chain support fields. */
	readonly auditEvents: AuditEventsRepository;
	/** Immutable notification generation repository. */
	readonly notificationEvents: NotificationEventsRepository;
	/** Immutable notification delivery-attempt repository. */
	readonly notificationDeliveryAttempts: NotificationDeliveryAttemptsRepository;
	/** Outbound webhook endpoint and signing-key repository. */
	readonly webhookEndpoints: WebhookEndpointsRepository;
	/** Tenant-scoped Chat SDK state, subscription, and lock repository. */
	readonly chatRuntimeState: ChatRuntimeStateRepository;
}

/**
 * Effect tag for the tenant-safe persistence service.
 */
export class Persistence extends ServiceMap.Service<
	Persistence,
	PersistenceService
>()("Persistence") {}

/**
 * Hooks to customize migration startup behavior per driver package.
 */
export interface PersistenceMigrationHooks {
	/**
	 * Hook invoked once, immediately before schema migrations run. Hooks
	 * share the same `SqlClient` as migrations but do **not** run inside a
	 * wrapping transaction; each statement executes independently. Failing
	 * the returned Effect aborts the entire persistence initialisation.
	 *
	 * @param sql - SQL client connection for executing DDL or DML statements.
	 * @returns An effect that performs pre-migration setup; may fail with an
	 *   unknown error and produces no value.
	 */
	readonly beforeMigrations?: (sql: Sql) => Effect.Effect<void, unknown>;
	/**
	 * Hook invoked once, immediately after all schema migrations complete
	 * successfully. Like {@link PersistenceMigrationHooks.beforeMigrations},
	 * this does not run inside a wrapping transaction and failing the returned
	 * Effect aborts persistence initialisation.
	 *
	 * @param sql - SQL client connection for executing post-migration work
	 *   (e.g. seeding reference data).
	 * @returns An effect that performs post-migration work; may fail with an
	 *   unknown error and produces no value.
	 */
	readonly afterMigrations?: (sql: Sql) => Effect.Effect<void, unknown>;
}

const makePersistence = (hooks?: PersistenceMigrationHooks) =>
	Effect.gen(function* makePersistenceService() {
		const sql = yield* SqlClient.SqlClient;
		const dbCurrentTimestamp = sql.onDialectOrElse({
			orElse: () => sql.literal("CURRENT_TIMESTAMP"),
			pg: () =>
				sql.literal(
					`to_char(timezone('UTC', CURRENT_TIMESTAMP), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
				),
			sqlite: () => sql.literal(`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
		});
		if (hooks?.beforeMigrations) {
			yield* hooks.beforeMigrations(sql);
		}
		yield* runMigrations(sql);
		if (hooks?.afterMigrations) {
			yield* hooks.afterMigrations(sql);
		}

		const requests: RequestsRepository = {
			create: (input) =>
				Effect.gen(function* createRequest() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO requests ${sql.insert({
						appeals_json: jsonEncode(input.appeals),
						authority_json: jsonEncode(input.authority),
						capture_json: jsonEncode(input.capture),
						clock_mode: input.clockMode,
						created_at: input.receivedAt,
						due_at: input.dueAt,
						id: input.id,
						received_at: input.receivedAt,
						requestor_json: jsonEncode(input.requestor),
						status: input.status,
						tenant_id: tenantId,
						updated_at: input.receivedAt,
					})}`;
					return yield* requests.getById(input.id);
				}),
			getById: (id) =>
				Effect.gen(function* getRequestById() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM requests WHERE tenant_id = ${tenantId} AND id = ${id} LIMIT 1`;
					const row = yield* findRequired(rows[0], "requests", id);
					return mapRequestRecord(row);
				}),
			list: (pagination?: PaginationInput) =>
				Effect.gen(function* listRequests() {
					const tenantId = yield* requireTenantId;
					const limit = limitWithFallback(pagination?.limit);
					const offset = offsetWithFallback(pagination?.offset);
					const rows = yield* sql<{
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
					}>`SELECT * FROM requests
						WHERE tenant_id = ${tenantId}
						ORDER BY received_at DESC
						LIMIT ${limit}
						OFFSET ${offset}`;
					return rows.map(mapRequestRecord);
				}),
			remove: (id) =>
				Effect.gen(function* removeRequest() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM requests WHERE tenant_id = ${tenantId} AND id = ${id}`;
				}),
			update: (id, input) =>
				Effect.gen(function* updateRequest() {
					const tenantId = yield* requireTenantId;
					const current = yield* requests.getById(id);
					yield* sql`UPDATE requests SET ${sql.update({
						appeals_json: jsonEncode(input.appeals ?? current.appeals),
						authority_json: jsonEncode(input.authority ?? current.authority),
						capture_json: jsonEncode(input.capture ?? current.capture),
						clock_mode: input.clockMode ?? current.clockMode,
						due_at: input.dueAt ?? current.dueAt,
						requestor_json: jsonEncode(input.requestor ?? current.requestor),
						status: input.status ?? current.status,
						updated_at: input.updatedAt,
					})} WHERE tenant_id = ${tenantId} AND id = ${id}`;
					return yield* requests.getById(id);
				}),
		};

		const timeline: RequestTimelineRepository = {
			append: (input) =>
				Effect.gen(function* appendTimelineEvent() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO request_timeline_events ${sql.insert({
						created_at: input.createdAt,
						event_type: input.eventType,
						id: input.id,
						payload_json: jsonEncode(input.payload),
						request_id: input.requestId,
						tenant_id: tenantId,
					})}`;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly event_type: string;
						readonly payload_json: string;
						readonly created_at: string;
					}>`SELECT * FROM request_timeline_events
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"request_timeline_events",
						input.id
					);
					return mapTimelineRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listTimelineByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly event_type: string;
						readonly payload_json: string;
						readonly created_at: string;
					}>`SELECT * FROM request_timeline_events
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY created_at ASC`;
					return rows.map(mapTimelineRecord);
				}),
		};

		const clockSegments: ClockSegmentsRepository = {
			append: (input: CreateClockSegmentInput) =>
				Effect.gen(function* appendClockSegment() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO request_clock_segments ${sql.insert({
						actor: input.actor,
						counts_toward_deadline: input.countsTowardDeadline ? 1 : 0,
						from_at: input.from,
						id: input.id,
						policy_version: input.policyVersion,
						reason: input.reason,
						request_id: input.requestId,
						tenant_id: tenantId,
						to_at: input.to,
					})}`;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly from_at: string;
						readonly to_at: string;
						readonly reason: string;
						readonly counts_toward_deadline: number;
						readonly policy_version: string;
						readonly actor: string;
					}>`SELECT * FROM request_clock_segments
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"request_clock_segments",
						input.id
					);
					return mapClockSegmentRecord(row);
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listClockSegmentsByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly from_at: string;
						readonly to_at: string;
						readonly reason: string;
						readonly counts_toward_deadline: number;
						readonly policy_version: string;
						readonly actor: string;
					}>`SELECT * FROM request_clock_segments
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY from_at ASC, id ASC`;
					return rows.map(mapClockSegmentRecord);
				}),
		};

		const policyAssignments: PolicyAssignmentsRepository = {
			assign: (input) =>
				Effect.gen(function* assignPolicy() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO policy_assignments ${sql.insert({
						assigned_at: input.assignedAt,
						id: input.id,
						policy_pack: input.policyPack,
						policy_version: input.policyVersion,
						request_id: input.requestId,
						tenant_id: tenantId,
					})}`;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly policy_pack: string;
						readonly policy_version: string;
						readonly assigned_at: string;
					}>`SELECT * FROM policy_assignments
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"policy_assignments",
						input.id
					);
					return mapPolicyAssignmentRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listPolicyAssignmentsByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly request_id: string;
						readonly policy_pack: string;
						readonly policy_version: string;
						readonly assigned_at: string;
					}>`SELECT * FROM policy_assignments
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY assigned_at DESC`;
					return rows.map(mapPolicyAssignmentRecord);
				}),
		};

		const verificationEvidence: VerificationEvidenceRepository = {
			create: (input) =>
				Effect.gen(function* createVerificationEvidence() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO verification_evidence ${sql.insert({
						created_at: input.createdAt,
						evidence_artifacts_json: jsonEncode(input.evidenceArtifacts),
						id: input.id,
						level: input.level,
						methods_allowed_json: jsonEncode(input.methodsAllowed),
						reason_for_doubt: input.reasonForDoubt,
						request_id: input.requestId,
						retention_expires_at: input.retentionExpiresAt,
						status: input.status,
						tenant_id: tenantId,
						updated_at: input.updatedAt ?? input.createdAt,
					})}`;
					const rows = yield* sql<{
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
					}>`SELECT * FROM verification_evidence
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"verification_evidence",
						input.id
					);
					return mapVerificationEvidenceRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listVerificationEvidenceByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM verification_evidence
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY created_at DESC`;
					return rows.map(mapVerificationEvidenceRecord);
				}),
		};

		const fulfillmentArtifacts: FulfillmentArtifactsRepository = {
			create: (input) =>
				Effect.gen(function* createFulfillmentArtifact() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO fulfillment_artifacts ${sql.insert({
						artifact_manifest_json: jsonEncode(input.artifactManifest),
						created_at: input.createdAt,
						delivery_logs_json: jsonEncode(input.deliveryLogs),
						delivery_prepare_json: jsonEncode(input.deliveryPrepare),
						id: input.id,
						request_id: input.requestId,
						tenant_id: tenantId,
						token_gate_json: jsonEncode(input.tokenGate),
						updated_at: input.updatedAt ?? input.createdAt,
						validation_state: input.validationState,
					})}`;
					const rows = yield* sql<{
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
					}>`SELECT * FROM fulfillment_artifacts
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"fulfillment_artifacts",
						input.id
					);
					return mapFulfillmentArtifactRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listFulfillmentArtifactsByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM fulfillment_artifacts
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY created_at DESC`;
					return rows.map(mapFulfillmentArtifactRecord);
				}),
			update: (id, input) =>
				Effect.gen(function* updateFulfillmentArtifact() {
					const tenantId = yield* requireTenantId;
					const updateFields: Record<string, unknown> = {
						updated_at: input.updatedAt,
					};
					if (input.artifactManifest !== undefined) {
						updateFields.artifact_manifest_json = jsonEncode(
							input.artifactManifest
						);
					}
					if (input.deliveryLogs !== undefined) {
						updateFields.delivery_logs_json = jsonEncode(input.deliveryLogs);
					}
					if (input.deliveryPrepare !== undefined) {
						updateFields.delivery_prepare_json = jsonEncode(
							input.deliveryPrepare
						);
					}
					if (input.tokenGate !== undefined) {
						updateFields.token_gate_json = jsonEncode(input.tokenGate);
					}
					if (input.validationState !== undefined) {
						updateFields.validation_state = input.validationState;
					}
					const rows = yield* sql<{
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
					}>`UPDATE fulfillment_artifacts SET ${sql.update(updateFields)} WHERE tenant_id = ${tenantId} AND id = ${id} RETURNING *`;
					const row = yield* findRequired(rows[0], "fulfillment_artifacts", id);
					return mapFulfillmentArtifactRecord(row);
				}),
		};

		const retentionPolicies: RetentionPoliciesRepository = {
			list: () =>
				Effect.gen(function* listRetentionPolicies() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly class: string;
						readonly min_days: number;
						readonly max_days: number;
						readonly purge_enabled: number;
						readonly legal_hold_enabled: number;
						readonly updated_at: string;
					}>`SELECT * FROM retention_policies
					WHERE tenant_id = ${tenantId}
					ORDER BY class ASC`;
					return yield* Effect.forEach(rows, mapRetentionPolicyRecordEffect);
				}),
			upsert: (input) =>
				Effect.gen(function* upsertRetentionPolicy() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO retention_policies ${sql.insert({
						class: input.class,
						id: input.id,
						legal_hold_enabled: input.legalHoldEnabled ? 1 : 0,
						max_days: input.maxDays,
						min_days: input.minDays,
						purge_enabled: input.purgeEnabled ? 1 : 0,
						tenant_id: tenantId,
						updated_at: input.updatedAt,
					})}
				ON CONFLICT(tenant_id, class) DO UPDATE SET
					id = excluded.id,
					min_days = excluded.min_days,
					max_days = excluded.max_days,
					purge_enabled = excluded.purge_enabled,
					legal_hold_enabled = excluded.legal_hold_enabled,
					updated_at = excluded.updated_at`;
					const rows = yield* sql<{
						readonly id: string;
						readonly tenant_id: string;
						readonly class: string;
						readonly min_days: number;
						readonly max_days: number;
						readonly purge_enabled: number;
						readonly legal_hold_enabled: number;
						readonly updated_at: string;
					}>`SELECT * FROM retention_policies
					WHERE tenant_id = ${tenantId} AND class = ${input.class}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"retention_policies",
						input.id
					);
					return yield* mapRetentionPolicyRecordEffect(row);
				}),
		};

		const auditEvents: AuditEventsRepository = {
			append: (input) =>
				Effect.gen(function* appendAuditEvent() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO audit_events ${sql.insert({
						action: input.action,
						actor: input.actor,
						after_json: jsonEncode(input.after),
						before_json: jsonEncode(input.before),
						created_at: input.createdAt,
						hash: input.hash,
						hash_alg: input.hashAlg,
						id: input.id,
						object: input.object,
						prev_hash: input.prevHash ?? null,
						reason_json: jsonEncode(input.reason),
						request_id: input.requestId ?? null,
						sequence: input.sequence,
						tenant_id: tenantId,
					})}`;
					const rows = yield* sql<{
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
					}>`SELECT * FROM audit_events
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
					const row = yield* findRequired(rows[0], "audit_events", input.id);
					return mapAuditEventRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listAuditEventsByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM audit_events
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY sequence ASC`;
					return rows.map(mapAuditEventRecord);
				}),
		};

		const notificationEvents: NotificationEventsRepository = {
			append: (input: CreateNotificationEventInput) =>
				Effect.gen(function* appendNotificationEvent() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO notification_events ${sql.insert({
						correlation_id: input.correlationId,
						created_at: input.createdAt,
						event_type: input.eventType,
						id: input.id,
						idempotency_key: input.idempotencyKey,
						locale: input.locale,
						payload_json: jsonEncode(input.payload),
						policy_version: input.policyVersion,
						request_id: input.requestId,
						tenant_id: tenantId,
					})}`;
					return yield* notificationEvents.getById(input.id);
				}),
			getById: (id) =>
				Effect.gen(function* getNotificationEventById() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM notification_events
					WHERE tenant_id = ${tenantId} AND id = ${id}
					LIMIT 1`;
					const row = yield* findRequired(rows[0], "notification_events", id);
					return mapNotificationEventRecord(row);
				}),
			listByRequestId: (requestId) =>
				Effect.gen(function* listNotificationEventsByRequestId() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
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
					}>`SELECT * FROM notification_events
					WHERE tenant_id = ${tenantId} AND request_id = ${requestId}
					ORDER BY created_at ASC, id ASC`;
					return rows.map(mapNotificationEventRecord);
				}),
		};

		const notificationDeliveryAttempts: NotificationDeliveryAttemptsRepository =
			{
				append: (input: CreateNotificationDeliveryAttemptInput) =>
					Effect.gen(function* appendNotificationDeliveryAttempt() {
						const tenantId = yield* requireTenantId;
						yield* sql`INSERT INTO notification_delivery_attempts ${sql.insert({
							attempt: input.attempt,
							channel: input.channel,
							created_at: input.createdAt,
							destination: input.destination,
							error_text: input.error ?? null,
							id: input.id,
							notification_event_id: input.notificationEventId,
							request_id: input.requestId,
							response_code: input.responseCode ?? null,
							status: input.status,
							tenant_id: tenantId,
						})}`;
						const rows = yield* sql<{
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
						}>`SELECT * FROM notification_delivery_attempts
					WHERE tenant_id = ${tenantId} AND id = ${input.id}
					LIMIT 1`;
						const row = yield* findRequired(
							rows[0],
							"notification_delivery_attempts",
							input.id
						);
						return yield* mapNotificationDeliveryAttemptRecordEffect(row);
					}),
				listByNotificationEventId: (notificationEventId) =>
					Effect.gen(function* listNotificationDeliveryAttemptsByEventId() {
						const tenantId = yield* requireTenantId;
						const rows = yield* sql<{
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
						}>`SELECT * FROM notification_delivery_attempts
					WHERE tenant_id = ${tenantId} AND notification_event_id = ${notificationEventId}
					ORDER BY attempt ASC, created_at ASC`;
						return yield* Effect.forEach(
							rows,
							mapNotificationDeliveryAttemptRecordEffect
						);
					}),
			};

		const webhookEndpoints: WebhookEndpointsRepository = {
			ensureConfigured: (input) =>
				Effect.gen(function* ensureConfiguredWebhookEndpoint() {
					const tenantId = yield* requireTenantId;
					return yield* sql.withTransaction(
						Effect.gen(function* ensureConfiguredWebhookEndpointTransaction() {
							yield* sql`INSERT INTO webhook_endpoints ${sql.insert({
								created_at: input.createdAt,
								id: input.id,
								tenant_id: tenantId,
								updated_at: input.createdAt,
								url: input.url,
							})}
							ON CONFLICT(tenant_id, id) DO UPDATE SET
								url = excluded.url,
								updated_at = excluded.updated_at`;
							yield* sql`INSERT INTO webhook_signing_keys ${sql.insert({
								created_at: input.createdAt,
								endpoint_id: input.id,
								expires_at: null,
								id: input.keyId ?? `${input.id}:primary`,
								role: "primary",
								secret: input.signingSecret,
								tenant_id: tenantId,
							})}
							ON CONFLICT DO NOTHING`;
							const endpointRows = yield* sql<WebhookEndpointSqlRow>`SELECT *
							FROM webhook_endpoints
							WHERE tenant_id = ${tenantId} AND id = ${input.id}
							LIMIT 1`;
							const endpointRow = yield* findRequired(
								endpointRows[0],
								"webhook_endpoints",
								input.id
							);
							const primaryRows = yield* sql<WebhookSigningKeySqlRow>`SELECT *
							FROM webhook_signing_keys
							WHERE tenant_id = ${tenantId}
								AND endpoint_id = ${input.id}
								AND role = 'primary'
							LIMIT 1`;
							const primaryRow = yield* findRequired(
								primaryRows[0],
								"webhook_signing_keys",
								input.id
							);
							return {
								endpoint: mapWebhookEndpointRecord(endpointRow),
								primaryKey: mapWebhookSigningKeyRecord(primaryRow),
							};
						})
					);
				}),
			getById: (id) =>
				Effect.gen(function* getWebhookEndpointById() {
					const tenantId = yield* requireTenantId;
					const rows =
						yield* sql<WebhookEndpointSqlRow>`SELECT * FROM webhook_endpoints
					WHERE tenant_id = ${tenantId} AND id = ${id}
					LIMIT 1`;
					const row = yield* findRequired(rows[0], "webhook_endpoints", id);
					return mapWebhookEndpointRecord(row);
				}),
			listActiveKeys: (endpointId, now) =>
				Effect.gen(function* listActiveWebhookSigningKeys() {
					const tenantId = yield* requireTenantId;
					const rows =
						yield* sql<WebhookSigningKeySqlRow>`SELECT * FROM webhook_signing_keys
					WHERE tenant_id = ${tenantId}
						AND endpoint_id = ${endpointId}
						AND (
							role = 'primary'
							OR expires_at IS NULL
							OR expires_at > ${now}
						)
					ORDER BY
						CASE role WHEN 'primary' THEN 0 ELSE 1 END ASC,
						created_at DESC,
						id ASC`;
					return rows.map(mapWebhookSigningKeyRecord);
				}),
			rotateSigningKey: (input) =>
				Effect.gen(function* rotateWebhookSigningKey() {
					const tenantId = yield* requireTenantId;
					return yield* sql.withTransaction(
						Effect.gen(function* rotateWebhookSigningKeyTransaction() {
							const endpointRows =
								yield* sql<WebhookEndpointSqlRow>`UPDATE webhook_endpoints
							SET updated_at = updated_at
							WHERE tenant_id = ${tenantId} AND id = ${input.endpointId}
							RETURNING *`;
							const endpointRow = yield* findRequired(
								endpointRows[0],
								"webhook_endpoints",
								input.endpointId
							);
							const previousRows =
								yield* sql<WebhookSigningKeySqlRow>`UPDATE webhook_signing_keys
							SET role = 'secondary',
								expires_at = ${input.graceExpiresAt}
							WHERE tenant_id = ${tenantId}
								AND endpoint_id = ${input.endpointId}
								AND role = 'primary'
							RETURNING *`;
							yield* sql`INSERT INTO webhook_signing_keys ${sql.insert({
								created_at: input.rotatedAt,
								endpoint_id: input.endpointId,
								expires_at: null,
								id: input.newKeyId,
								role: "primary",
								secret: input.newSecret,
								tenant_id: tenantId,
							})}`;
							const newRows = yield* sql<WebhookSigningKeySqlRow>`SELECT *
							FROM webhook_signing_keys
							WHERE tenant_id = ${tenantId} AND id = ${input.newKeyId}
							LIMIT 1`;
							const newRow = yield* findRequired(
								newRows[0],
								"webhook_signing_keys",
								input.newKeyId
							);
							const activeRows = yield* sql<WebhookSigningKeySqlRow>`SELECT *
							FROM webhook_signing_keys
							WHERE tenant_id = ${tenantId}
								AND endpoint_id = ${input.endpointId}
								AND (
									role = 'primary'
									OR expires_at IS NULL
									OR expires_at > ${input.rotatedAt}
								)
							ORDER BY
								CASE role WHEN 'primary' THEN 0 ELSE 1 END ASC,
								created_at DESC,
								id ASC`;
							return {
								activeKeys: activeRows.map(mapWebhookSigningKeyRecord),
								endpoint: mapWebhookEndpointRecord(endpointRow),
								newPrimary: mapWebhookSigningKeyRecord(newRow),
								previousPrimary: previousRows[0]
									? mapWebhookSigningKeyRecord(previousRows[0])
									: undefined,
							};
						})
					);
				}),
		};

		const chatRuntimeState: ChatRuntimeStateRepository = {
			acquireLock: (input) =>
				Effect.gen(function* acquireChatRuntimeLock() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly thread_id: string;
						readonly tenant_id: string;
						readonly token: string;
						readonly expires_at: string;
						readonly acquired_at: string;
					}>`INSERT INTO chat_thread_locks (
						acquired_at,
						expires_at,
						tenant_id,
						thread_id,
						token
					) VALUES (
						${input.acquiredAt},
						${input.expiresAt},
						${tenantId},
						${input.threadId},
						${input.token}
					)
					ON CONFLICT(tenant_id, thread_id) DO UPDATE SET
						acquired_at = excluded.acquired_at,
						expires_at = excluded.expires_at,
						token = excluded.token
					WHERE chat_thread_locks.expires_at <= ${dbCurrentTimestamp}
					RETURNING *`;
					return rows[0] ? mapChatThreadLockRecord(rows[0]) : null;
				}),
			delete: (key) =>
				Effect.gen(function* deleteChatRuntimeState() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM chat_state_entries
					WHERE tenant_id = ${tenantId} AND cache_key = ${key}`;
				}),
			extendLock: (input) =>
				Effect.gen(function* extendChatRuntimeLock() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly thread_id: string;
					}>`UPDATE chat_thread_locks
					SET expires_at = ${input.expiresAt}
					WHERE tenant_id = ${tenantId}
						AND thread_id = ${input.threadId}
						AND token = ${input.token}
						AND expires_at > ${dbCurrentTimestamp}
					RETURNING thread_id`;
					return rows.length > 0;
				}),
			get: (key) =>
				Effect.gen(function* getChatRuntimeState() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM chat_state_entries
					WHERE tenant_id = ${tenantId}
						AND cache_key = ${key}
						AND expires_at IS NOT NULL
						AND expires_at <= ${dbCurrentTimestamp}`;
					const rows = yield* sql<{
						readonly cache_key: string;
						readonly tenant_id: string;
						readonly value_json: string;
						readonly expires_at: string | null;
						readonly created_at: string;
						readonly updated_at: string;
					}>`SELECT * FROM chat_state_entries
					WHERE tenant_id = ${tenantId} AND cache_key = ${key}
					LIMIT 1`;
					return rows[0] ? mapChatStateRecord(rows[0]) : null;
				}),
			isSubscribed: (threadId) =>
				Effect.gen(function* isChatThreadSubscribed() {
					const tenantId = yield* requireTenantId;
					const rows = yield* sql<{
						readonly thread_id: string;
					}>`SELECT thread_id FROM chat_thread_subscriptions
					WHERE tenant_id = ${tenantId} AND thread_id = ${threadId}
					LIMIT 1`;
					return rows.length > 0;
				}),
			releaseLock: (input) =>
				Effect.gen(function* releaseChatRuntimeLock() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM chat_thread_locks
					WHERE tenant_id = ${tenantId}
						AND thread_id = ${input.threadId}
						AND token = ${input.token}`;
				}),
			set: (input) =>
				Effect.gen(function* setChatRuntimeState() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO chat_state_entries ${sql.insert({
						cache_key: input.key,
						created_at: input.createdAt,
						expires_at: input.expiresAt ?? null,
						tenant_id: tenantId,
						updated_at: input.updatedAt,
						value_json: jsonEncode(input.value),
					})}
					ON CONFLICT(tenant_id, cache_key) DO UPDATE SET
						value_json = excluded.value_json,
						expires_at = excluded.expires_at,
						updated_at = excluded.updated_at`;
					const rows = yield* sql<{
						readonly cache_key: string;
						readonly tenant_id: string;
						readonly value_json: string;
						readonly expires_at: string | null;
						readonly created_at: string;
						readonly updated_at: string;
					}>`SELECT * FROM chat_state_entries
					WHERE tenant_id = ${tenantId} AND cache_key = ${input.key}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"chat_state_entries",
						input.key
					);
					return mapChatStateRecord(row);
				}),
			setIfNotExists: (input) =>
				Effect.gen(function* setChatRuntimeStateIfNotExists() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM chat_state_entries
					WHERE tenant_id = ${tenantId}
						AND cache_key = ${input.key}
						AND expires_at IS NOT NULL
						AND expires_at <= ${dbCurrentTimestamp}`;
					const rows = yield* sql<{
						readonly cache_key: string;
					}>`INSERT INTO chat_state_entries ${sql.insert({
						cache_key: input.key,
						created_at: input.createdAt,
						expires_at: input.expiresAt ?? null,
						tenant_id: tenantId,
						updated_at: input.updatedAt,
						value_json: jsonEncode(input.value),
					})}
					ON CONFLICT(tenant_id, cache_key) DO NOTHING
					RETURNING cache_key`;
					return rows.length > 0;
				}),
			subscribe: (input) =>
				Effect.gen(function* subscribeChatThread() {
					const tenantId = yield* requireTenantId;
					yield* sql`INSERT INTO chat_thread_subscriptions ${sql.insert({
						subscribed_at: input.subscribedAt,
						tenant_id: tenantId,
						thread_id: input.threadId,
					})}
					ON CONFLICT(tenant_id, thread_id) DO UPDATE SET
						subscribed_at = excluded.subscribed_at`;
					const rows = yield* sql<{
						readonly thread_id: string;
						readonly tenant_id: string;
						readonly subscribed_at: string;
					}>`SELECT * FROM chat_thread_subscriptions
					WHERE tenant_id = ${tenantId} AND thread_id = ${input.threadId}
					LIMIT 1`;
					const row = yield* findRequired(
						rows[0],
						"chat_thread_subscriptions",
						input.threadId
					);
					return mapChatThreadSubscriptionRecord(row);
				}),
			unsubscribe: (threadId) =>
				Effect.gen(function* unsubscribeChatThread() {
					const tenantId = yield* requireTenantId;
					yield* sql`DELETE FROM chat_thread_subscriptions
					WHERE tenant_id = ${tenantId} AND thread_id = ${threadId}`;
				}),
		};

		return {
			auditEvents,
			chatRuntimeState,
			clockSegments,
			fulfillmentArtifacts,
			notificationDeliveryAttempts,
			notificationEvents,
			policyAssignments,
			requests,
			retentionPolicies,
			timeline,
			verificationEvidence,
			webhookEndpoints,
		} satisfies PersistenceService;
	});

/**
 * Creates a driver-agnostic {@link Persistence} layer that runs migrations
 * (with optional before/after hooks) and wires up all tenant-scoped
 * repositories.
 *
 * @param options - Driver instance and optional migration hooks.
 * @returns A layer providing {@link Persistence} that requires
 *   {@link TenantContext} at runtime.
 */
export const makePersistenceLayer = (options: {
	readonly driver: PersistenceDriver;
	readonly migrationHooks?: PersistenceMigrationHooks;
}): Layer.Layer<Persistence, never, TenantContext> =>
	Layer.provide(
		Layer.effect(Persistence)(
			pipe(makePersistence(options.migrationHooks), Effect.orDie)
		),
		Layer.orDie(options.driver.layer)
	);

/**
 * Resolves a persistence layer into the plain {@link PersistenceService}
 * expected by app/runtime wiring helpers.
 *
 * A bootstrap tenant context is provided only while constructing the runtime so
 * startup can run migrations before the server begins handling requests. The
 * returned repository methods still require a real tenant context when they are
 * executed later.
 *
 * @param layer - Persistence layer to resolve.
 * @returns Promise resolving to the constructed {@link PersistenceService}.
 */
export const resolvePersistenceService = (
	layer: Layer.Layer<Persistence, never, TenantContext>
): Promise<PersistenceService> =>
	ManagedRuntime.make(
		layer.pipe(
			Layer.provide(
				Layer.succeed(TenantContext)({
					tenantId: BOOTSTRAP_TENANT_ID,
				})
			)
		)
	).runPromise(Effect.service(Persistence));

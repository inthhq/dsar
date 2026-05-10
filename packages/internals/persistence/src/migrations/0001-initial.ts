import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import {
	backfillRequestLookupColumns,
	ensureRequestLookupColumns,
} from "../services/persistence/request-lookup-migrations";

/**
 * Unique migration identifier used to track applied migrations.
 */
export const migrationId = 1;

/**
 * Human-readable migration name for auditability.
 */
export const migrationName = "initial_tenant_safe_schema";

/**
 * Applies the initial schema for requests, timeline, policy, verification,
 * fulfillment, retention, audit, notification events, and notification
 * delivery attempt entities.
 *
 * @param sql - Effect SQL client used to execute the DDL statements that
 *   create each table.
 * @returns An `Effect` that succeeds with `void` when all tables are created
 *   successfully, or fails with a `SqlError` if any statement is rejected by
 *   the database.
 */
export const applyMigration0001 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* runMigration0001() {
		yield* sql`CREATE TABLE IF NOT EXISTS requests (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			status TEXT NOT NULL,
			received_at TEXT NOT NULL,
			due_at TEXT NOT NULL,
			clock_mode TEXT NOT NULL,
			subject_id TEXT,
			subject_external_ref TEXT,
			requestor_email TEXT,
			policy_pack TEXT,
			requestor_json TEXT NOT NULL,
			authority_json TEXT NOT NULL,
			capture_json TEXT NOT NULL,
			appeals_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		)`;
		yield* ensureRequestLookupColumns(sql);
		yield* backfillRequestLookupColumns(sql);

		yield* sql`CREATE TABLE IF NOT EXISTS request_clock_segments (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			from_at TEXT NOT NULL,
			to_at TEXT NOT NULL,
			reason TEXT NOT NULL,
			counts_toward_deadline INTEGER NOT NULL,
			policy_version TEXT NOT NULL,
			actor TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS request_timeline_events (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS policy_assignments (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			policy_pack TEXT NOT NULL,
			policy_version TEXT NOT NULL,
			assigned_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS verification_evidence (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			level TEXT NOT NULL,
			reason_for_doubt TEXT NOT NULL,
			methods_allowed_json TEXT NOT NULL,
			status TEXT NOT NULL,
			evidence_artifacts_json TEXT NOT NULL,
			retention_expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS fulfillment_artifacts (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			artifact_manifest_json TEXT NOT NULL,
			validation_state TEXT NOT NULL,
			delivery_prepare_json TEXT NOT NULL,
			delivery_logs_json TEXT NOT NULL,
			token_gate_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS retention_policies (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			class TEXT NOT NULL,
			min_days INTEGER NOT NULL,
			max_days INTEGER NOT NULL,
			purge_enabled INTEGER NOT NULL,
			legal_hold_enabled INTEGER NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			UNIQUE (tenant_id, class)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS audit_events (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT,
			actor TEXT NOT NULL,
			action TEXT NOT NULL,
			object TEXT NOT NULL,
			before_json TEXT NOT NULL,
			after_json TEXT NOT NULL,
			reason_json TEXT NOT NULL,
			prev_hash TEXT,
			hash TEXT NOT NULL,
			hash_alg TEXT NOT NULL,
			sequence INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS notification_events (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			event_type TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			correlation_id TEXT NOT NULL,
			idempotency_key TEXT NOT NULL,
			policy_version TEXT NOT NULL,
			locale TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			notification_event_id TEXT NOT NULL,
			request_id TEXT NOT NULL,
			channel TEXT NOT NULL,
			destination TEXT NOT NULL,
			attempt INTEGER NOT NULL,
			status TEXT NOT NULL,
			response_code INTEGER,
			error_text TEXT,
			created_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, request_id) REFERENCES requests(tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS chat_state_entries (
			tenant_id TEXT NOT NULL,
			cache_key TEXT NOT NULL,
			value_json TEXT NOT NULL,
			expires_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, cache_key)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS chat_thread_subscriptions (
			tenant_id TEXT NOT NULL,
			thread_id TEXT NOT NULL,
			subscribed_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, thread_id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS chat_thread_locks (
			tenant_id TEXT NOT NULL,
			thread_id TEXT NOT NULL,
			token TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			acquired_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, thread_id)
		)`;

		yield* sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_due
			ON requests(tenant_id, due_at)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_subject_created
			ON requests(tenant_id, subject_id, created_at, id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_subject_external_created
			ON requests(tenant_id, subject_external_ref, created_at, id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_requestor_email_created
			ON requests(tenant_id, requestor_email, created_at, id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_requests_tenant_policy_created
			ON requests(tenant_id, policy_pack, created_at, id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_timeline_tenant_request
			ON request_timeline_events(tenant_id, request_id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_audit_tenant_request
			ON audit_events(tenant_id, request_id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_request
			ON notification_events(tenant_id, request_id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_idempotency
			ON notification_events(tenant_id, idempotency_key)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_notification_attempts_tenant_event
			ON notification_delivery_attempts(tenant_id, notification_event_id)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_state_tenant_expiry
			ON chat_state_entries(tenant_id, expires_at)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_locks_tenant_expiry
			ON chat_thread_locks(tenant_id, expires_at)`;
	});

/**
 * Test-only rollback for the initial schema migration.
 *
 * Production persistence remains forward-only; this helper exists so driver
 * migration suites can verify each migration's DDL boundary.
 *
 * @param sql - Effect SQL client used to execute rollback DDL.
 * @returns An effect that succeeds once the migration-owned objects are gone.
 */
export const revertMigration0001 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* revertMigration0001Program() {
		yield* sql`DROP INDEX IF EXISTS idx_chat_locks_tenant_expiry`;
		yield* sql`DROP INDEX IF EXISTS idx_chat_state_tenant_expiry`;
		yield* sql`DROP INDEX IF EXISTS idx_notification_attempts_tenant_event`;
		yield* sql`DROP INDEX IF EXISTS idx_notification_events_tenant_idempotency`;
		yield* sql`DROP INDEX IF EXISTS idx_notification_events_tenant_request`;
		yield* sql`DROP INDEX IF EXISTS idx_audit_tenant_request`;
		yield* sql`DROP INDEX IF EXISTS idx_timeline_tenant_request`;
		yield* sql`DROP INDEX IF EXISTS idx_requests_tenant_policy_created`;
		yield* sql`DROP INDEX IF EXISTS idx_requests_tenant_requestor_email_created`;
		yield* sql`DROP INDEX IF EXISTS idx_requests_tenant_subject_external_created`;
		yield* sql`DROP INDEX IF EXISTS idx_requests_tenant_subject_created`;
		yield* sql`DROP INDEX IF EXISTS idx_requests_tenant_due`;

		yield* sql`DROP TABLE IF EXISTS chat_thread_locks`;
		yield* sql`DROP TABLE IF EXISTS chat_thread_subscriptions`;
		yield* sql`DROP TABLE IF EXISTS chat_state_entries`;
		yield* sql`DROP TABLE IF EXISTS notification_delivery_attempts`;
		yield* sql`DROP TABLE IF EXISTS notification_events`;
		yield* sql`DROP TABLE IF EXISTS audit_events`;
		yield* sql`DROP TABLE IF EXISTS retention_policies`;
		yield* sql`DROP TABLE IF EXISTS fulfillment_artifacts`;
		yield* sql`DROP TABLE IF EXISTS verification_evidence`;
		yield* sql`DROP TABLE IF EXISTS policy_assignments`;
		yield* sql`DROP TABLE IF EXISTS request_timeline_events`;
		yield* sql`DROP TABLE IF EXISTS request_clock_segments`;
		yield* sql`DROP TABLE IF EXISTS requests`;
	});

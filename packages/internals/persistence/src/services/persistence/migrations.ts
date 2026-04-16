import * as Effect from "effect/Effect";

import type { Sql } from "./shared";

/**
 * Creates all persistence tables and indexes if they do not already exist.
 *
 * @param sql - SQL client connection used to execute the DDL statements.
 * @returns An effect that completes once every table and index has been
 *   created, failing on SQL errors.
 */
export const runMigrations = (sql: Sql) =>
	Effect.gen(function* runMigrationsProgram() {
		yield* sql`CREATE TABLE IF NOT EXISTS requests (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			status TEXT NOT NULL,
			received_at TEXT NOT NULL,
			due_at TEXT NOT NULL,
			clock_mode TEXT NOT NULL,
			requestor_json TEXT NOT NULL,
			authority_json TEXT NOT NULL,
			capture_json TEXT NOT NULL,
			appeals_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		)`;

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

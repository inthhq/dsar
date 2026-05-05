import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

/**
 * Unique migration identifier used to track applied webhook endpoint DDL.
 */
export const migrationId = 2;

/**
 * Human-readable migration name for auditability.
 */
export const migrationName = "webhook_endpoint_signing_keys";

/**
 * Applies persistent outbound webhook endpoint and signing-key tables.
 *
 * @param sql - Effect SQL client used to execute webhook DDL statements.
 * @returns An effect that succeeds after webhook tables and indexes exist.
 */
export const applyMigration0002 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* runMigration0002() {
		yield* sql`CREATE TABLE IF NOT EXISTS webhook_endpoints (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			url TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id)
		)`;

		yield* sql`CREATE TABLE IF NOT EXISTS webhook_signing_keys (
			id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			endpoint_id TEXT NOT NULL,
			secret_ciphertext TEXT NOT NULL,
			secret_key_id TEXT NOT NULL,
			secret_nonce TEXT NOT NULL,
			secret_tag TEXT NOT NULL,
			secret_encrypted_data_key TEXT NOT NULL,
			secret_data_key_nonce TEXT NOT NULL,
			secret_data_key_tag TEXT NOT NULL,
			role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
			expires_at TEXT,
			created_at TEXT NOT NULL,
			PRIMARY KEY (tenant_id, id),
			FOREIGN KEY (tenant_id, endpoint_id) REFERENCES webhook_endpoints(tenant_id, id)
		)`;

		yield* sql`CREATE INDEX IF NOT EXISTS idx_webhook_keys_tenant_endpoint
			ON webhook_signing_keys(tenant_id, endpoint_id)`;
		yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_keys_primary
			ON webhook_signing_keys(tenant_id, endpoint_id)
			WHERE role = 'primary'`;
	});

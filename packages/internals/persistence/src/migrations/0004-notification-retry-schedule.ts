import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

/**
 * Unique migration identifier used to track webhook retry scheduling DDL.
 */
export const migrationId = 4;

/**
 * Human-readable migration name for auditability.
 */
export const migrationName = "notification_delivery_retry_schedule";

const addRetryScheduleColumns = (sql: SqlClient.SqlClient) =>
	Effect.gen(function* addRetryScheduleColumnsProgram() {
		yield* sql`ALTER TABLE notification_delivery_attempts
			ADD COLUMN next_attempt_at TEXT`;
		yield* sql`ALTER TABLE notification_delivery_attempts
			ADD COLUMN claimed_at TEXT`;
		yield* sql`ALTER TABLE notification_delivery_attempts
			ADD COLUMN claim_expires_at TEXT`;
	});

/**
 * Adds durable retry scheduling columns to notification delivery attempts.
 *
 * Existing attempt rows keep a null `next_attempt_at`, so they are not picked
 * up by the retry worker until a later send writes a pending/failed job.
 *
 * @param sql - Effect SQL client used to execute the DDL statements.
 * @returns An effect that succeeds after the columns and index exist.
 */
export const applyMigration0004 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* runMigration0004() {
		yield* addRetryScheduleColumns(sql);
		yield* sql`CREATE INDEX IF NOT EXISTS idx_notification_attempts_tenant_due
			ON notification_delivery_attempts(
				tenant_id,
				channel,
				status,
				next_attempt_at
			)`;
	});

/**
 * Test-only rollback for webhook retry scheduling DDL.
 *
 * Production persistence remains forward-only; this helper exists so driver
 * migration suites can verify each migration's DDL boundary.
 *
 * @param sql - Effect SQL client used to execute rollback DDL.
 * @returns An effect that succeeds once migration-owned objects are gone.
 */
export const revertMigration0004 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* revertMigration0004Program() {
		yield* sql`DROP INDEX IF EXISTS idx_notification_attempts_tenant_due`;
		yield* sql.onDialectOrElse({
			orElse: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS claim_expires_at`,
			pg: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS claim_expires_at`,
			sqlite: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN claim_expires_at`,
		});
		yield* sql.onDialectOrElse({
			orElse: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS claimed_at`,
			pg: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS claimed_at`,
			sqlite: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN claimed_at`,
		});
		yield* sql.onDialectOrElse({
			orElse: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS next_attempt_at`,
			pg: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN IF EXISTS next_attempt_at`,
			sqlite: () => sql`ALTER TABLE notification_delivery_attempts
				DROP COLUMN next_attempt_at`,
		});
	});

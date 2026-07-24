import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

/**
 * Unique migration identifier used to track Chat SDK list and queue DDL.
 */
export const migrationId = 3;

/**
 * Human-readable migration name for auditability.
 */
export const migrationName = "chat_runtime_lists_and_queues";

const createListKeyTable = (sql: SqlClient.SqlClient) =>
	sql`CREATE TABLE IF NOT EXISTS chat_state_list_keys (
		tenant_id TEXT NOT NULL,
		list_key TEXT NOT NULL,
		expires_at TEXT,
		PRIMARY KEY (tenant_id, list_key)
	)`;

const createListTable = (sql: SqlClient.SqlClient) =>
	sql.onDialectOrElse({
		orElse: () => sql`CREATE TABLE IF NOT EXISTS chat_state_lists (
			seq INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			list_key TEXT NOT NULL,
			value_json TEXT NOT NULL,
			FOREIGN KEY (tenant_id, list_key)
				REFERENCES chat_state_list_keys(tenant_id, list_key)
				ON DELETE CASCADE
		)`,
		pg: () => sql`CREATE TABLE IF NOT EXISTS chat_state_lists (
			seq BIGSERIAL PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			list_key TEXT NOT NULL,
			value_json TEXT NOT NULL,
			FOREIGN KEY (tenant_id, list_key)
				REFERENCES chat_state_list_keys(tenant_id, list_key)
				ON DELETE CASCADE
		)`,
		sqlite: () => sql`CREATE TABLE IF NOT EXISTS chat_state_lists (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			tenant_id TEXT NOT NULL,
			list_key TEXT NOT NULL,
			value_json TEXT NOT NULL,
			FOREIGN KEY (tenant_id, list_key)
				REFERENCES chat_state_list_keys(tenant_id, list_key)
				ON DELETE CASCADE
		)`,
	});

const createQueueTable = (sql: SqlClient.SqlClient) =>
	sql.onDialectOrElse({
		orElse: () => sql`CREATE TABLE IF NOT EXISTS chat_state_queues (
			seq INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			thread_id TEXT NOT NULL,
			value_json TEXT NOT NULL,
			expires_at TEXT NOT NULL
		)`,
		pg: () => sql`CREATE TABLE IF NOT EXISTS chat_state_queues (
			seq BIGSERIAL PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			thread_id TEXT NOT NULL,
			value_json TEXT NOT NULL,
			expires_at TEXT NOT NULL
		)`,
		sqlite: () => sql`CREATE TABLE IF NOT EXISTS chat_state_queues (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			tenant_id TEXT NOT NULL,
			thread_id TEXT NOT NULL,
			value_json TEXT NOT NULL,
			expires_at TEXT NOT NULL
		)`,
	});

/**
 * Adds durable, ordered storage for Chat SDK transcript lists and message
 * queues.
 *
 * @param sql - Effect SQL client used to execute the DDL statements.
 * @returns An effect that succeeds after the tables and indexes exist.
 */
export const applyMigration0003 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* runMigration0003() {
		yield* createListKeyTable(sql);
		yield* createListTable(sql);
		yield* createQueueTable(sql);
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_lists_tenant_key_seq
			ON chat_state_lists(tenant_id, list_key, seq)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_list_keys_tenant_expiry
			ON chat_state_list_keys(tenant_id, expires_at)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_queues_tenant_thread_seq
			ON chat_state_queues(tenant_id, thread_id, seq)`;
		yield* sql`CREATE INDEX IF NOT EXISTS idx_chat_queues_tenant_expiry
			ON chat_state_queues(tenant_id, expires_at)`;
	});

/**
 * Test-only rollback for Chat SDK list and queue storage.
 *
 * @param sql - Effect SQL client used to execute rollback DDL.
 * @returns An effect that succeeds once migration-owned objects are gone.
 */
export const revertMigration0003 = (
	sql: SqlClient.SqlClient
): Effect.Effect<void, SqlError> =>
	Effect.gen(function* revertMigration0003Program() {
		yield* sql`DROP INDEX IF EXISTS idx_chat_queues_tenant_expiry`;
		yield* sql`DROP INDEX IF EXISTS idx_chat_queues_tenant_thread_seq`;
		yield* sql`DROP INDEX IF EXISTS idx_chat_list_keys_tenant_expiry`;
		yield* sql`DROP INDEX IF EXISTS idx_chat_lists_tenant_key_seq`;
		yield* sql`DROP TABLE IF EXISTS chat_state_queues`;
		yield* sql`DROP TABLE IF EXISTS chat_state_lists`;
		yield* sql`DROP TABLE IF EXISTS chat_state_list_keys`;
	});

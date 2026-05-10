import * as Effect from "effect/Effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import {
	applyMigration0001,
	migrationId as migration0001Id,
	migrationName as migration0001Name,
	revertMigration0001,
} from "../../migrations/0001-initial";
import {
	applyMigration0002,
	migrationId as migration0002Id,
	migrationName as migration0002Name,
	revertMigration0002,
} from "../../migrations/0002-webhook-endpoints";
import type { Sql } from "./shared";

/**
 * Metadata table used to record successfully applied schema migrations.
 */
export const MIGRATION_TABLE_NAME = "dsar_schema_migrations";

/**
 * Internal migration descriptor used by the runner and driver conformance
 * tests. Rollback is intentionally not exposed through the package entrypoint.
 */
export interface PersistenceMigration {
	/** Monotonic migration identifier. */
	readonly id: number;
	/** Human-readable migration name recorded in metadata. */
	readonly name: string;
	/** Applies the migration. */
	readonly up: (sql: Sql) => Effect.Effect<void, SqlError>;
	/** Reverts only objects owned by this migration for test coverage. */
	readonly down: (sql: Sql) => Effect.Effect<void, SqlError>;
}

interface AppliedMigrationRow {
	readonly id: number;
	readonly name: string;
}

const migrations = [
	{
		down: revertMigration0001,
		id: migration0001Id,
		name: migration0001Name,
		up: applyMigration0001,
	},
	{
		down: revertMigration0002,
		id: migration0002Id,
		name: migration0002Name,
		up: applyMigration0002,
	},
] as const satisfies readonly PersistenceMigration[];

const migrationById: ReadonlyMap<number, PersistenceMigration> = new Map(
	migrations.map((migration) => [migration.id, migration])
);

const ensureMigrationMetadataTable = (sql: Sql) =>
	sql`CREATE TABLE IF NOT EXISTS dsar_schema_migrations (
		id INTEGER NOT NULL PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TEXT NOT NULL
	)`;

const readAppliedMigrations = (
	sql: Sql
): Effect.Effect<readonly AppliedMigrationRow[], SqlError> =>
	sql<AppliedMigrationRow>`SELECT id, name
		FROM dsar_schema_migrations
		ORDER BY id`;

const assertAppliedMigrationsMatchRegistry = (
	rows: readonly AppliedMigrationRow[]
) =>
	Effect.gen(function* assertAppliedMigrationsMatchRegistryProgram() {
		const appliedIds = new Set(rows.map((row) => Number(row.id)));
		for (const row of rows) {
			const migrationId = Number(row.id);
			const migration = migrationById.get(migrationId);
			if (!migration) {
				return yield* Effect.fail(
					new Error(
						`Database contains unknown DSAR schema migration ${row.id}.`
					)
				);
			}
			if (migration.name !== row.name) {
				return yield* Effect.fail(
					new Error(
						`Database migration ${row.id} is named "${row.name}", expected "${migration.name}".`
					)
				);
			}
		}
		let foundMissingMigration = false;
		for (const migration of migrations) {
			if (!appliedIds.has(migration.id)) {
				foundMissingMigration = true;
				continue;
			}
			if (foundMissingMigration) {
				return yield* Effect.fail(
					new Error(
						`Database has migration ${migration.id} recorded without all prior DSAR schema migrations.`
					)
				);
			}
		}
	});

const recordAppliedMigration = (sql: Sql, migration: PersistenceMigration) =>
	sql`INSERT INTO dsar_schema_migrations (id, name, applied_at)
		VALUES (${migration.id}, ${migration.name}, CURRENT_TIMESTAMP)
		ON CONFLICT(id) DO NOTHING`;

/**
 * Ordered migration registry used by driver conformance tests.
 *
 * @returns Registered migrations in application order.
 */
export const getPersistenceMigrationsForTest =
	(): readonly PersistenceMigration[] => migrations;

/**
 * Reads applied migration metadata for driver conformance tests.
 *
 * @param sql - Effect SQL client used to query metadata.
 * @returns Applied migration rows ordered by migration id.
 */
export const readAppliedMigrationsForTest = readAppliedMigrations;

/**
 * Creates the migration metadata table for driver conformance tests that build
 * historical database states directly.
 *
 * @param sql - Effect SQL client used to create metadata.
 * @returns An effect that succeeds when the table exists.
 */
export const ensureMigrationMetadataTableForTest = ensureMigrationMetadataTable;

/**
 * Records an applied migration for driver conformance tests.
 *
 * @param sql - Effect SQL client used to write metadata.
 * @param migration - Migration descriptor to record.
 * @returns An effect that succeeds when metadata is written.
 */
export const recordAppliedMigrationForTest = recordAppliedMigration;

/**
 * Applies all unapplied persistence migrations in registry order.
 *
 * @param sql - SQL client connection used to execute DDL and metadata writes.
 * @returns An effect that completes once the schema is current.
 */
export const runMigrations = (sql: Sql) =>
	Effect.gen(function* runMigrationsProgram() {
		yield* ensureMigrationMetadataTable(sql);
		const appliedRows = yield* readAppliedMigrations(sql);
		yield* assertAppliedMigrationsMatchRegistry(appliedRows);

		const appliedIds = new Set(appliedRows.map((row) => Number(row.id)));
		for (const migration of migrations) {
			if (appliedIds.has(migration.id)) {
				continue;
			}
			yield* sql.withTransaction(
				Effect.gen(function* applyMigrationTransaction() {
					yield* migration.up(sql);
					yield* recordAppliedMigration(sql, migration);
				})
			);
		}
		const finalAppliedRows = yield* readAppliedMigrations(sql);
		yield* assertAppliedMigrationsMatchRegistry(finalAppliedRows);
	});

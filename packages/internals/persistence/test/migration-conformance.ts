import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	ensureMigrationMetadataTableForTest,
	getPersistenceMigrationsForTest,
	readAppliedMigrationsForTest,
	recordAppliedMigrationForTest,
	runMigrations,
} from "../src/services/persistence/migrations";
import type { Sql } from "../src/services/persistence/shared";

export interface SchemaSnapshot {
	readonly indexes: readonly string[];
	readonly tables: readonly string[];
}

export interface MigrationTestContext {
	readonly cleanup?: () => Promise<void>;
	readonly run: <A>(
		program: (sql: Sql) => Effect.Effect<A, unknown>
	) => Promise<A>;
}

export interface MigrationConformanceOptions {
	readonly inspectSchema: (sql: Sql) => Effect.Effect<SchemaSnapshot, unknown>;
	readonly makeContext: (
		label: string
	) => MigrationTestContext | Promise<MigrationTestContext>;
	readonly name: string;
	readonly skip?: boolean;
}

const migrations = getPersistenceMigrationsForTest();
const currentMigrationRows = migrations.map((migration) => ({
	id: migration.id,
	name: migration.name,
}));

const withContext = async (
	options: MigrationConformanceOptions,
	label: string,
	testProgram: (context: MigrationTestContext) => Promise<void>
) => {
	const context = await options.makeContext(label);
	try {
		await testProgram(context);
	} finally {
		await context.cleanup?.();
	}
};

const seedCurrentRequest = (sql: Sql, requestId: string) =>
	sql`INSERT INTO requests (
		id,
		tenant_id,
		status,
		received_at,
		due_at,
		clock_mode,
		subject_id,
		subject_external_ref,
		requestor_email,
		policy_pack,
		requestor_json,
		authority_json,
		capture_json,
		appeals_json,
		created_at,
		updated_at
	) VALUES (
		${requestId},
		'tenant-a',
		'received',
		'2026-01-01T00:00:00.000Z',
		'2026-02-01T00:00:00.000Z',
		'calendar_days',
		'subject-current',
		'external-current',
		'requestor@example.com',
		'pack-current',
		'{"type":"subject","email":"requestor@example.com"}',
		'{"status":"verified","type":"subject"}',
		'{"channel":"api","subject":{"subjectId":"subject-current","externalRef":"external-current"},"policy":{"policyPack":"pack-current"}}',
		'[]',
		'2026-01-01T00:00:00.000Z',
		'2026-01-01T00:00:00.000Z'
	)`;

const seedLegacyRequestTable = (sql: Sql) =>
	Effect.gen(function* seedLegacyRequestTableProgram() {
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
		yield* sql`INSERT INTO requests (
			id,
			tenant_id,
			status,
			received_at,
			due_at,
			clock_mode,
			requestor_json,
			authority_json,
			capture_json,
			appeals_json,
			created_at,
			updated_at
		) VALUES (
			'req-legacy',
			'tenant-a',
			'received',
			'2026-01-01T00:00:00.000Z',
			'2026-02-01T00:00:00.000Z',
			'calendar_days',
			'{"type":"subject","email":"legacy@example.com"}',
			'{}',
			'{"subject":{"subjectId":"subject-legacy","externalRef":"external-legacy"},"policy":{"policyPack":"pack-legacy"}}',
			'[]',
			'2026-01-01T00:00:00.000Z',
			'2026-01-01T00:00:00.000Z'
		)`;
	});

const expectCurrentMigrationMetadata = async (
	context: MigrationTestContext
) => {
	const rows = await context.run((sql) => readAppliedMigrationsForTest(sql));
	expect(rows).toStrictEqual(currentMigrationRows);
};

export const defineMigrationConformanceTests = (
	options: MigrationConformanceOptions
) => {
	const describeFn = options.skip ? describe.skip : describe;

	describeFn(`${options.name} migration conformance`, () => {
		it("applies and records every migration on a clean database", async () => {
			await withContext(options, "clean", async (context) => {
				const snapshot = await context.run((sql) =>
					Effect.gen(function* cleanDatabaseMigrationProgram() {
						yield* runMigrations(sql);
						return yield* options.inspectSchema(sql);
					})
				);

				await expectCurrentMigrationMetadata(context);
				expect(snapshot.tables).toEqual(
					expect.arrayContaining([
						"dsar_schema_migrations",
						"requests",
						"webhook_endpoints",
						"webhook_signing_keys",
					])
				);
				expect(snapshot.indexes).toEqual(
					expect.arrayContaining([
						"idx_requests_tenant_due",
						"idx_webhook_keys_primary",
					])
				);
			});
		});

		it.each(migrations)(
			"applies and rolls back migration $id",
			async (migration) => {
				await withContext(
					options,
					`up-down-${migration.id}`,
					async (context) => {
						const snapshot = await context.run((sql) =>
							Effect.gen(function* migrationUpDownProgram() {
								yield* migration.up(sql);
								const afterUp = yield* options.inspectSchema(sql);
								yield* migration.down(sql);
								const afterDown = yield* options.inspectSchema(sql);
								return { afterDown, afterUp };
							})
						);

						if (migration.id === 1) {
							expect(snapshot.afterUp.tables).toContain("requests");
							expect(snapshot.afterDown.tables).not.toContain("requests");
						}
						if (migration.id === 2) {
							expect(snapshot.afterUp.tables).toContain("webhook_endpoints");
							expect(snapshot.afterDown.tables).not.toContain(
								"webhook_endpoints"
							);
						}
					}
				);
			}
		);

		it("upgrades from the previous migration and preserves rows", async () => {
			await withContext(options, "from-previous", async (context) => {
				const requestRows = await context.run((sql) =>
					Effect.gen(function* upgradeFromPreviousProgram() {
						yield* ensureMigrationMetadataTableForTest(sql);
						yield* migrations[0].up(sql);
						yield* recordAppliedMigrationForTest(sql, migrations[0]);
						yield* seedCurrentRequest(sql, "req-from-v1");
						yield* runMigrations(sql);
						return yield* sql<{ readonly id: string }>`SELECT id
							FROM requests
							WHERE tenant_id = 'tenant-a'
							ORDER BY id`;
					})
				);

				await expectCurrentMigrationMetadata(context);
				expect(requestRows.map((row) => row.id)).toStrictEqual(["req-from-v1"]);
			});
		});

		it("backfills legacy request rows while upgrading to current", async () => {
			await withContext(options, "legacy-backfill", async (context) => {
				const rows = await context.run((sql) =>
					Effect.gen(function* legacyBackfillProgram() {
						yield* seedLegacyRequestTable(sql);
						yield* runMigrations(sql);
						return yield* sql<{
							readonly policy_pack: string | null;
							readonly requestor_email: string | null;
							readonly subject_external_ref: string | null;
							readonly subject_id: string | null;
						}>`SELECT
							subject_id,
							subject_external_ref,
							requestor_email,
							policy_pack
							FROM requests
							WHERE tenant_id = 'tenant-a' AND id = 'req-legacy'`;
					})
				);

				await expectCurrentMigrationMetadata(context);
				expect(rows).toStrictEqual([
					{
						policy_pack: "pack-legacy",
						requestor_email: "legacy@example.com",
						subject_external_ref: "external-legacy",
						subject_id: "subject-legacy",
					},
				]);
			});
		});

		it("is idempotent when re-run after data exists", async () => {
			await withContext(options, "idempotent", async (context) => {
				const result = await context.run((sql) =>
					Effect.gen(function* idempotentMigrationProgram() {
						yield* runMigrations(sql);
						yield* seedCurrentRequest(sql, "req-idempotent");
						const before = yield* options.inspectSchema(sql);
						yield* runMigrations(sql);
						const after = yield* options.inspectSchema(sql);
						const rows = yield* sql<{
							readonly capture_json: string;
							readonly id: string;
						}>`SELECT id, capture_json
							FROM requests
							WHERE tenant_id = 'tenant-a'
							ORDER BY id`;
						return { after, before, rows };
					})
				);

				await expectCurrentMigrationMetadata(context);
				expect(result.after).toStrictEqual(result.before);
				expect(result.rows.map((row) => row.id)).toStrictEqual([
					"req-idempotent",
				]);
				expect(result.rows[0]?.capture_json).toContain("subject-current");
			});
		});

		it("tolerates concurrent migration runners racing metadata inserts", async () => {
			await withContext(options, "concurrent", async (context) => {
				const rows = await Promise.all([
					context.run((sql) => runMigrations(sql)),
					context.run((sql) => runMigrations(sql)),
				]).then(() => context.run((sql) => readAppliedMigrationsForTest(sql)));

				expect(rows).toStrictEqual(currentMigrationRows);
			});
		});

		it("fails when recorded migration metadata drifts", async () => {
			await withContext(options, "metadata-drift", async (context) => {
				const result = await context.run((sql) =>
					Effect.gen(function* metadataDriftProgram() {
						yield* ensureMigrationMetadataTableForTest(sql);
						yield* sql`INSERT INTO dsar_schema_migrations (id, name, applied_at)
							VALUES (1, 'wrong_name', CURRENT_TIMESTAMP)`;
						return yield* Effect.result(runMigrations(sql));
					})
				);

				expect(result._tag).toBe("Failure");
			});
		});

		it("fails when recorded migration metadata skips a prior migration", async () => {
			await withContext(options, "metadata-gap", async (context) => {
				const result = await context.run((sql) =>
					Effect.gen(function* metadataGapProgram() {
						yield* ensureMigrationMetadataTableForTest(sql);
						yield* recordAppliedMigrationForTest(sql, migrations[1]);
						return yield* Effect.result(runMigrations(sql));
					})
				);

				expect(result._tag).toBe("Failure");
			});
		});
	});
};

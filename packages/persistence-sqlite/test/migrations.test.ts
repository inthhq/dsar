/* oxlint-disable import/no-relative-parent-imports, jest/require-hook */

import { unlink } from "node:fs/promises";

import { sqliteDriver } from "@dsar/persistence-sqlite";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { Sql } from "../../internals/persistence/src/services/persistence/shared";
import type { MigrationTestContext } from "../../internals/persistence/test/migration-conformance";
import { defineMigrationConformanceTests } from "../../internals/persistence/test/migration-conformance";

const sqliteFile = (label: string): string =>
	`/tmp/dsar-sqlite-migrations-${label}-${crypto.randomUUID()}.sqlite`;

const runSqliteProgram = <A>(
	filename: string,
	program: (sql: Sql) => Effect.Effect<A, unknown>
) =>
	Effect.runPromise(
		Effect.gen(function* runSqliteProgramEffect() {
			const sql = yield* SqlClient.SqlClient;
			return yield* program(sql);
		}).pipe(
			Effect.provide(
				sqliteDriver({
					create: true,
					filename,
				}).layer
			)
		)
	);

const makeSqliteContext = (label: string): MigrationTestContext => {
	const filename = sqliteFile(label);
	return {
		cleanup: async () => {
			await unlink(filename).catch(() => null);
		},
		run: (program) => runSqliteProgram(filename, program),
	};
};

const inspectSqliteSchema = (sql: Sql) =>
	Effect.gen(function* inspectSqliteSchemaProgram() {
		const tables = yield* sql<{ readonly name: string }>`SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
			ORDER BY name`;
		const indexes = yield* sql<{ readonly name: string }>`SELECT name
			FROM sqlite_master
			WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
			ORDER BY name`;
		return {
			indexes: indexes.map((row) => row.name),
			tables: tables.map((row) => row.name),
		};
	});

defineMigrationConformanceTests({
	inspectSchema: inspectSqliteSchema,
	makeContext: makeSqliteContext,
	name: "sqlite",
});

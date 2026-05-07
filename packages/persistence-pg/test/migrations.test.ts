/* oxlint-disable import/no-relative-parent-imports, jest/require-hook */

import { pgDriver } from "@dsar/persistence-pg";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { Sql } from "../../internals/persistence/src/services/persistence/shared";
import type { MigrationTestContext } from "../../internals/persistence/test/migration-conformance";
import { defineMigrationConformanceTests } from "../../internals/persistence/test/migration-conformance";

const pgUrl = process.env.DSAR_TEST_PG_URL;
const hasPgUrl = typeof pgUrl === "string" && pgUrl.length > 0;

const runPgProgram = <A>(
	url: string,
	program: (sql: Sql) => Effect.Effect<A, unknown>
) =>
	Effect.runPromise(
		Effect.gen(function* runPgProgramEffect() {
			const sql = yield* SqlClient.SqlClient;
			return yield* program(sql);
		}).pipe(Effect.provide(pgDriver({ url }).layer))
	);

const quotePgIdentifier = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`;

const makePgContext = async (label: string): Promise<MigrationTestContext> => {
	if (!hasPgUrl) {
		throw new Error("DSAR_TEST_PG_URL is required for pg migration tests.");
	}

	const schemaName =
		`dsar_mig_${label.replaceAll(/[^a-z0-9_]/gi, "_")}_${crypto.randomUUID().replaceAll("-", "")}`.slice(
			0,
			63
		);
	const quotedSchemaName = quotePgIdentifier(schemaName);
	await runPgProgram(pgUrl, (sql) =>
		sql.unsafe(`CREATE SCHEMA ${quotedSchemaName}`)
	);

	return {
		cleanup: async () => {
			await runPgProgram(pgUrl, (sql) =>
				sql.unsafe(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`)
			);
		},
		run: (program) =>
			runPgProgram(pgUrl, (sql) =>
				sql.withTransaction(
					Effect.gen(function* runInIsolatedSchema() {
						yield* sql.unsafe(`SET search_path TO ${quotedSchemaName}`);
						return yield* program(sql);
					})
				)
			),
	};
};

const inspectPgSchema = (sql: Sql) =>
	Effect.gen(function* inspectPgSchemaProgram() {
		const tables = yield* sql<{
			readonly name: string;
		}>`SELECT tablename AS name
			FROM pg_tables
			WHERE schemaname = current_schema()
			ORDER BY tablename`;
		const indexes = yield* sql<{
			readonly name: string;
		}>`SELECT indexname AS name
			FROM pg_indexes
			WHERE schemaname = current_schema()
			ORDER BY indexname`;
		return {
			indexes: indexes.map((row) => row.name),
			tables: tables.map((row) => row.name),
		};
	});

defineMigrationConformanceTests({
	inspectSchema: inspectPgSchema,
	makeContext: makePgContext,
	name: "pg",
	skip: !hasPgUrl,
});

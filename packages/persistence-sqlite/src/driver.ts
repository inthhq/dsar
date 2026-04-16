import type { PersistenceDriver } from "@dsar/persistence";
import type * as SqliteBunClient from "@effect/sql-sqlite-bun/SqliteClient";
import type * as SqliteNodeClient from "@effect/sql-sqlite-node/SqliteClient";
import type { Duration } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/**
 * Runtime options for constructing the SQLite persistence driver.
 */
export interface SqliteDriverConfig {
	/** SQLite database filename or path. */
	readonly filename: string;
	/** Opens the database in read-only mode when `true`. */
	readonly readonly?: boolean;
	/** Disables write-ahead logging when requested. */
	readonly disableWAL?: boolean;
	/** Extra tracing attributes attached to SQL spans. */
	readonly spanAttributes?: Record<string, unknown>;
	/** Optional mapper for result-column naming. */
	readonly transformResultNames?: (str: string) => string;
	/** Optional mapper for query naming. */
	readonly transformQueryNames?: (str: string) => string;
	/** Creates database file automatically when supported. */
	readonly create?: boolean;
	/** Opens database in read-write mode when supported. */
	readonly readwrite?: boolean;
	/** Statement prepare-cache size for Node SQLite client. */
	readonly prepareCacheSize?: number;
	/** Statement prepare-cache TTL for Node SQLite client. */
	readonly prepareCacheTTL?: Duration.Input;
}

const toBunConfig = (
	config: SqliteDriverConfig
): SqliteBunClient.SqliteClientConfig => ({
	create: config.create,
	disableWAL: config.disableWAL,
	filename: config.filename,
	readonly: config.readonly,
	readwrite: config.readwrite,
	spanAttributes: config.spanAttributes,
	transformQueryNames: config.transformQueryNames,
	transformResultNames: config.transformResultNames,
});

const toNodeConfig = (
	config: SqliteDriverConfig
): SqliteNodeClient.SqliteClientConfig => ({
	disableWAL: config.disableWAL,
	filename: config.filename,
	prepareCacheSize: config.prepareCacheSize,
	prepareCacheTTL: config.prepareCacheTTL,
	readonly: config.readonly,
	spanAttributes: config.spanAttributes,
	transformQueryNames: config.transformQueryNames,
	transformResultNames: config.transformResultNames,
});

/**
 * Creates a persistence driver that resolves Bun or Node SQLite client layers at runtime.
 *
 * @param config - SQLite driver configuration options.
 * @returns Persistence driver wired to Bun or Node SQL implementation.
 */
export const sqliteDriver = (
	config: SqliteDriverConfig
): PersistenceDriver => ({
	kind: "sqlite",
	layer: Layer.unwrap(
		Effect.gen(function* layer() {
			if ("Bun" in globalThis) {
				const SqliteClient = yield* Effect.promise(
					() => import("@effect/sql-sqlite-bun/SqliteClient")
				);
				return SqliteClient.layer(toBunConfig(config));
			}
			const SqliteClient = yield* Effect.promise(
				() => import("@effect/sql-sqlite-node/SqliteClient")
			);
			return SqliteClient.layer(toNodeConfig(config));
		})
	),
});

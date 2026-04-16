import {
	makePersistenceLayer,
	resolvePersistenceService,
} from "@dsar/persistence";
import type {
	Persistence,
	PersistenceMigrationHooks,
	PersistenceService,
	TenantContext,
} from "@dsar/persistence";
import type * as PgClient from "@effect/sql-pg/PgClient";
import type { Layer } from "effect";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { SqlClient } from "effect/unstable/sql/SqlClient";

import { pgDriver } from "./driver";

export { pgDriver } from "./driver";
export type { PgClient };

const DEFAULT_MIGRATION_LOCK_KEY = 1_034_011_509;

const pgMigrationLockHooks = (lockKey: number): PersistenceMigrationHooks => ({
	afterMigrations: (sql) =>
		Effect.gen(function* releaseMigrationLock() {
			yield* sql`SELECT pg_advisory_unlock(${lockKey})`;
		}),
	beforeMigrations: (sql) =>
		Effect.gen(function* acquireMigrationLock() {
			yield* sql`SELECT pg_advisory_lock(${lockKey})`;
		}),
});

const mergeMigrationHooks = (
	lockingHooks: PersistenceMigrationHooks | undefined,
	customHooks: PersistenceMigrationHooks | undefined
): PersistenceMigrationHooks | undefined => {
	if (!lockingHooks && !customHooks) {
		return undefined;
	}

	const releaseLock = (sql: SqlClient) =>
		lockingHooks?.afterMigrations
			? Effect.orDie(lockingHooks.afterMigrations(sql))
			: Effect.void;

	return {
		afterMigrations: (sql: SqlClient) =>
			Effect.ensuring(
				customHooks?.afterMigrations
					? customHooks.afterMigrations(sql)
					: Effect.void,
				releaseLock(sql)
			),
		beforeMigrations: (sql: SqlClient) =>
			Effect.gen(function* beforeMigrations() {
				if (lockingHooks?.beforeMigrations) {
					yield* lockingHooks.beforeMigrations(sql);
				}
				if (customHooks?.beforeMigrations) {
					yield* Effect.onError(customHooks.beforeMigrations(sql), () =>
						releaseLock(sql)
					);
				}
			}),
	};
};

/**
 * Options for constructing the Postgres-backed DSAR persistence layer.
 */
export interface PgPersistenceLayerOptions {
	/** Postgres client configuration passed to the SQL layer. */
	readonly config: PgClient.PgClientConfig;
	/** Optional custom hooks executed before/after migrations. */
	readonly migrationHooks?: PersistenceMigrationHooks;
	/** Advisory lock key used when migration locking is enabled. */
	readonly migrationLockKey?: number;
	/** Disables advisory-lock migration protection when set to `false`. */
	readonly useMigrationLock?: boolean;
}

/**
 * Simpler Postgres bootstrap options for application code that only needs a
 * connection URL and not the lower-level `PgClient` config surface.
 */
export interface PgPersistenceServiceOptions extends Omit<
	PgPersistenceLayerOptions,
	"config"
> {
	/** Postgres connection string used to build the Effect SQL client config. */
	readonly connectionUrl: string;
}

const toPgPersistenceLayerOptions = (
	options: PgPersistenceLayerOptions | PgPersistenceServiceOptions
): PgPersistenceLayerOptions =>
	"connectionUrl" in options
		? {
				...options,
				config: {
					url: Redacted.make(options.connectionUrl),
				},
			}
		: options;

/**
 * Creates a persistence `Layer` backed by Postgres with optional migration locking.
 *
 * @param options - Postgres layer and migration options.
 * @returns Persistence layer requiring tenant context.
 */
export const makePgPersistenceLayer = (
	options: PgPersistenceLayerOptions
): Layer.Layer<Persistence, never, TenantContext> =>
	makePersistenceLayer({
		driver: pgDriver(options.config),
		migrationHooks: mergeMigrationHooks(
			options.useMigrationLock === false
				? undefined
				: pgMigrationLockHooks(
						Number.isInteger(options.migrationLockKey) &&
							(options.migrationLockKey as number) >= 0 &&
							(options.migrationLockKey as number) <= Number.MAX_SAFE_INTEGER
							? (options.migrationLockKey as number)
							: DEFAULT_MIGRATION_LOCK_KEY
					),
			options.migrationHooks
		),
	});

/**
 * Creates and initializes a Postgres-backed {@link PersistenceService} for
 * application bootstrap code that does not want to work with Effect layers
 * directly.
 *
 * @param options - Postgres layer and migration options.
 * @returns Promise resolving to the initialized persistence service.
 */
export const makePgPersistenceService = (
	options: PgPersistenceLayerOptions | PgPersistenceServiceOptions
): Promise<PersistenceService> =>
	resolvePersistenceService(
		makePgPersistenceLayer(toPgPersistenceLayerOptions(options))
	);

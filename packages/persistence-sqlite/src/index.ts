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
import type { Layer } from "effect";

import { sqliteDriver } from "./driver";
import type { SqliteDriverConfig } from "./driver";

export type { SqliteDriverConfig } from "./driver";
export { sqliteDriver } from "./driver";

/**
 * Configuration for the SQLite-backed persistence layer, combining
 * {@link SqliteDriverConfig} connection settings with optional
 * {@link PersistenceMigrationHooks}.
 */
export interface SqlitePersistenceLayerOptions extends SqliteDriverConfig {
	/**
	 * Lifecycle hooks executed immediately before and after schema
	 * migrations. Use to run driver-specific setup (e.g. enabling WAL
	 * pragmas) or post-migration seeding.
	 */
	readonly migrationHooks?: PersistenceMigrationHooks;
}

/**
 * Creates a {@link Persistence} layer backed by SQLite.
 *
 * @param options - SQLite connection and migration-hook settings.
 *   Although {@link SqliteDriverConfig} requires `filename` at the type level,
 *   this factory accepts `options` as optional and falls back to an in-memory
 *   database (`":memory:"`) when `filename` is omitted at runtime.
 * @returns A layer providing {@link Persistence} that requires
 *   {@link TenantContext} at runtime.
 */
export const makeSqlitePersistenceLayer = (
	options?: SqlitePersistenceLayerOptions
): Layer.Layer<Persistence, never, TenantContext> =>
	makePersistenceLayer({
		driver: sqliteDriver({
			create: options?.create,
			disableWAL: options?.disableWAL,
			filename: options?.filename ?? ":memory:",
			prepareCacheSize: options?.prepareCacheSize,
			prepareCacheTTL: options?.prepareCacheTTL,
			readonly: options?.readonly,
			readwrite: options?.readwrite,
			spanAttributes: options?.spanAttributes,
			transformQueryNames: options?.transformQueryNames,
			transformResultNames: options?.transformResultNames,
		}),
		migrationHooks: options?.migrationHooks,
	});

/**
 * Creates and initializes a SQLite-backed {@link PersistenceService} for
 * application bootstrap code that does not want to work with Effect layers
 * directly.
 *
 * @param options - SQLite connection and migration-hook settings.
 * @returns Promise resolving to the initialized persistence service.
 */
export const makeSqlitePersistenceService = (
	options?: SqlitePersistenceLayerOptions
): Promise<PersistenceService> =>
	resolvePersistenceService(makeSqlitePersistenceLayer(options));

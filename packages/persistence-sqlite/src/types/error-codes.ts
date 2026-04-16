import {
	createErrorCodeSchema,
	createErrorRegistry,
	DSAR_ERROR_DOCS_BASE_URL,
	isKnownErrorCode,
} from "@dsar/internals-error-codes";
import type {
	ErrorCatalogEntry,
	ErrorCatalogInputEntry,
} from "@dsar/internals-error-codes";

const PERSISTENCE_SQLITE_CATALOG_ENTRIES = [
	{
		code: "PERSISTENCE_SQLITE_RUNTIME_ERROR",
		docsSlug: "dsar-sql-1500",
		id: "DSAR-SQL-1500",
		namespace: "persistence-sqlite",
		status: 500,
		title: "SQLite persistence runtime failure",
	},
	{
		code: "PERSISTENCE_SQLITE_UNCATALOGED_ERROR",
		docsSlug: "dsar-sql-1599",
		id: "DSAR-SQL-1599",
		namespace: "persistence-sqlite",
		status: 500,
		title: "Uncataloged SQLite persistence error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-SQL-${number}`
>[];

/** Union of permitted persistence-sqlite error code strings derived from the catalog. */
export type PersistenceSqliteErrorCode =
	(typeof PERSISTENCE_SQLITE_CATALOG_ENTRIES)[number]["code"];

/** Union of persistence-sqlite error ID strings (e.g. `"DSAR-SQL-1500"`) derived from the catalog. */
export type PersistenceSqliteErrorId =
	(typeof PERSISTENCE_SQLITE_CATALOG_ENTRIES)[number]["id"];

/** Fully resolved catalog entry pairing a {@link PersistenceSqliteErrorCode} with its {@link PersistenceSqliteErrorId}. */
export type PersistenceSqliteErrorCatalogEntry = ErrorCatalogEntry<
	PersistenceSqliteErrorCode,
	PersistenceSqliteErrorId
>;

const persistenceSqliteRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: PERSISTENCE_SQLITE_CATALOG_ENTRIES,
	fallbackCode: "PERSISTENCE_SQLITE_UNCATALOGED_ERROR",
});

/** Immutable list of every registered {@link PersistenceSqliteErrorCode} produced by {@link createErrorRegistry}. */
export const PERSISTENCE_SQLITE_ERROR_CODES =
	persistenceSqliteRegistry.codes as readonly [
		PersistenceSqliteErrorCode,
		...PersistenceSqliteErrorCode[],
	];

/** Readonly array of catalog entry {@link PersistenceSqliteErrorId} values in catalog order. */
export const PERSISTENCE_SQLITE_ERROR_IDS = Object.freeze(
	PERSISTENCE_SQLITE_CATALOG_ENTRIES.map((entry) => entry.id)
) as readonly PersistenceSqliteErrorId[];

/** Validation schema that accepts any {@link PersistenceSqliteErrorCode}; rejects unknown codes with `"Invalid persistence-sqlite error code."`. */
export const PersistenceSqliteErrorCodeSchema = createErrorCodeSchema(
	PERSISTENCE_SQLITE_ERROR_CODES,
	"Invalid persistence-sqlite error code."
);

const persistenceSqliteCodeSet = new Set(PERSISTENCE_SQLITE_ERROR_CODES);
/**
 * Type guard that returns `true` only for known registered codes, narrowing the
 * type to {@link PersistenceSqliteErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered {@link PersistenceSqliteErrorCode}.
 */
export const isPersistenceSqliteErrorCode = (
	code: string
): code is PersistenceSqliteErrorCode =>
	isKnownErrorCode(persistenceSqliteCodeSet, code);

/**
 * Resolves a code string to its {@link PersistenceSqliteErrorCatalogEntry},
 * falling back to the `PERSISTENCE_SQLITE_UNCATALOGED_ERROR` entry when the
 * code is not found in the catalog.
 *
 * @param code - Error code to look up in the persistence-sqlite catalog.
 * @returns Matching catalog entry, or the fallback entry for unknown codes.
 */
export const resolvePersistenceSqliteErrorCatalogEntry = (
	code: string
): PersistenceSqliteErrorCatalogEntry =>
	persistenceSqliteRegistry.resolve(code);

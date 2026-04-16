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

const PERSISTENCE_PG_CATALOG_ENTRIES = [
	{
		code: "PERSISTENCE_PG_RUNTIME_ERROR",
		docsSlug: "dsar-pg-1500",
		id: "DSAR-PG-1500",
		namespace: "persistence-pg",
		status: 500,
		title: "Postgres persistence runtime failure",
	},
	{
		code: "PERSISTENCE_PG_UNCATALOGED_ERROR",
		docsSlug: "dsar-pg-1599",
		id: "DSAR-PG-1599",
		namespace: "persistence-pg",
		status: 500,
		title: "Uncataloged Postgres persistence error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-PG-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the PostgreSQL persistence
 * driver.
 */
export type PersistencePgErrorCode =
	(typeof PERSISTENCE_PG_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-PG-1500`) for documentation
 * and log correlation.
 */
export type PersistencePgErrorId =
	(typeof PERSISTENCE_PG_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link PersistencePgErrorCode} with
 * its human-readable title, docs URL, and HTTP status.
 */
export type PersistencePgErrorCatalogEntry = ErrorCatalogEntry<
	PersistencePgErrorCode,
	PersistencePgErrorId
>;

const persistencePgRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: PERSISTENCE_PG_CATALOG_ENTRIES,
	fallbackCode: "PERSISTENCE_PG_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered PostgreSQL persistence error codes.
 */
export const PERSISTENCE_PG_ERROR_CODES =
	persistencePgRegistry.codes as readonly [
		PersistencePgErrorCode,
		...PersistencePgErrorCode[],
	];
/**
 * Ordered list of stable PostgreSQL persistence error identifiers for
 * documentation tooling.
 */
export const PERSISTENCE_PG_ERROR_IDS = PERSISTENCE_PG_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly PersistencePgErrorId[];
/**
 * Schema that validates a string as a known {@link PersistencePgErrorCode}.
 */
export const PersistencePgErrorCodeSchema = createErrorCodeSchema(
	PERSISTENCE_PG_ERROR_CODES,
	"Invalid persistence-pg error code."
);

const persistencePgCodeSet = new Set(PERSISTENCE_PG_ERROR_CODES);
/**
 * Type guard that narrows a string to {@link PersistencePgErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered PostgreSQL persistence error
 *   code.
 */
export const isPersistencePgErrorCode = (
	code: string
): code is PersistencePgErrorCode =>
	isKnownErrorCode(persistencePgCodeSet, code);

/**
 * Resolves a code string to its full {@link PersistencePgErrorCatalogEntry},
 * falling back to `PERSISTENCE_PG_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code to look up in the PostgreSQL persistence catalog.
 * @returns The matching catalog entry, or the uncataloged-error fallback entry
 *   when `code` is not recognised.
 */
export const resolvePersistencePgErrorCatalogEntry = (
	code: string
): PersistencePgErrorCatalogEntry => persistencePgRegistry.resolve(code);

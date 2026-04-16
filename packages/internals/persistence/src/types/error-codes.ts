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

const PERSISTENCE_CATALOG_ENTRIES = [
	{
		code: "PERSISTENCE_TENANT_SCOPE_MISSING",
		docsSlug: "dsar-ps-1001",
		id: "DSAR-PS-1001",
		namespace: "persistence",
		status: 500,
		title: "Tenant scope missing for persistence operation",
	},
	{
		code: "PERSISTENCE_ENTITY_NOT_FOUND",
		docsSlug: "dsar-ps-1002",
		id: "DSAR-PS-1002",
		namespace: "persistence",
		status: 404,
		title: "Persistence entity not found",
	},
	{
		code: "PERSISTENCE_OPERATION_UNSUPPORTED",
		docsSlug: "dsar-ps-1003",
		id: "DSAR-PS-1003",
		namespace: "persistence",
		status: 400,
		title: "Persistence operation not supported",
	},
	{
		code: "PERSISTENCE_INVALID_RECORD",
		docsSlug: "dsar-ps-1004",
		id: "DSAR-PS-1004",
		namespace: "persistence",
		status: 400,
		title: "Persisted record violates domain contract",
	},
	{
		code: "PERSISTENCE_RUNTIME_ERROR",
		docsSlug: "dsar-ps-1500",
		id: "DSAR-PS-1500",
		namespace: "persistence",
		status: 500,
		title: "Persistence runtime failure",
	},
	{
		code: "PERSISTENCE_UNCATALOGED_ERROR",
		docsSlug: "dsar-ps-1599",
		id: "DSAR-PS-1599",
		namespace: "persistence",
		status: 500,
		title: "Uncataloged persistence error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-PS-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the persistence layer.
 */
export type PersistenceErrorCode =
	(typeof PERSISTENCE_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-PS-1500`) for documentation
 * and log correlation.
 */
export type PersistenceErrorId =
	(typeof PERSISTENCE_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link PersistenceErrorCode} with its
 * human-readable title, docs URL, and HTTP status.
 */
export type PersistenceErrorCatalogEntry = ErrorCatalogEntry<
	PersistenceErrorCode,
	PersistenceErrorId
>;

const persistenceRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: PERSISTENCE_CATALOG_ENTRIES,
	fallbackCode: "PERSISTENCE_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered persistence error codes.
 */
export const PERSISTENCE_ERROR_CODES = persistenceRegistry.codes as readonly [
	PersistenceErrorCode,
	...PersistenceErrorCode[],
];
/**
 * Ordered list of stable persistence error identifiers for documentation
 * tooling.
 */
export const PERSISTENCE_ERROR_IDS = PERSISTENCE_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly PersistenceErrorId[];
/**
 * Schema that validates a string as a known {@link PersistenceErrorCode}.
 */
export const PersistenceErrorCodeSchema = createErrorCodeSchema(
	PERSISTENCE_ERROR_CODES,
	"Invalid persistence error code."
);

const persistenceCodeSet = new Set(PERSISTENCE_ERROR_CODES);
/**
 * Type guard that narrows a string to {@link PersistenceErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered persistence error code.
 */
export const isPersistenceErrorCode = (
	code: string
): code is PersistenceErrorCode => isKnownErrorCode(persistenceCodeSet, code);

/**
 * Resolves a code string to its full {@link PersistenceErrorCatalogEntry},
 * falling back to `PERSISTENCE_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code to look up in the persistence catalog.
 * @returns The matching catalog entry, or the uncataloged-error fallback entry
 *   when `code` is not recognised.
 */
export const resolvePersistenceErrorCatalogEntry = (
	code: string
): PersistenceErrorCatalogEntry => persistenceRegistry.resolve(code);

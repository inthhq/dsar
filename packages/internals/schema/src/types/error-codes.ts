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

const SCHEMA_CATALOG_ENTRIES = [
	{
		code: "SCHEMA_RUNTIME_ERROR",
		docsSlug: "dsar-sch-1500",
		id: "DSAR-SCH-1500",
		namespace: "schema",
		status: 500,
		title: "Schema runtime failure",
	},
	{
		code: "SCHEMA_UNCATALOGED_ERROR",
		docsSlug: "dsar-sch-1599",
		id: "DSAR-SCH-1599",
		namespace: "schema",
		status: 500,
		title: "Uncataloged schema error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-SCH-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the schema validation layer.
 */
export type SchemaErrorCode = (typeof SCHEMA_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-SCH-1500`) for documentation
 * and log correlation.
 */
export type SchemaErrorId = (typeof SCHEMA_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link SchemaErrorCode} with its
 * human-readable title, docs URL, and HTTP status.
 */
export type SchemaErrorCatalogEntry = ErrorCatalogEntry<
	SchemaErrorCode,
	SchemaErrorId
>;

const schemaRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: SCHEMA_CATALOG_ENTRIES,
	fallbackCode: "SCHEMA_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered schema error codes.
 */
export const SCHEMA_ERROR_CODES = schemaRegistry.codes as readonly [
	SchemaErrorCode,
	...SchemaErrorCode[],
];
/**
 * Ordered list of stable schema error identifiers for documentation tooling.
 */
export const SCHEMA_ERROR_IDS = SCHEMA_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly SchemaErrorId[];
/**
 * Schema that validates a string as a known {@link SchemaErrorCode}.
 */
export const SchemaErrorCodeSchema = createErrorCodeSchema(
	SCHEMA_ERROR_CODES,
	"Invalid schema error code."
);

const schemaCodeSet = new Set(SCHEMA_ERROR_CODES);
/**
 * Type guard that narrows a string to {@link SchemaErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered schema error code.
 */
export const isSchemaErrorCode = (code: string): code is SchemaErrorCode =>
	isKnownErrorCode(schemaCodeSet, code);

/**
 * Resolves a code string to its full {@link SchemaErrorCatalogEntry}, falling
 * back to `SCHEMA_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code to look up in the schema catalog.
 * @returns The matching catalog entry, or the uncataloged-error fallback entry
 *   when `code` is not recognised.
 */
export const resolveSchemaErrorCatalogEntry = (
	code: string
): SchemaErrorCatalogEntry => schemaRegistry.resolve(code);

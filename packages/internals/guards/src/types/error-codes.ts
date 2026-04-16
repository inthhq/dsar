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

const GUARDS_CATALOG_ENTRIES = [
	{
		code: "GUARDS_RUNTIME_ERROR",
		docsSlug: "dsar-grd-1500",
		id: "DSAR-GRD-1500",
		namespace: "guards",
		status: 500,
		title: "Guard parsing failure",
	},
	{
		code: "GUARDS_UNCATALOGED_ERROR",
		docsSlug: "dsar-grd-1599",
		id: "DSAR-GRD-1599",
		namespace: "guards",
		status: 500,
		title: "Uncataloged guards error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-GRD-${number}`
>[];

/**
 * Union of all error `code` values defined in {@link GUARDS_CATALOG_ENTRIES}.
 */
export type GuardsErrorCode = (typeof GUARDS_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of all error `id` values defined in {@link GUARDS_CATALOG_ENTRIES}.
 */
export type GuardsErrorId = (typeof GUARDS_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link GuardsErrorCode} with
 * its diagnostic ID, HTTP status, title, and documentation URL.
 */
export type GuardsErrorCatalogEntry = ErrorCatalogEntry<
	GuardsErrorCode,
	GuardsErrorId
>;

const guardsRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: GUARDS_CATALOG_ENTRIES,
	fallbackCode: "GUARDS_UNCATALOGED_ERROR",
});

/**
 * Readonly tuple of valid {@link GuardsErrorCode} values derived from
 * `guardsRegistry.codes`, providing the canonical set of error-code
 * enums produced by the guards error registry.
 */
export const GUARDS_ERROR_CODES = guardsRegistry.codes as readonly [
	GuardsErrorCode,
	...GuardsErrorCode[],
];
/**
 * Readonly array of error-id strings extracted from
 * {@link GUARDS_CATALOG_ENTRIES}, serving as the authoritative list of
 * catalog-entry identifiers used to map errors to their metadata.
 */
export const GUARDS_ERROR_IDS = GUARDS_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly GuardsErrorId[];
/**
 * Effect schema that validates a string is a known {@link GuardsErrorCode}.
 * Built from {@link GUARDS_ERROR_CODES} and used at API boundaries to
 * reject unrecognised error codes early.
 */
export const GuardsErrorCodeSchema = createErrorCodeSchema(
	GUARDS_ERROR_CODES,
	"Invalid guards error code."
);

const guardsCodeSet = new Set(GUARDS_ERROR_CODES);
/**
 * Type guard that checks whether an arbitrary string is a known
 * {@link GuardsErrorCode} by testing membership in {@link GUARDS_ERROR_CODES}.
 *
 * @param code - Arbitrary string to test.
 * @returns `true` when `code` is a recognised guards error code, narrowing
 *   the type to {@link GuardsErrorCode}; `false` otherwise.
 */
export const isGuardsErrorCode = (code: string): code is GuardsErrorCode =>
	isKnownErrorCode(guardsCodeSet, code);

/**
 * Looks up the {@link GuardsErrorCatalogEntry} for the given error code.
 * When no matching entry exists the function falls back to the
 * `GUARDS_UNCATALOGED_ERROR` catalog entry rather than returning `undefined`.
 *
 * @param code - Error code string to resolve against the guards catalog.
 * @returns The matching catalog entry, or the `GUARDS_UNCATALOGED_ERROR`
 *   fallback entry when `code` is not recognised.
 */
export const resolveGuardsErrorCatalogEntry = (
	code: string
): GuardsErrorCatalogEntry => guardsRegistry.resolve(code);

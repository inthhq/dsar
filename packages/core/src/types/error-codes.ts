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

const CORE_CATALOG_ENTRIES = [
	{
		code: "CORE_RUNTIME_ERROR",
		docsSlug: "dsar-core-1500",
		id: "DSAR-CORE-1500",
		namespace: "core",
		status: 500,
		title: "Core runtime failure",
	},
	{
		code: "CORE_UNCATALOGED_ERROR",
		docsSlug: "dsar-core-1599",
		id: "DSAR-CORE-1599",
		namespace: "core",
		status: 500,
		title: "Uncataloged core error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-CORE-${number}`
>[];

/** Union of machine-readable error code strings emitted by the core runtime. */
export type CoreErrorCode = (typeof CORE_CATALOG_ENTRIES)[number]["code"];
/** Union of stable diagnostic identifiers (e.g. `"DSAR-CORE-1500"`) for core errors. */
export type CoreErrorId = (typeof CORE_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link CoreErrorCode} with its
 * diagnostic ID, HTTP status, title, and documentation URL.
 */
export type CoreErrorCatalogEntry = ErrorCatalogEntry<
	CoreErrorCode,
	CoreErrorId
>;

const coreRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: CORE_CATALOG_ENTRIES,
	fallbackCode: "CORE_UNCATALOGED_ERROR",
});

/** Non-empty tuple of every registered core error code string. */
export const CORE_ERROR_CODES = coreRegistry.codes as readonly [
	CoreErrorCode,
	...CoreErrorCode[],
];
/** Ordered list of stable core error identifiers for documentation tooling. */
export const CORE_ERROR_IDS = Object.freeze(
	CORE_CATALOG_ENTRIES.map((entry) => entry.id)
) as readonly CoreErrorId[];
/** Effect schema that validates a string as a known {@link CoreErrorCode}. */
export const CoreErrorCodeSchema = createErrorCodeSchema(
	CORE_ERROR_CODES,
	"Invalid core error code."
);

const coreCodeSet = new Set(CORE_ERROR_CODES);
/**
 * Type guard that checks whether a string is a known {@link CoreErrorCode}.
 *
 * @param code - Candidate error code string to validate.
 * @returns `true` when `code` is a registered core error code, narrowing
 *   the type to {@link CoreErrorCode}; `false` otherwise.
 */
export const isCoreErrorCode = (code: string): code is CoreErrorCode =>
	isKnownErrorCode(coreCodeSet, code);

/**
 * Resolves a code string to its full catalog entry, falling back to
 * `CORE_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code string to resolve against the core catalog.
 * @returns The matching catalog entry, or the fallback entry when
 *   `code` is not recognised.
 */
export const resolveCoreErrorCatalogEntry = (
	code: string
): CoreErrorCatalogEntry => coreRegistry.resolve(code);

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

const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const CLI_FALLBACK_CODE = "CLI_UNCATALOGED_ERROR";

const CLI_CATALOG_ENTRIES = [
	{
		code: "CLI_RUNTIME_ERROR",
		docsSlug: "dsar-cli-1500",
		id: "DSAR-CLI-1500",
		namespace: "cli",
		status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
		title: "CLI runtime failure",
	},
	{
		code: "CLI_UNCATALOGED_ERROR",
		docsSlug: "dsar-cli-1599",
		id: "DSAR-CLI-1599",
		namespace: "cli",
		status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
		title: "Uncataloged CLI error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-CLI-${number}`
>[];

/**
 * Union of all CLI error `code` string literals defined in
 * `CLI_CATALOG_ENTRIES`.
 */
export type CliErrorCode = (typeof CLI_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of all CLI error `id` values defined in `CLI_CATALOG_ENTRIES`.
 */
export type CliErrorId = (typeof CLI_CATALOG_ENTRIES)[number]["id"];
/**
 * A fully resolved catalog entry pairing a {@link CliErrorCode} with
 * its {@link CliErrorId}, HTTP status, title, and documentation URL.
 */
export type CliErrorCatalogEntry = ErrorCatalogEntry<CliErrorCode, CliErrorId>;

const cliRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: CLI_CATALOG_ENTRIES,
	fallbackCode: CLI_FALLBACK_CODE,
});

/**
 * Readonly tuple of valid {@link CliErrorCode} values derived from
 * `cliRegistry.codes`.
 */
export const CLI_ERROR_CODES = cliRegistry.codes as readonly [
	CliErrorCode,
	...CliErrorCode[],
];
/**
 * Readonly array of error-id strings extracted from
 * `CLI_CATALOG_ENTRIES`.
 */
export const CLI_ERROR_IDS = CLI_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly CliErrorId[];
/**
 * Effect schema that validates a string is a known {@link CliErrorCode}.
 */
export const CliErrorCodeSchema = createErrorCodeSchema(
	CLI_ERROR_CODES,
	"Invalid CLI error code."
);

const cliCodeSet = new Set(CLI_ERROR_CODES);
/**
 * Type guard that checks whether an arbitrary string is a known
 * {@link CliErrorCode} by delegating to `isKnownErrorCode(cliCodeSet, code)`.
 *
 * @param code - Candidate error code string to validate against the
 *   CLI error catalog.
 * @returns `true` when `code` is contained in `cliCodeSet`, narrowing
 *   the type to {@link CliErrorCode}; `false` otherwise.
 */
export const isCliErrorCode = (code: string): code is CliErrorCode =>
	isKnownErrorCode(cliCodeSet, code);

/**
 * Looks up the {@link CliErrorCatalogEntry} for the given error code.
 * Falls back to the configured fallback entry when `code` is not recognised.
 *
 * @param code - Error code string to resolve against the CLI catalog.
 * @returns The matching catalog entry, or the fallback entry when
 *   `code` is not recognised.
 */
export const resolveCliErrorCatalogEntry = (
	code: string
): CliErrorCatalogEntry => cliRegistry.resolve(code);

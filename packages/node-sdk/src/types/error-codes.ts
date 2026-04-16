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

const SDK_CATALOG_ENTRIES = [
	{
		code: "SDK_NETWORK_ERROR",
		docsSlug: "dsar-sdk-1101",
		id: "DSAR-SDK-1101",
		namespace: "node-sdk",
		status: 503,
		title: "SDK network transport failed",
	},
	{
		code: "SDK_TIMEOUT",
		docsSlug: "dsar-sdk-1102",
		id: "DSAR-SDK-1102",
		namespace: "node-sdk",
		status: 504,
		title: "SDK request timed out",
	},
	{
		code: "SDK_HTTP_ERROR",
		docsSlug: "dsar-sdk-1201",
		id: "DSAR-SDK-1201",
		namespace: "node-sdk",
		status: 502,
		title: "SDK received HTTP error response",
	},
	{
		code: "SDK_INVALID_ENVELOPE",
		docsSlug: "dsar-sdk-1301",
		id: "DSAR-SDK-1301",
		namespace: "node-sdk",
		status: 502,
		title: "SDK received invalid API envelope",
	},
	{
		code: "SDK_RETRY_FAILED",
		docsSlug: "dsar-sdk-1500",
		id: "DSAR-SDK-1500",
		namespace: "node-sdk",
		status: 500,
		title: "SDK retries exhausted",
	},
	{
		code: "SDK_UNCATALOGED_ERROR",
		docsSlug: "dsar-sdk-1599",
		id: "DSAR-SDK-1599",
		namespace: "node-sdk",
		status: 500,
		title: "Uncataloged SDK error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-SDK-${number}`
>[];

/**
 * Union of all SDK error `code` string literals defined in
 * `SDK_CATALOG_ENTRIES`. Use to discriminate error types in catch
 * handlers and switch statements.
 */
export type SdkErrorCode = (typeof SDK_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of all SDK error `id` values defined in `SDK_CATALOG_ENTRIES`.
 * Ids are stable, docs-facing identifiers (e.g. `"DSAR-SDK-1101"`)
 * suitable for logging and external error references.
 */
export type SdkErrorId = (typeof SDK_CATALOG_ENTRIES)[number]["id"];
/**
 * A fully resolved catalog entry pairing an {@link SdkErrorCode} with
 * its {@link SdkErrorId}, HTTP status, title, and documentation URL.
 */
export type SdkErrorCatalogEntry = ErrorCatalogEntry<SdkErrorCode, SdkErrorId>;

const sdkRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: SDK_CATALOG_ENTRIES,
	fallbackCode: "SDK_UNCATALOGED_ERROR",
});

/**
 * Readonly tuple of valid {@link SdkErrorCode} values derived from
 * `sdkRegistry.codes`, providing the canonical set of SDK error-code
 * enums.
 */
export const SDK_ERROR_CODES = sdkRegistry.codes as readonly [
	SdkErrorCode,
	...SdkErrorCode[],
];
/**
 * Readonly array of error-id strings extracted from
 * `SDK_CATALOG_ENTRIES`, serving as the authoritative list of
 * catalog-entry identifiers for SDK errors.
 */
export const SDK_ERROR_IDS = SDK_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly SdkErrorId[];
/**
 * Effect schema that validates a string is a known {@link SdkErrorCode}.
 * Built from {@link SDK_ERROR_CODES} and used at API boundaries to
 * reject unrecognised SDK error codes early.
 */
export const SdkErrorCodeSchema = createErrorCodeSchema(
	SDK_ERROR_CODES,
	"Invalid SDK error code."
);

const sdkCodeSet = new Set(SDK_ERROR_CODES);
/**
 * Type guard that checks whether an arbitrary string is a known
 * {@link SdkErrorCode} by testing membership in {@link SDK_ERROR_CODES}.
 *
 * @param code - Arbitrary string to test.
 * @returns `true` when `code` is a recognised SDK error code, narrowing
 *   the type to {@link SdkErrorCode}; `false` otherwise.
 */
export const isSdkErrorCode = (code: string): code is SdkErrorCode =>
	isKnownErrorCode(sdkCodeSet, code);

/**
 * Looks up the {@link SdkErrorCatalogEntry} for the given error code.
 * When no matching entry exists the function falls back to the
 * `SDK_UNCATALOGED_ERROR` catalog entry rather than returning `undefined`.
 *
 * @param code - Error code string to resolve against the SDK catalog.
 * @returns The matching catalog entry, or the `SDK_UNCATALOGED_ERROR`
 *   fallback entry when `code` is not recognised.
 */
export const resolveSdkErrorCatalogEntry = (
	code: string
): SdkErrorCatalogEntry => sdkRegistry.resolve(code);

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

const POLICY_PACKS_CATALOG_ENTRIES = [
	{
		code: "POLICY_PACKS_CHECKSUM_FAILED",
		docsSlug: "dsar-pp-1001",
		id: "DSAR-PP-1001",
		namespace: "policy-packs",
		status: 500,
		title: "Policy pack checksum computation failed",
	},
	{
		code: "POLICY_PACKS_RUNTIME_ERROR",
		docsSlug: "dsar-pp-1500",
		id: "DSAR-PP-1500",
		namespace: "policy-packs",
		status: 500,
		title: "Policy packs runtime failure",
	},
	{
		code: "POLICY_PACKS_UNCATALOGED_ERROR",
		docsSlug: "dsar-pp-1599",
		id: "DSAR-PP-1599",
		namespace: "policy-packs",
		status: 500,
		title: "Uncataloged policy-packs error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-PP-${number}`
>[];

/** Union of all known policy-packs error code strings. */
export type PolicyPacksErrorCode =
	(typeof POLICY_PACKS_CATALOG_ENTRIES)[number]["code"];

/** Union of all known policy-packs diagnostic identifiers (e.g. `DSAR-PP-1500`). */
export type PolicyPacksErrorId =
	(typeof POLICY_PACKS_CATALOG_ENTRIES)[number]["id"];

/**
 * A fully resolved catalog entry for a policy-packs error, including
 * code, diagnostic ID, HTTP status, title, and documentation URL.
 */
export type PolicyPacksErrorCatalogEntry = ErrorCatalogEntry<
	PolicyPacksErrorCode,
	PolicyPacksErrorId
>;

const policyPacksRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: POLICY_PACKS_CATALOG_ENTRIES,
	fallbackCode: "POLICY_PACKS_UNCATALOGED_ERROR",
});

/** Non-empty tuple of every registered policy-packs error code string. */
export const POLICY_PACKS_ERROR_CODES = policyPacksRegistry.codes as readonly [
	PolicyPacksErrorCode,
	...PolicyPacksErrorCode[],
];

/** Readonly list of every registered policy-packs diagnostic identifier. */
export const POLICY_PACKS_ERROR_IDS = POLICY_PACKS_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly PolicyPacksErrorId[];

/** Effect schema that validates a string as a known policy-packs error code. */
export const PolicyPacksErrorCodeSchema = createErrorCodeSchema(
	POLICY_PACKS_ERROR_CODES,
	"Invalid policy-packs error code."
);

const policyPacksCodeSet = new Set(POLICY_PACKS_ERROR_CODES);
/**
 * Type guard that returns `true` only for known registered codes, narrowing the
 * type to {@link PolicyPacksErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered {@link PolicyPacksErrorCode}.
 */
export const isPolicyPacksErrorCode = (
	code: string
): code is PolicyPacksErrorCode => isKnownErrorCode(policyPacksCodeSet, code);

/**
 * Resolves a code string to its {@link PolicyPacksErrorCatalogEntry},
 * falling back to the `POLICY_PACKS_UNCATALOGED_ERROR` entry when the
 * code is not found in the catalog.
 *
 * @param code - Error code to look up in the policy-packs catalog.
 * @returns Matching catalog entry, or the fallback entry for unknown codes.
 */
export const resolvePolicyPacksErrorCatalogEntry = (
	code: string
): PolicyPacksErrorCatalogEntry => policyPacksRegistry.resolve(code);

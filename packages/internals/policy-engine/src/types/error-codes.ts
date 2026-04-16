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

const POLICY_ENGINE_CATALOG_ENTRIES = [
	{
		code: "POLICY_ENGINE_RUNTIME_ERROR",
		docsSlug: "dsar-pe-1500",
		id: "DSAR-PE-1500",
		namespace: "policy-engine",
		status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
		title: "Policy engine runtime failure",
	},
	{
		code: "POLICY_ENGINE_UNCATALOGED_ERROR",
		docsSlug: "dsar-pe-1599",
		id: "DSAR-PE-1599",
		namespace: "policy-engine",
		status: HTTP_STATUS_INTERNAL_SERVER_ERROR,
		title: "Uncataloged policy-engine error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-PE-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the policy engine.
 */
export type PolicyEngineErrorCode =
	(typeof POLICY_ENGINE_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-PE-1500`) for documentation
 * and log correlation.
 */
export type PolicyEngineErrorId =
	(typeof POLICY_ENGINE_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link PolicyEngineErrorCode} with
 * its human-readable title, docs URL, and HTTP status.
 */
export type PolicyEngineErrorCatalogEntry = ErrorCatalogEntry<
	PolicyEngineErrorCode,
	PolicyEngineErrorId
>;

const policyEngineRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: POLICY_ENGINE_CATALOG_ENTRIES,
	fallbackCode: "POLICY_ENGINE_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered policy-engine error codes.
 */
export const POLICY_ENGINE_ERROR_CODES =
	policyEngineRegistry.codes as readonly [
		PolicyEngineErrorCode,
		...PolicyEngineErrorCode[],
	];
/**
 * Ordered list of stable policy-engine error identifiers for documentation
 * tooling.
 */
export const POLICY_ENGINE_ERROR_IDS = POLICY_ENGINE_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly PolicyEngineErrorId[];
/**
 * Schema that validates a string as a known
 * {@link PolicyEngineErrorCode}.
 */
export const PolicyEngineErrorCodeSchema = createErrorCodeSchema(
	POLICY_ENGINE_ERROR_CODES,
	"Invalid policy-engine error code."
);

const policyEngineCodeSet = new Set(POLICY_ENGINE_ERROR_CODES);
/**
 * Checks whether a given error code belongs to the policy-engine set.
 *
 * @param code - The error code string to test against
 *   `policyEngineCodeSet`.
 * @returns `true` if `code` is a known {@link PolicyEngineErrorCode}
 *   (delegates to {@link isKnownErrorCode} with `policyEngineCodeSet`);
 *   `false` otherwise.
 */
export const isPolicyEngineErrorCode = (
	code: string
): code is PolicyEngineErrorCode => isKnownErrorCode(policyEngineCodeSet, code);

/**
 * Resolves a {@link PolicyEngineErrorCatalogEntry} for the given code.
 *
 * @param code - The error code string to look up in the policy-engine
 *   registry.
 * @returns The matching catalog entry when `code` is recognised, or the
 *   `POLICY_ENGINE_UNCATALOGED_ERROR` fallback entry otherwise.
 */
export const resolvePolicyEngineErrorCatalogEntry = (
	code: string
): PolicyEngineErrorCatalogEntry => policyEngineRegistry.resolve(code);

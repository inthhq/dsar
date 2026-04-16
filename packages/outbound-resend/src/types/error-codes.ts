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

const OUTBOUND_RESEND_CATALOG_ENTRIES = [
	{
		code: "OUTBOUND_RESEND_CONFIG_INVALID",
		docsSlug: "dsar-out-1001",
		id: "DSAR-OUT-1001",
		namespace: "outbound-resend",
		status: 400,
		title: "Invalid outbound Resend adapter configuration",
	},
	{
		code: "OUTBOUND_RESEND_RUNTIME_ERROR",
		docsSlug: "dsar-out-1500",
		id: "DSAR-OUT-1500",
		namespace: "outbound-resend",
		status: 500,
		title: "Outbound Resend runtime failure",
	},
	{
		code: "OUTBOUND_RESEND_UNCATALOGED_ERROR",
		docsSlug: "dsar-out-1599",
		id: "DSAR-OUT-1599",
		namespace: "outbound-resend",
		status: 500,
		title: "Uncataloged outbound-resend error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-OUT-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the outbound Resend
 * adapter.
 */
export type OutboundResendErrorCode =
	(typeof OUTBOUND_RESEND_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-OUT-1500`) for documentation
 * and log correlation.
 */
export type OutboundResendErrorId =
	(typeof OUTBOUND_RESEND_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing an {@link OutboundResendErrorCode} with
 * its human-readable title, docs URL, and HTTP status.
 */
export type OutboundResendErrorCatalogEntry = ErrorCatalogEntry<
	OutboundResendErrorCode,
	OutboundResendErrorId
>;

const outboundResendRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: OUTBOUND_RESEND_CATALOG_ENTRIES,
	fallbackCode: "OUTBOUND_RESEND_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered outbound Resend error codes.
 */
export const OUTBOUND_RESEND_ERROR_CODES =
	outboundResendRegistry.codes as readonly [
		OutboundResendErrorCode,
		...OutboundResendErrorCode[],
	];
/**
 * Ordered list of stable outbound Resend error identifiers for documentation
 * tooling.
 */
export const OUTBOUND_RESEND_ERROR_IDS = OUTBOUND_RESEND_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly OutboundResendErrorId[];
/**
 * Schema that validates a string as a known {@link OutboundResendErrorCode}.
 */
export const OutboundResendErrorCodeSchema = createErrorCodeSchema(
	OUTBOUND_RESEND_ERROR_CODES,
	"Invalid outbound-resend error code."
);

const outboundResendCodeSet = new Set(OUTBOUND_RESEND_ERROR_CODES);
/**
 * Type guard that narrows a string to {@link OutboundResendErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered outbound Resend error code.
 */
export const isOutboundResendErrorCode = (
	code: string
): code is OutboundResendErrorCode =>
	isKnownErrorCode(outboundResendCodeSet, code);

/**
 * Resolves a code string to its full {@link OutboundResendErrorCatalogEntry},
 * falling back to `OUTBOUND_RESEND_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code to look up in the outbound Resend catalog.
 * @returns The matching catalog entry, or the uncataloged-error fallback entry
 *   when `code` is not recognised.
 */
export const resolveOutboundResendErrorCatalogEntry = (
	code: string
): OutboundResendErrorCatalogEntry => outboundResendRegistry.resolve(code);

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

const INBOUND_RESEND_CATALOG_ENTRIES = [
	{
		code: "INBOUND_RESEND_CONTENT_FETCH_FAILED",
		docsSlug: "dsar-in-1001",
		id: "DSAR-IN-1001",
		namespace: "inbound-resend",
		status: 502,
		title: "Failed to retrieve inbound email content",
	},
	{
		code: "INBOUND_RESEND_RUNTIME_ERROR",
		docsSlug: "dsar-in-1500",
		id: "DSAR-IN-1500",
		namespace: "inbound-resend",
		status: 500,
		title: "Inbound Resend runtime failure",
	},
	{
		code: "INBOUND_RESEND_UNCATALOGED_ERROR",
		docsSlug: "dsar-in-1599",
		id: "DSAR-IN-1599",
		namespace: "inbound-resend",
		status: 500,
		title: "Uncataloged inbound-resend error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-IN-${number}`
>[];

/** Union of permitted inbound-resend error code strings derived from the catalog. */
export type InboundResendErrorCode =
	(typeof INBOUND_RESEND_CATALOG_ENTRIES)[number]["code"];

/** Union of inbound-resend error ID strings (e.g. `"DSAR-IN-1500"`) derived from the catalog. */
export type InboundResendErrorId =
	(typeof INBOUND_RESEND_CATALOG_ENTRIES)[number]["id"];

/** Fully resolved catalog entry pairing an {@link InboundResendErrorCode} with its {@link InboundResendErrorId}. */
export type InboundResendErrorCatalogEntry = ErrorCatalogEntry<
	InboundResendErrorCode,
	InboundResendErrorId
>;

const inboundResendRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: INBOUND_RESEND_CATALOG_ENTRIES,
	fallbackCode: "INBOUND_RESEND_UNCATALOGED_ERROR",
});

/** Immutable list of every registered {@link InboundResendErrorCode} produced by {@link createErrorRegistry}. */
export const INBOUND_RESEND_ERROR_CODES =
	inboundResendRegistry.codes as readonly [
		InboundResendErrorCode,
		...InboundResendErrorCode[],
	];

/** Readonly array of catalog entry {@link InboundResendErrorId} values in catalog order. */
export const INBOUND_RESEND_ERROR_IDS = INBOUND_RESEND_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly InboundResendErrorId[];

/** Validation schema that accepts any {@link InboundResendErrorCode}; rejects unknown codes with `"Invalid inbound-resend error code."`. */
export const InboundResendErrorCodeSchema = createErrorCodeSchema(
	INBOUND_RESEND_ERROR_CODES,
	"Invalid inbound-resend error code."
);

const inboundResendCodeSet = new Set(INBOUND_RESEND_ERROR_CODES);
/**
 * Type guard that returns `true` only for known registered codes, narrowing the
 * type to {@link InboundResendErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a registered {@link InboundResendErrorCode}.
 */
export const isInboundResendErrorCode = (
	code: string
): code is InboundResendErrorCode =>
	isKnownErrorCode(inboundResendCodeSet, code);

/**
 * Resolves a code string to its {@link InboundResendErrorCatalogEntry},
 * falling back to the `INBOUND_RESEND_UNCATALOGED_ERROR` entry when the
 * code is not found in the catalog.
 *
 * @param code - Error code to look up in the inbound-resend catalog.
 * @returns Matching catalog entry, or the fallback entry for unknown codes.
 */
export const resolveInboundResendErrorCatalogEntry = (
	code: string
): InboundResendErrorCatalogEntry => inboundResendRegistry.resolve(code);

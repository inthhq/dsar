/* oxlint-disable max-statements */
import { asRecord } from "@dsar/guards";

import type {
	ResendAdapterInvocationError,
	ResendErrorCategory,
} from "./types";
import { resolveInboundResendErrorCatalogEntry } from "./types/error-codes";

const RETRIABLE_CATEGORIES = new Set<ResendErrorCategory>([
	"timeout",
	"rate_limit",
	"network",
]);

/** Adapter-specific error wrapper for Resend inbound runtime failures. */
export class ResendInvocationError
	extends Error
	implements ResendAdapterInvocationError
{
	readonly _tag = "AdapterInvocationError";
	readonly adapterKey = "resend";
	readonly capability = "inbound";
	readonly category: ResendErrorCategory;
	readonly retriable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: ResendErrorCategory;
		readonly message: string;
		readonly details?: Readonly<Record<string, unknown>>;
	}) {
		super(input.message);
		this.name = "AdapterInvocationError";
		this.category = input.category;
		this.details = input.details;
		this.retriable = RETRIABLE_CATEGORIES.has(input.category);
	}
}

/**
 * Classifies a Resend runtime message into a cataloged error category.
 *
 * @param message - Raw error message emitted by Resend or transport layers.
 * @returns Normalized Resend error category.
 */
export const classifyResendErrorCategory = (
	message: string
): ResendErrorCategory => {
	const lower = message.toLowerCase();
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "timeout";
	}
	if (
		lower.includes("rate limit") ||
		lower.includes("rate-limit") ||
		lower.includes("429")
	) {
		return "rate_limit";
	}
	if (
		lower.includes("network") ||
		lower.includes("socket") ||
		lower.includes("connection")
	) {
		return "network";
	}
	if (
		lower.includes("unauthorized") ||
		lower.includes("forbidden") ||
		lower.includes("signature")
	) {
		return "auth";
	}
	if (lower.includes("config")) {
		return "config";
	}
	if (
		lower.includes("validation") ||
		lower.includes("invalid") ||
		lower.includes("missing")
	) {
		return "validation";
	}
	return "unknown";
};

/**
 * Normalizes thrown values into the Resend adapter error contract.
 *
 * @param error - Raw error thrown while processing a Resend webhook.
 * @returns A normalized Resend adapter invocation error.
 */
export const normalizeResendError = (
	error: unknown
): ResendAdapterInvocationError => {
	if (error instanceof ResendInvocationError) {
		return error;
	}
	const message =
		error instanceof Error ? error.message : "Resend inbound adapter failed.";
	const category = classifyResendErrorCategory(message);
	const catalogEntry = resolveInboundResendErrorCatalogEntry(
		category === "unknown"
			? "INBOUND_RESEND_UNCATALOGED_ERROR"
			: "INBOUND_RESEND_RUNTIME_ERROR"
	);
	return new ResendInvocationError({
		category,
		details: {
			...asRecord(error),
			docsUrl: catalogEntry.docsUrl,
			errorCode: catalogEntry.code,
			errorId: catalogEntry.id,
			status: catalogEntry.status,
		},
		message,
	});
};

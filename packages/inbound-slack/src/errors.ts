/* oxlint-disable max-statements */
import { asNonEmptyString, asRecord } from "@dsar/guards";

import type { SlackAdapterInvocationError, SlackErrorCategory } from "./types";

const RETRIABLE_CATEGORIES = new Set<SlackErrorCategory>([
	"timeout",
	"rate_limit",
	"network",
]);

/** Adapter-specific error wrapper for Slack inbound runtime failures. */
export class SlackInvocationError
	extends Error
	implements SlackAdapterInvocationError
{
	readonly _tag = "AdapterInvocationError";
	readonly adapterKey = "slack";
	readonly capability = "inbound";
	readonly category: SlackErrorCategory;
	readonly retriable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: SlackErrorCategory;
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
 * Returns the current time as an ISO-8601 timestamp.
 *
 * @returns Current timestamp in ISO-8601 format.
 */
export const nowIso = (): string => new Date().toISOString();

const classifySlackErrorCategory = (lower: string): SlackErrorCategory => {
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "timeout";
	}
	if (lower.includes("rate") || lower.includes("429")) {
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
		lower.includes("signature") ||
		lower.includes("forbidden") ||
		lower.includes("unauthorized")
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
 * Narrows an unknown value into a readonly record when possible.
 *
 * @param value - Unknown value that may be object-like.
 * @returns The value as a readonly record, or `undefined` when not object-like.
 */
export const toRecord = (
	value: unknown
): Readonly<Record<string, unknown>> | undefined => asRecord(value);

const isSlackAdapterInvocationError = (
	value: unknown
): value is SlackAdapterInvocationError => {
	const record = asRecord(value);
	return (
		record?._tag === "AdapterInvocationError" &&
		record.adapterKey === "slack" &&
		record.capability === "inbound" &&
		typeof record.message === "string" &&
		typeof record.retriable === "boolean"
	);
};

/**
 * Normalizes thrown values into the Slack adapter error contract.
 *
 * @param error - Raw error thrown while processing a Slack webhook.
 * @returns A normalized Slack adapter invocation error.
 */
export const normalizeSlackError = (
	error: unknown
): SlackAdapterInvocationError => {
	if (
		error instanceof SlackInvocationError ||
		isSlackAdapterInvocationError(error)
	) {
		return error;
	}
	const message =
		error instanceof Error ? error.message : "Slack inbound adapter failed.";
	const lower = message.toLowerCase();
	return new SlackInvocationError({
		category: classifySlackErrorCategory(lower),
		details: toRecord(error),
		message,
	});
};

/**
 * Requires a value to be a non-empty string or throws a validation error.
 *
 * @param value - Candidate value that should contain a non-empty string.
 * @param message - Validation message used when the value is missing.
 * @returns The validated non-empty string.
 */
export const requireNonEmptyString = (
	value: unknown,
	message: string
): string => {
	const parsed = asNonEmptyString(value);
	if (!parsed) {
		throw new SlackInvocationError({
			category: "validation",
			message,
		});
	}
	return parsed;
};

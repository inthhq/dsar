import { asRecord } from "@dsar/guards";

import { resolveBackendErrorCatalogEntry } from "../../types/error-codes";
import type { BackendErrorCode } from "../../types/error-codes";

/** Normalized error payload returned by backend error mappers. */
export interface MappedError {
	/** HTTP status code returned to the caller. */
	readonly status: number;
	/** Stable backend error code resolved through the error catalog. */
	readonly code: BackendErrorCode;
	/** Human-readable error message safe to return to the caller. */
	readonly message: string;
	/** Optional structured trace details included for diagnostics. */
	readonly trace?: Readonly<Record<string, unknown>>;
}

/**
 * Sanitizes an error into a log-safe record without mutating the original value.
 *
 * @param error - Raw error value emitted by route handlers or adapters.
 * @returns A plain record containing safe diagnostic fields for logging.
 */
export const sanitizeErrorForLog = (
	error: unknown
): Readonly<Record<string, unknown>> => {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}
	const safe: Record<string, unknown> = {
		message: error.message,
		name: error.name,
	};
	if ("code" in error && typeof error.code === "string") {
		safe.code = error.code;
	}
	if (error.stack) {
		safe.stack = error.stack;
	}
	return safe;
};

/**
 * Returns a value when it is a string.
 *
 * @param value - Candidate value to narrow.
 * @returns The string value, or `undefined` when the input is not a string.
 */
export const asString = (value: unknown) =>
	typeof value === "string" ? value : undefined;

/**
 * Returns only the string entries from an unknown array-like value.
 *
 * @param value - Candidate array containing string entries.
 * @returns A readonly array containing only string elements.
 */
export const asStringArray = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];

/**
 * Checks whether an error-like value exposes a specific `_tag`.
 *
 * @param error - Raw error value that may carry an Effect-style `_tag`.
 * @param tag - Expected tag value.
 * @returns Whether the error carries the requested tag.
 */
export const hasErrorTag = (error: unknown, tag: string) => {
	if (error !== null && typeof error === "object" && "_tag" in error) {
		return asString((error as { _tag: unknown })._tag) === tag;
	}
	return asString(asRecord(error)?._tag) === tag;
};

/**
 * Reads a field from an error-like value and coerces it to string.
 *
 * @param error - Raw error value containing the field.
 * @param field - Field name to extract.
 * @param fallback - Fallback string when the field is absent.
 * @returns The extracted field value as a string.
 */
export const asStringField = (
	error: unknown,
	field: string,
	fallback: string
) => {
	const record = asRecord(error);
	if (!record || !(field in record)) {
		return fallback;
	}
	const value = record[field];
	return value === null || value === undefined ? fallback : String(value);
};

/**
 * Resolves the best available message from an unknown error.
 *
 * @param error - Raw error thrown by runtime or adapter code.
 * @param fallback - Fallback message when no message field is present.
 * @returns The resolved error message string.
 */
export const getErrorMessage = (error: unknown, fallback: string) =>
	error instanceof Error
		? error.message
		: asStringField(error, "message", fallback);

/**
 * Reads a named field from an unknown error-like value.
 *
 * @param error - Raw error value containing the field.
 * @param field - Field name to extract.
 * @param fallback - Fallback string when the field is unavailable.
 * @returns The extracted field value as a string.
 */
export const getStringField = (
	error: unknown,
	field: string,
	fallback: string
) => {
	if (error !== null && typeof error === "object" && field in error) {
		const value = (error as Record<string, unknown>)[field];
		return value !== null && value !== undefined ? String(value) : fallback;
	}
	return asStringField(error, field, fallback);
};

/**
 * Reads a nested record field from an existing record.
 *
 * @param record - Source record that may contain the nested value.
 * @param field - Field name expected to contain a record.
 * @returns The nested record, or `undefined` when absent or non-record.
 */
export const asRecordField = (
	record: Readonly<Record<string, unknown>>,
	field: string
): Readonly<Record<string, unknown>> | undefined => {
	const value = record[field];
	return value ? asRecord(value) : undefined;
};

/**
 * Resolves a string error code through the backend error catalog.
 *
 * @param code - Candidate backend error code string.
 * @returns A catalog-backed backend error code.
 */
export const toCatalogCode = (code: string): BackendErrorCode =>
	resolveBackendErrorCatalogEntry(code).code;

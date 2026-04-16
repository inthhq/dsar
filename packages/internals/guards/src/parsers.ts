import { resolveGuardsErrorCatalogEntry } from "./types/error-codes";

const runtimeCatalog = resolveGuardsErrorCatalogEntry("GUARDS_RUNTIME_ERROR");
const docsSuffix = runtimeCatalog.docsUrl
	? ` See ${runtimeCatalog.docsUrl}`
	: "";

/**
 * Checks whether a value is a non-null, non-array record object.
 *
 * @param value - Runtime value to inspect.
 * @typeParam TValue - Value type expected for each record field.
 * @returns `true` when `value` is a plain record-like object.
 */
export const isRecord = <TValue = unknown>(
	value: unknown
): value is Readonly<Record<string, TValue>> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * Safely narrows unknown input into a readonly record.
 *
 * @param value - Runtime value to narrow.
 * @typeParam TValue - Value type expected for each record field.
 * @returns Narrowed record when possible, otherwise `undefined`.
 */
export const asRecord = <TValue = unknown>(
	value: unknown
): Readonly<Record<string, TValue>> | undefined =>
	isRecord<TValue>(value) ? value : undefined;

/**
 * Alias of {@link asRecord} retained for call-site readability.
 *
 * @param value - Runtime value to narrow.
 * @typeParam TValue - Value type expected for each object field.
 * @returns Narrowed record when possible, otherwise `undefined`.
 */
export const asObject = <TValue = unknown>(
	value: unknown
): Readonly<Record<string, TValue>> | undefined => asRecord<TValue>(value);

/**
 * Returns a record for object inputs and an empty object otherwise.
 *
 * @param value - Runtime value to coerce.
 * @typeParam TValue - Value type expected for each record field.
 * @returns Existing record input or an empty object fallback.
 */
export const asRecordOrEmpty = <TValue = unknown>(
	value: unknown
): Readonly<Record<string, TValue>> => asRecord<TValue>(value) ?? {};

/**
 * Returns a non-empty string or `undefined` when the value is invalid.
 *
 * @param value - Runtime value to parse.
 * @returns Parsed non-empty string when available.
 */
export const asNonEmptyString = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

/**
 * Returns a non-empty trimmed string or `undefined` when invalid.
 *
 * @param value - Runtime value to parse.
 * @returns Parsed non-empty trimmed string when available.
 */
export const asTrimmedNonEmptyString = (value: unknown): string | undefined => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return undefined;
};

/**
 * Returns a non-empty array of non-empty strings or `undefined`.
 *
 * @param value - Runtime value to parse.
 * @returns Parsed non-empty string array when available.
 */
export const asNonEmptyStringArray = (
	value: unknown
): readonly string[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const result = value.filter(
		(entry): entry is string => typeof entry === "string" && entry.length > 0
	);
	return result.length > 0 ? result : undefined;
};

/**
 * Normalizes API failure payloads into a single `Error` value.
 *
 * @param input - HTTP status and parsed response body.
 * @returns Error containing either API-provided details or catalog fallback text.
 */
export const toApiError = (input: {
	readonly status: number;
	readonly body: unknown;
}): Error => {
	const body = asRecord(input.body);
	const ok = body?.ok;
	const error = asRecord(body?.error);
	const code = asTrimmedNonEmptyString(error?.code);
	const message = asTrimmedNonEmptyString(error?.message);
	if (ok === false && message) {
		return new Error(`${code ?? "API_ERROR"} (${input.status}): ${message}`);
	}
	return new Error(
		`${runtimeCatalog.code} (${input.status}): API request failed.${docsSuffix}`
	);
};

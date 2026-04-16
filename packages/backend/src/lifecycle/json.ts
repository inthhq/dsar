import { asObject, isRecord } from "@dsar/guards";

/** JSON-compatible value used by lifecycle helpers and audit metadata. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[];

/**
 * Recursively removes `undefined` values from objects and arrays.
 *
 * @param value - Value to normalize into a JSON-compatible shape.
 * @param seen - Internal cycle detection set to prevent infinite recursion.
 * @returns The normalized value with `undefined` entries removed.
 */
export const stripUndefined = (
	value: unknown,
	seen = new WeakSet<object>()
): unknown => {
	if (value === undefined) {
		return undefined;
	}
	if (Array.isArray(value)) {
		if (seen.has(value)) {
			return undefined;
		}
		seen.add(value);
		return value
			.map((entry) => stripUndefined(entry, seen))
			.filter(
				(entry): entry is Exclude<typeof entry, undefined> =>
					entry !== undefined
			);
	}
	if (isRecord(value)) {
		if (seen.has(value)) {
			return undefined;
		}
		seen.add(value);
		const entries = Object.entries(value).flatMap(([key, entry]) => {
			const normalizedEntry = stripUndefined(entry, seen);
			return normalizedEntry === undefined
				? []
				: [[key, normalizedEntry] as const];
		});
		return Object.fromEntries(entries);
	}
	return value;
};

/**
 * Checks whether a value is JSON-serializable after normalization.
 *
 * @param value - Candidate value to validate.
 * @returns Whether the value can be represented as a {@link JsonValue}.
 */
export const isJsonValue = (value: unknown): value is JsonValue => {
	if (value === null) {
		return true;
	}
	if (typeof value === "string" || typeof value === "boolean") {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every((entry) => isJsonValue(entry));
	}
	if (isRecord(value)) {
		return Object.values(value).every((entry) => isJsonValue(entry));
	}
	return false;
};

/**
 * Checks whether a value is a JSON object after removing `undefined` fields.
 *
 * @param value - Candidate value to validate.
 * @returns Whether the value is a JSON object.
 */
export const isJsonObject = (
	value: unknown
): value is Readonly<Record<string, JsonValue>> => {
	const normalized = stripUndefined(value);
	return asObject(normalized) !== undefined && isJsonValue(normalized);
};

/**
 * Converts an unknown value into a JSON-safe value with fallback support.
 *
 * @param value - Candidate value to normalize.
 * @param fallback - Fallback JSON value used when normalization fails.
 * @returns A JSON-compatible value.
 */
export const toJsonValue = (value: unknown, fallback: JsonValue): JsonValue => {
	const normalized = stripUndefined(value);
	return isJsonValue(normalized) ? normalized : fallback;
};

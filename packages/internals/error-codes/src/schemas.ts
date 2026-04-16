import * as Schema from "effect/Schema";

/**
 * Creates an Effect Schema that accepts only the provided error code literals.
 *
 * @typeParam TCodes - Non-empty tuple of string-literal error codes.
 * @param codes - Allowed error code values; at least one is required.
 * @param message - Validation failure message annotated on the schema
 *   (defaults to `"Invalid DSAR error code."`).
 * @returns A `Schema.Literals` instance narrowed to `TCodes`, annotated with
 *   the given `message` for decode failures.
 */
export const createErrorCodeSchema = <
	const TCodes extends readonly [string, ...string[]],
>(
	codes: TCodes,
	message = "Invalid DSAR error code."
) =>
	Schema.Literals(codes).pipe(
		Schema.annotate({
			message,
		})
	);

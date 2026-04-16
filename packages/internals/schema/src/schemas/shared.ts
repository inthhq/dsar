import * as Schema from "effect/Schema";

/**
 * ISO 8601 datetime string with mandatory time and timezone offset.
 *
 *
 * Accepts the subset of ISO 8601 produced by {@link Date.prototype.toISOString}
 * as well as fixed-offset variants (e.g. `+05:30`). Date-only strings and
 * bare local times are intentionally rejected so that every timestamp stored
 * through this schema is unambiguous.
 *
 * @example
 * ```ts
 * // All valid
 * "2024-06-15T09:30:00Z"
 * "2024-06-15T09:30:00.000Z"
 * "2024-06-15T09:30:00+02:00"
 * ```
 */
const isValidIsoDate = Schema.makeFilter(
	(value: string) => !Number.isNaN(new Date(value).getTime()),
	{ expected: "a parseable ISO 8601 datetime" }
);

/** Schema that validates and narrows strings to ISO 8601 datetime format. */
export const IsoTimestampSchema = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/
		),
		isValidIsoDate
	)
);

/**
 * Opaque non-empty string identifier for actors and similar entities.
 *
 *
 * This is intentionally format-agnostic: values may be UUIDs, slugs, or any
 * non-empty string the caller chooses. No structural pattern is enforced
 * beyond requiring at least one character.
 *
 * @example
 * ```ts
 * "integration-service"
 * "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export const IdSchema = Schema.NonEmptyString;

/**
 * Optional free-form key/value map for caller-supplied context
 * attached to requests, events, and responses.
 */
export const MetadataSchema = Schema.optional(
	Schema.Record(Schema.String, Schema.Unknown)
);

/**
 * Principal responsible for a recorded action, combining a stable
 * identifier with a role classification (system, admin, subject, etc.).
 */
export const ActorSchema = Schema.Struct({
	actorId: IdSchema,
	actorType: Schema.Literals([
		"system",
		"admin",
		"subject",
		"agent",
		"webhook",
	]),
});

/** Validated actor record with identifier and role classification. */
export type Actor = Schema.Schema.Type<typeof ActorSchema>;

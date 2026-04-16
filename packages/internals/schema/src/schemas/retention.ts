import * as Schema from "effect/Schema";

/**
 * Record categories subject to data-retention rules, spanning
 * requests, audit events, verification evidence, fulfilment
 * artifacts, delivery logs, and notification logs.
 */
export const RetentionClassSchema = Schema.Literals([
	"request_record",
	"audit_event",
	"verification_evidence",
	"fulfilment_artifact",
	"delivery_log",
	"notification_log",
]);

const NonNegativeInt = Schema.Number.pipe(
	Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
);

/**
 * Schema for a tenant retention policy with non-negative integer day bounds.
 *
 * When `maxDays` is present it must be greater than or equal to `minDays`.
 */
export const RetentionPolicySchema = Schema.Struct({
	class: RetentionClassSchema,
	legalHoldEnabled: Schema.Boolean,
	maxDays: Schema.optional(NonNegativeInt),
	minDays: NonNegativeInt,
	purgeEnabled: Schema.Boolean,
}).pipe(
	Schema.check(
		Schema.makeFilter((policy) =>
			policy.maxDays !== undefined && policy.maxDays < policy.minDays
				? `maxDays (${policy.maxDays}) must be >= minDays (${policy.minDays}).`
				: undefined
		)
	)
);

/** Validated tenant retention policy with day bounds and purge/hold flags. */
export type RetentionPolicy = Schema.Schema.Type<typeof RetentionPolicySchema>;

import * as Schema from "effect/Schema";

import { IsoTimestampSchema } from "./shared";

/**
 * Assurance tier required for identity verification: `"none"`,
 * `"reasonable"`, or `"reasonably_high"` per policy rules.
 */
export const VerificationLevelSchema = Schema.Literals([
	"none",
	"reasonable",
	"reasonably_high",
]);

/**
 * Mechanism used to verify the requestor's identity: re-using an
 * existing auth session, sending an email link, or manual review.
 */
export const VerificationMethodSchema = Schema.Literals([
	"existing_auth",
	"email_link",
	"manual",
]);

/**
 * Outcome state of a verification case: `"pending"` while awaiting
 * evidence, `"approved"` when satisfied, or `"rejected"` on failure.
 */
export const VerificationStatusSchema = Schema.Literals([
	"pending",
	"approved",
	"rejected",
]);

/**
 * Individual identity-verification case tracking the method used,
 * assurance level, clock-pause flag, evidence artifacts, and
 * resolution outcome.
 */
export const VerificationCaseSchema = Schema.Struct({
	evidenceArtifacts: Schema.optional(Schema.Array(Schema.String)),
	id: Schema.String,
	level: Schema.optional(VerificationLevelSchema),
	method: VerificationMethodSchema,
	methodsAllowed: Schema.optional(Schema.Array(VerificationMethodSchema)),
	pauseClock: Schema.Boolean,
	reasonForDoubt: Schema.optional(Schema.String),
	requestedAt: IsoTimestampSchema,
	resolvedAt: Schema.optional(IsoTimestampSchema),
	retentionExpiresAt: Schema.optional(IsoTimestampSchema),
	status: VerificationStatusSchema,
});

/** Assurance tier literal for identity verification. */
export type VerificationLevel = Schema.Schema.Type<
	typeof VerificationLevelSchema
>;

/** Validated identity-verification case record. */
export type VerificationCase = Schema.Schema.Type<
	typeof VerificationCaseSchema
>;

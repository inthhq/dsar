import * as Schema from "effect/Schema";

import { ActorSchema, IsoTimestampSchema } from "./shared";

/**
 * Semver-style version label identifying a policy pack release,
 * used for pinning and audit lineage.
 */
export const PolicyPackVersionSchema = Schema.String.pipe(
	Schema.check(
		Schema.isPattern(
			/^\d+\.\d+\.\d+(?:-[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/
		)
	)
);

/**
 * Privacy jurisdiction codes that map a DSAR to the applicable
 * regulatory framework (EU GDPR, UK GDPR, US federal/state, etc.).
 */
export const JurisdictionCodeSchema = Schema.Literals([
	"uk",
	"eu",
	"us",
	"ca",
	"va",
	"co",
	"other",
]);

/**
 * Event that starts the statutory response-deadline clock:
 * `"receipt"` starts at DSAR receipt; `"verification_complete"`
 * defers until identity verification is resolved.
 */
export const ClockModeSchema = Schema.Literals([
	"receipt",
	"verification_complete",
]);

/**
 * Contiguous time interval on the legal clock, recording whether
 * it counts toward the statutory deadline and the reason for
 * any pause or resumption.
 */
export const ClockSegmentSchema = Schema.Struct({
	actor: Schema.optional(ActorSchema),
	countsTowardDeadline: Schema.Boolean,
	from: IsoTimestampSchema,
	policyVersion: PolicyPackVersionSchema,
	reason: Schema.String,
	to: Schema.optional(IsoTimestampSchema),
});

/**
 * Communication record sent to the requestor about the legal clock
 * (acknowledgement, extension notification, or deadline warning).
 */
export const ClockNoticeSchema = Schema.Struct({
	sentAt: IsoTimestampSchema,
	type: Schema.Literals(["acknowledgement", "extension", "deadline_warning"]),
});

/**
 * Schema for a deadline extension applied to a DSAR request clock.
 *
 * `additionalDays` must be a non-negative integer (whole
 * calendar days). `notifiedAt` records when the requestor was informed.
 */
export const ClockExtensionSchema = Schema.Struct({
	additionalDays: Schema.Number.pipe(
		Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
	),
	notifiedAt: Schema.optional(IsoTimestampSchema),
	reason: Schema.String,
});

/**
 * Aggregate legal-clock state for a DSAR request, combining clock
 * mode, computed due date, time segments, notices, and any approved
 * extension.
 */
export const RequestClockSchema = Schema.Struct({
	clockMode: ClockModeSchema,
	dueAt: IsoTimestampSchema,
	extension: Schema.optional(ClockExtensionSchema),
	notices: Schema.optional(Schema.Array(ClockNoticeSchema)),
	receivedAt: IsoTimestampSchema,
	segments: Schema.Array(ClockSegmentSchema),
});

/** Semver-style version label for a policy pack release. */
export type PolicyPackVersion = Schema.Schema.Type<
	typeof PolicyPackVersionSchema
>;
/** Privacy jurisdiction code literal (e.g. `"eu"`, `"us"`, `"uk"`). */
export type JurisdictionCode = Schema.Schema.Type<
	typeof JurisdictionCodeSchema
>;
/** Clock-start trigger literal (`"receipt"` or `"verification_complete"`). */
export type ClockMode = Schema.Schema.Type<typeof ClockModeSchema>;
/** Validated contiguous time segment on the statutory response clock. */
export type ClockSegment = Schema.Schema.Type<typeof ClockSegmentSchema>;
/** Validated aggregate legal-clock state for a DSAR request. */
export type RequestClock = Schema.Schema.Type<typeof RequestClockSchema>;

import * as Schema from "effect/Schema";

import { IsoTimestampSchema } from "./shared";

/**
 * Lifecycle status of a DSAR appeal, progressing from submission through
 * review to a terminal outcome.
 *
 * Valid transitions: `submitted` → `in_review` → `approved` |
 * `denied` | `closed`.
 */
export const AppealStatusSchema = Schema.Literals([
	"submitted",
	"in_review",
	"approved",
	"denied",
	"closed",
]);

/**
 * Schema for a single appeal filed against a DSAR decision.
 *
 * An appeal is created when a requestor challenges a denial or
 * partial fulfilment. `grounds` and `message` capture the requestor's
 * rationale; `decision`, `decidedAt`, and `explanation` are populated
 * once the controller resolves the appeal.
 */
export const AppealSchema = Schema.Struct({
	/** ISO-8601 timestamp when the appeal record was created. */
	createdAt: IsoTimestampSchema,
	/** ISO-8601 timestamp when the appeal was decided; absent while pending. */
	decidedAt: Schema.optional(IsoTimestampSchema),
	/** Outcome chosen by the controller: approve, deny, or partial grant. */
	decision: Schema.optional(Schema.Literals(["approve", "deny", "partial"])),
	/** ISO-8601 deadline by which the appeal must be resolved. */
	dueAt: Schema.optional(IsoTimestampSchema),
	/** Instructions for escalating to the supervisory authority if denied. */
	escalationInstructions: Schema.optional(Schema.String),
	/** Controller's rationale for the appeal decision. */
	explanation: Schema.optional(Schema.String),
	/** Requestor-supplied grounds for the appeal. */
	grounds: Schema.optional(Schema.String),
	/** Unique identifier for this appeal. */
	id: Schema.String,
	/** Free-text message from the requestor accompanying the appeal. */
	message: Schema.String,
	/** Current lifecycle status of the appeal. */
	status: AppealStatusSchema,
	/** ISO-8601 timestamp when the requestor submitted the appeal. */
	submittedAt: Schema.optional(IsoTimestampSchema),
});

/**
 * Runtime type inferred from {@link AppealSchema}, representing a fully
 * validated appeal record.
 */
export type Appeal = Schema.Schema.Type<typeof AppealSchema>;

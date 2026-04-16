import * as Schema from "effect/Schema";

import { ActorSchema, IsoTimestampSchema } from "./shared";

/**
 * Canonical codes describing why a request changes lifecycle state. Used by
 * state-machine transitions and audit events to standardise reason tracking.
 */
export const LifecycleReasonCodeSchema = Schema.Literals([
	"captured",
	"verification_requested",
	"verification_completed",
	"policy_extension",
	"fulfilled",
	"refused",
	"appeal_updated",
	"closed",
]);

/**
 * Schema for a single request lifecycle transition recording the source and
 * target states (`from`/`to`), the {@link LifecycleReasonCodeSchema | reason
 * code}, an optional actor, approval gate, legal-clock mutation, and a
 * rationale string. Validated at capture and persisted for audit replay.
 */
export const LifecycleTransitionSchema = Schema.Struct({
	actor: Schema.optional(ActorSchema),
	approval: Schema.optional(
		Schema.Struct({
			approvalId: Schema.String,
			required: Schema.Boolean,
		})
	),
	from: Schema.String,
	legalClockMutation: Schema.optional(
		Schema.Struct({
			changed: Schema.Boolean,
			field: Schema.optional(Schema.String),
			from: Schema.optional(Schema.String),
			to: Schema.optional(Schema.String),
		})
	),
	occurredAt: IsoTimestampSchema,
	rationale: Schema.optional(Schema.String),
	reasonCode: LifecycleReasonCodeSchema,
	to: Schema.String,
});

/**
 * Decoded runtime type of a lifecycle state transition, including source/target
 * states, reason code, timestamp, and optional actor and approval metadata.
 */
export type LifecycleTransition = Schema.Schema.Type<
	typeof LifecycleTransitionSchema
>;

import * as Schema from "effect/Schema";

/** Non-negative whole-day grace window accepted by webhook key rotation. */
export const GracePeriodDaysSchema = Schema.Int.check(
	Schema.isGreaterThanOrEqualTo(0)
);

/** Request payload schema for outbound webhook signing-key rotation. */
export const WebhookRotateKeyPayloadSchema = Schema.Struct({
	gracePeriodDays: Schema.optional(GracePeriodDaysSchema),
});

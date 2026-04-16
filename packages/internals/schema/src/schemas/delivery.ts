import * as Schema from "effect/Schema";

import { IsoTimestampSchema } from "./shared";

/** Transport channel used to deliver artifacts to the data subject: portal, email, or secure remote access. */
export const DeliveryChannelSchema = Schema.Literals([
	"portal",
	"email",
	"secure_remote_access",
]);

/** Security tier applied to a delivery: standard (no gating), token (time-limited link), or step-up (identity re-verification). */
export const DeliverySecurityLevelSchema = Schema.Literals([
	"standard",
	"token",
	"step_up",
]);

/** Input for preparing a delivery: requires a requestId, at least one artifactId, channel, and security level; optional address, step-up flag, and token TTL. */
export const DeliveryPrepareSchema = Schema.Struct({
	address: Schema.optional(Schema.String),
	artifactIds: Schema.Array(Schema.String),
	channel: DeliveryChannelSchema,
	requestId: Schema.String,
	securityLevel: DeliverySecurityLevelSchema,
	stepUpRequired: Schema.optional(Schema.Boolean),
	tokenTtlSeconds: Schema.optional(Schema.Number),
});

/** Result of verifying a delivery address, recording the address, owning requestId, outcome flag, and verification timestamp. */
export const DeliveryAddressVerifySchema = Schema.Struct({
	address: Schema.String,
	requestId: Schema.String,
	verified: Schema.Boolean,
	verifiedAt: IsoTimestampSchema,
});

/** Channel used to deliver step-up identity challenges: email, SMS, or authenticator app. */
export const StepUpChannelSchema = Schema.Literals([
	"email",
	"sms",
	"auth_app",
]);

/** Step-up identity challenge issued to the subject over email, SMS, or authenticator app, tied to a requestId. */
export const StepUpChallengeSchema = Schema.Struct({
	challengeId: Schema.String,
	channel: StepUpChannelSchema,
	issuedAt: IsoTimestampSchema,
	requestId: Schema.String,
});

/** Completion record for a step-up challenge, capturing the challengeId, completion timestamp, and success flag. */
export const StepUpCompleteSchema = Schema.Struct({
	challengeId: Schema.String,
	completedAt: IsoTimestampSchema,
	success: Schema.Boolean,
});

/** Token-gated download authorization providing a time-limited access token for a specific artifact. */
export const TokenGatedDownloadSchema = Schema.Struct({
	artifactId: Schema.String,
	expiresAt: IsoTimestampSchema,
	token: Schema.String,
});

/** Immutable delivery lifecycle log entry recording an event (prepare, address_verified, step_up_issued, step_up_completed, download) for a requestId. */
export const DeliveryLogSchema = Schema.Struct({
	event: Schema.Literals([
		"prepare",
		"address_verified",
		"step_up_issued",
		"step_up_completed",
		"download",
	]),
	id: Schema.String,
	occurredAt: IsoTimestampSchema,
	requestId: Schema.String,
});

/** Assembled delivery package binding a set of artifact IDs to a channel and security level for a given request. */
export const DeliveryPackageSchema = Schema.Struct({
	artifactIds: Schema.Array(Schema.String),
	channel: DeliveryChannelSchema,
	requestId: Schema.String,
	securityLevel: DeliverySecurityLevelSchema,
});

/** Type inferred from {@link DeliveryPackageSchema}. */
export type DeliveryPackage = Schema.Schema.Type<typeof DeliveryPackageSchema>;

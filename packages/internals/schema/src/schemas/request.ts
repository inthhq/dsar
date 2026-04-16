import * as Schema from "effect/Schema";

import { RequestClockSchema } from "./policy";
import { ActorSchema, IsoTimestampSchema } from "./shared";

/**
 * DSAR request categories (access, delete, correct, portability, etc.)
 * that drive policy evaluation and fulfilment workflows.
 */
export const RequestTypeSchema = Schema.Literals([
	"access",
	"delete",
	"correct",
	"portability",
	"restriction",
	"objection",
	"other",
]);

/**
 * Lifecycle stages a DSAR request progresses through, from initial
 * `captured` to terminal `fulfilled`, `refused`, or `closed`.
 */
export const RequestStatusSchema = Schema.Literals([
	"captured",
	"verification_pending",
	"in_progress",
	"fulfilled",
	"refused",
	"closed",
]);

/**
 * Channel through which a DSAR was originally received (portal, email,
 * API, CLI, admin-created, etc.).
 */
export const IntakeSourceTypeSchema = Schema.Literals([
	"portal",
	"inbound_email",
	"admin_created",
	"api",
	"sdk",
	"cli",
	"slack",
]);

/**
 * Provenance record describing how and when a DSAR was received,
 * including the channel type and an optional raw context reference.
 */
export const IntakeSourceSchema = Schema.Struct({
	rawContextRef: Schema.optional(Schema.String),
	receivedAt: IsoTimestampSchema,
	type: IntakeSourceTypeSchema,
});

/**
 * Data subject whose personal data is the target of the DSAR,
 * identified by any combination of subject ID, external reference,
 * or email.
 */
export const SubjectSchema = Schema.Struct({
	email: Schema.optional(Schema.String),
	externalRef: Schema.optional(Schema.String),
	subjectId: Schema.optional(Schema.String),
});

/**
 * Role of the person filing the DSAR: the data subject themselves,
 * a representative, or an authorised agent acting on behalf of the subject.
 */
export const RequestorTypeSchema = Schema.Literals([
	"subject",
	"representative",
	"authorised_agent",
]);

/**
 * Person who filed the DSAR, including their role relative to the
 * data subject and optional contact information.
 */
export const RequestorSchema = Schema.Struct({
	email: Schema.optional(Schema.String),
	name: Schema.optional(Schema.String),
	relation: Schema.optional(Schema.String),
	type: RequestorTypeSchema,
});

/**
 * Verification state of proof-of-authority evidence when the requestor
 * is acting on behalf of the data subject.
 */
export const AuthorityStatusSchema = Schema.Literals([
	"not_required",
	"pending",
	"verified",
	"rejected",
]);

/**
 * Proof-of-authority record for representative or agent requestors,
 * linking evidence artifacts and tracking verification outcome.
 */
export const AuthoritySchema = Schema.Struct({
	evidenceArtifacts: Schema.Array(Schema.String),
	status: AuthorityStatusSchema,
	verifiedAt: Schema.optional(IsoTimestampSchema),
});

/**
 * Snapshot of the original DSAR submission text, channel, and optional
 * evidence captured at intake time.
 */
export const CapturedIntakeSchema = Schema.Struct({
	capturedBy: Schema.optional(ActorSchema),
	channel: Schema.String,
	contact: Schema.optional(Schema.String),
	rawText: Schema.String,
	receivedAt: IsoTimestampSchema,
	sourceEvidence: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Top-level DSAR request record combining subject, requestor, intake
 * source, lifecycle status, authority evidence, and legal clock state.
 */
export const RequestSchema = Schema.Struct({
	authority: Schema.optional(AuthoritySchema),
	clock: Schema.optional(RequestClockSchema),
	createdAt: IsoTimestampSchema,
	id: Schema.String,
	intakeSource: IntakeSourceSchema,
	requestor: Schema.optional(RequestorSchema),
	schemaVersion: Schema.optional(Schema.String),
	status: RequestStatusSchema,
	subject: SubjectSchema,
	type: RequestTypeSchema,
	updatedAt: IsoTimestampSchema,
});

/** DSAR request category literal (e.g. `"access"`, `"delete"`). */
export type RequestType = Schema.Schema.Type<typeof RequestTypeSchema>;

/** Lifecycle stage literal for a DSAR request (e.g. `"captured"`, `"fulfilled"`). */
export type RequestStatus = Schema.Schema.Type<typeof RequestStatusSchema>;

/** Channel literal describing how a DSAR was originally received. */
export type IntakeSourceType = Schema.Schema.Type<
	typeof IntakeSourceTypeSchema
>;

/** Validated intake-source provenance record. */
export type IntakeSource = Schema.Schema.Type<typeof IntakeSourceSchema>;

/** Requestor role literal (`"subject"`, `"representative"`, or `"authorised_agent"`). */
export type RequestorType = Schema.Schema.Type<typeof RequestorTypeSchema>;

/** Validated requestor record with role and optional contact details. */
export type Requestor = Schema.Schema.Type<typeof RequestorSchema>;

/** Proof-of-authority verification state literal. */
export type AuthorityStatus = Schema.Schema.Type<typeof AuthorityStatusSchema>;

/** Validated proof-of-authority record linking evidence and status. */
export type Authority = Schema.Schema.Type<typeof AuthoritySchema>;

/** Validated captured-intake snapshot with raw text and channel. */
export type CapturedIntake = Schema.Schema.Type<typeof CapturedIntakeSchema>;

/** Fully validated DSAR request record. */
export type DsarRequest = Schema.Schema.Type<typeof RequestSchema>;

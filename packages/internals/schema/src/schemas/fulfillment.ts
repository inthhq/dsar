import * as Schema from "effect/Schema";

/**
 * Data-category labels classifying each artifact in a fulfilment
 * package (e.g. profile data, audit logs).
 */
export const FulfillmentArtifactTypeSchema = Schema.Literals([
	"profile_data",
	"account_data",
	"support_tickets",
	"audit_logs",
	"other",
]);

/**
 * Individual data artifact included in a DSAR fulfilment package,
 * carrying integrity hash, size, source system, and MIME type.
 */
export const FulfillmentArtifactSchema = Schema.Struct({
	description: Schema.optional(Schema.String),
	id: Schema.String,
	mediaType: Schema.String,
	sha256: Schema.String,
	sizeBytes: Schema.Number,
	sourceSystem: Schema.String,
	title: Schema.String,
	type: FulfillmentArtifactTypeSchema,
});

/**
 * Machine-readable reason codes used when a DSAR is refused
 * (e.g. identity unverifiable, legal exemption, scope too narrow).
 */
export const RefusalReasonCodeSchema = Schema.Literals([
	"cannot_verify",
	"exemption_applies",
	"manifest_invalid",
	"insufficient_scope",
	"other",
]);

/**
 * Manifest listing the artifacts assembled for a fulfilment response,
 * with optional supplementary notes.
 */
export const ArtifactManifestSchema = Schema.Struct({
	artifacts: Schema.Array(FulfillmentArtifactSchema),
	supplementaryInfoInline: Schema.optional(Schema.String),
	supplementaryInfoRef: Schema.optional(Schema.String),
});

/**
 * Complete fulfilment manifest including artifacts, data categories
 * covered, redactions applied, and third-party data exclusions.
 */
export const FulfillmentManifestSchema = Schema.Struct({
	artifacts: Schema.Array(FulfillmentArtifactSchema),
	dataCategories: Schema.Array(Schema.String),
	redactionsApplied: Schema.Array(Schema.String),
	thirdPartyExclusions: Schema.Array(Schema.String),
});

/** Validated artifact record within a fulfilment package. */
export type FulfillmentArtifact = Schema.Schema.Type<
	typeof FulfillmentArtifactSchema
>;
/** Machine-readable refusal reason literal. */
export type RefusalReasonCode = Schema.Schema.Type<
	typeof RefusalReasonCodeSchema
>;
/** Validated artifact manifest with optional supplementary notes. */
export type ArtifactManifest = Schema.Schema.Type<
	typeof ArtifactManifestSchema
>;
/** Validated fulfillment manifest with data categories and redactions. */
export type FulfillmentManifest = Schema.Schema.Type<
	typeof FulfillmentManifestSchema
>;

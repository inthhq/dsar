import {
	ArtifactManifestSchema,
	RetentionClassSchema,
	VerificationLevelSchema,
	VerificationMethodSchema,
} from "@dsar/schema";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export { WebhookRotateKeyPayloadSchema as WebhookRotateKeyBodySchema } from "../webhook-schemas";

const NonEmptyString = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter((s: string) =>
			s.trim().length === 0 ? "must be a non-empty string" : undefined
		)
	)
);

/** POST /requests/:id/extensions */
export const ExtensionBodySchema = Schema.Struct({
	additionalDays: Schema.Number.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(0))
	),
	rationale: NonEmptyString,
});

/** POST /requests/:id/refuse – at least one of rationale/reason/message required */
export const RefusalBodySchema = Schema.Struct({
	message: Schema.optional(Schema.String),
	rationale: Schema.optional(Schema.String),
	reason: Schema.optional(Schema.String),
}).pipe(
	Schema.check(
		Schema.makeFilter(
			(body: {
				readonly rationale?: string;
				readonly reason?: string;
				readonly message?: string;
			}) => {
				const value =
					body.rationale?.trim() || body.reason?.trim() || body.message?.trim();
				return value
					? undefined
					: "At least one of rationale, reason, or message is required.";
			}
		)
	)
);

/** PUT /requests/:id/requestor – accepts arbitrary requestor fields */
export const RequestorUpdateBodySchema = Schema.Record(
	Schema.String,
	Schema.Unknown
);

/** PUT /requests/:id/authority – submit authority evidence */
export const AuthorityEvidenceBodySchema = Schema.Struct({
	evidenceArtifacts: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
});

/** POST /requests/:id/verification/evidence */
export const VerificationEvidenceBodySchema = Schema.Struct({
	evidenceArtifacts: Schema.Array(Schema.Unknown).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	level: VerificationLevelSchema.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed("reasonable" as const))
	),
	methodsAllowed: Schema.Array(VerificationMethodSchema).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(["manual" as const]))
	),
	reasonForDoubt: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(""))
	),
	retentionExpiresAt: Schema.optional(Schema.String),
});

/** POST /requests/:id/delivery/prepare */
export const DeliveryPrepareBodySchema = Schema.Struct({
	channel: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed("portal"))
	),
	securityLevel: Schema.String.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed("standard"))
	),
});

/** POST /requests/:id/delivery/address/verify */
export const DeliveryAddressVerifyBodySchema = Schema.Struct({
	email: Schema.optional(Schema.String),
});

/** POST /requests/:id/delivery/step-up/complete */
export const StepUpCompleteBodySchema = Schema.Struct({
	token: NonEmptyString,
});

/** POST /requests/:id/fulfillment */
export const FulfilmentCallbackBodySchema = Schema.Struct({
	dataCategories: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	manifest: ArtifactManifestSchema,
	redactionsApplied: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
	thirdPartyExclusions: Schema.Array(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed([]))
	),
});

/** POST /requests/:id/manifest/validate */
export const ManifestValidationBodySchema = Schema.Struct({
	action: Schema.Literals(["approved", "rejected"]),
});

/** POST /requests/:id/appeals */
export const AppealSubmitBodySchema = Schema.Struct({
	grounds: Schema.optional(Schema.String),
	message: NonEmptyString,
});

/** POST /requests/:id/appeals/:appealId/decide */
export const AppealDecideBodySchema = Schema.Struct({
	decision: Schema.Literals(["approve", "deny", "partial"]),
	explanation: Schema.optional(Schema.String),
});

/** PUT /tenants/:tenantId/retention */
export const RetentionUpdateBodySchema = Schema.Struct({
	class: RetentionClassSchema,
	id: Schema.optional(Schema.String),
	legalHoldEnabled: Schema.Boolean.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(false))
	),
	maxDays: Schema.Number.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(365))
	),
	minDays: Schema.Number.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(30))
	),
	purgeEnabled: Schema.Boolean.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(false))
	),
}).pipe(
	Schema.check(
		Schema.makeFilter((body) =>
			body.minDays > body.maxDays
				? `minDays (${body.minDays}) must be <= maxDays (${body.maxDays}).`
				: undefined
		)
	)
);

/** POST /policies/upgrades/propose */
export const PolicyUpgradeBodySchema = Schema.Struct({
	fromVersion: NonEmptyString,
	tenantId: NonEmptyString,
	toVersion: NonEmptyString,
	workspaceId: Schema.optional(Schema.String),
});

/** POST /policies/custom/register */
export const PolicyRegistrationBodySchema = Schema.Struct({
	jurisdiction: NonEmptyString,
	metadata: Schema.Struct({
		changelog: NonEmptyString,
		compatibilityNotes: NonEmptyString,
		releaseType: Schema.Literals(["major", "minor", "patch"]),
	}),
	name: NonEmptyString,
	pack: Schema.Record(Schema.String, Schema.Unknown),
	publishedAt: Schema.optional(Schema.String),
	version: NonEmptyString,
});

/** POST /policies/custom/activate */
export const PolicyActivationBodySchema = Schema.Struct({
	jurisdiction: NonEmptyString,
	tenantId: NonEmptyString,
	version: NonEmptyString,
	workspaceId: Schema.optional(Schema.String),
});

/** POST /policies/custom/deactivate */
export const PolicyDeactivationBodySchema = Schema.Struct({
	tenantId: NonEmptyString,
	workspaceId: Schema.optional(Schema.String),
});

/** Decoded body for deadline-extension requests. */
export type ExtensionBody = Schema.Schema.Type<typeof ExtensionBodySchema>;
/** Decoded body for request-refusal submissions. */
export type RefusalBody = Schema.Schema.Type<typeof RefusalBodySchema>;
/** Decoded body for identity-verification evidence uploads. */
export type VerificationEvidenceBody = Schema.Schema.Type<
	typeof VerificationEvidenceBodySchema
>;
/** Decoded body for fulfilment-callback webhooks. */
export type FulfilmentCallbackBody = Schema.Schema.Type<
	typeof FulfilmentCallbackBodySchema
>;
/** Decoded body for manifest-validation requests. */
export type ManifestValidationBody = Schema.Schema.Type<
	typeof ManifestValidationBodySchema
>;
/** Decoded body for appeal-submission requests. */
export type AppealSubmitBody = Schema.Schema.Type<
	typeof AppealSubmitBodySchema
>;
/** Decoded body for appeal-decision requests. */
export type AppealDecideBody = Schema.Schema.Type<
	typeof AppealDecideBodySchema
>;
/** Decoded body for retention-schedule update requests. */
export type RetentionUpdateBody = Schema.Schema.Type<
	typeof RetentionUpdateBodySchema
>;

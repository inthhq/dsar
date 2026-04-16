import * as Schema from "effect/Schema";

/**
 * Whether a clarification request stops the response-deadline clock.
 *
 * `"stop_clock"` pauses the deadline until the requestor responds;
 * `"no_stop_clock"` keeps the clock running.
 */
export const ClarificationEffectSchema = Schema.Literals([
	"stop_clock",
	"no_stop_clock",
]);

/**
 * Whether identity verification stops the response-deadline clock.
 *
 * Same semantics as {@link ClarificationEffectSchema} applied to
 * the verification phase.
 */
export const VerificationEffectSchema = Schema.Literals([
	"stop_clock",
	"no_stop_clock",
]);

/**
 * Event that starts the response-deadline clock.
 *
 * `"receipt"` starts the clock when the DSAR is received;
 * `"verification_complete"` defers the start until identity verification
 * finishes.
 */
export const ClockStartSchema = Schema.Literals([
	"receipt",
	"verification_complete",
]);

/**
 * Array of DSAR request-type literals a clock rule may match against.
 *
 * When present on a rule condition, the rule only applies to
 * requests whose type appears in this list. An empty array matches
 * nothing — omit the field instead to match all request types.
 */
export const RequestTypeConditionSchema = Schema.Array(
	Schema.Literals([
		"access",
		"delete",
		"correct",
		"portability",
		"restriction",
		"objection",
		"other",
	])
);

/**
 * Array of requestor-type literals a clock rule may match against.
 *
 * Determines whether the requestor is the data subject, a
 * representative, or an authorised agent. Omit to match all types.
 */
export const RequestorTypeConditionSchema = Schema.Array(
	Schema.Literals(["subject", "representative", "authorised_agent"])
);

/**
 * Optional condition predicate for a clock rule.
 *
 * All specified fields are AND-ed: the rule fires only when
 * every present condition matches the request context. Omitting all
 * fields makes the rule unconditional.
 */
export const ClockRuleConditionSchema = Schema.Struct({
	hasAuthorityEvidence: Schema.optional(Schema.Boolean),
	isComplex: Schema.optional(Schema.Boolean),
	requestTypes: Schema.optional(RequestTypeConditionSchema),
	requestorTypes: Schema.optional(RequestorTypeConditionSchema),
});

/**
 * Overrides applied to the clock section when a rule matches.
 *
 * Each field is optional; only supplied fields override the
 * section defaults. `responseDeadlineDays` is in calendar days.
 */
export const ClockRuleApplySchema = Schema.Struct({
	ackRequired: Schema.optional(Schema.Boolean),
	clarificationEffect: Schema.optional(ClarificationEffectSchema),
	responseDeadlineDays: Schema.optional(Schema.Number),
	verificationEffect: Schema.optional(VerificationEffectSchema),
});

/**
 * A single conditional override rule within the clock section.
 *
 * Rules are evaluated in ascending `precedence` order; the first
 * match wins and its `apply` block overrides the section defaults.
 * `id` should be unique within the rules array (not enforced by the
 * schema).
 */
export const ClockRuleSchema = Schema.Struct({
	apply: ClockRuleApplySchema,
	explanation: Schema.String,
	id: Schema.String,
	precedence: Schema.Number,
	when: Schema.optional(ClockRuleConditionSchema),
});

/**
 * Response-deadline clock configuration for a policy pack.
 *
 * Defines when the clock starts, the base deadline in calendar
 * days, clock-stop behaviour for clarification and verification phases,
 * extension allowances, and conditional override rules. `rules` are
 * evaluated in `precedence` order; matched overrides replace section
 * defaults. `ackDeadlineBusinessDays`, when present, requires the
 * controller to acknowledge receipt within that window.
 */
export const ClockSectionSchema = Schema.Struct({
	ackDeadlineBusinessDays: Schema.optional(Schema.Number),
	ackRequired: Schema.Boolean,
	clarificationEffect: ClarificationEffectSchema,
	extension: Schema.Struct({
		enabled: Schema.Boolean,
		maxAdditionalDays: Schema.Number,
		requiresJustification: Schema.Boolean,
	}),
	responseDeadlineDays: Schema.Number,
	rules: Schema.Array(ClockRuleSchema),
	start: ClockStartSchema,
	verificationEffect: VerificationEffectSchema,
});

/**
 * Representation and authority-evidence rules for a policy pack.
 *
 * `authorityEvidenceRequiredFor` lists requestor types that must
 * supply proof of authority (e.g. power of attorney). When
 * `enableDeliveryTargeting` is true, responses may be directed to the
 * representative instead of the data subject.
 */
export const RepresentationSectionSchema = Schema.Struct({
	authorityEvidenceRequiredFor: RequestorTypeConditionSchema,
	enableDeliveryTargeting: Schema.Boolean,
});

/**
 * Identity-verification requirements for a policy pack.
 *
 * `requiredWhen` controls when verification is triggered.
 * `allowedMethods` should contain at least one method (not enforced by
 * the schema). When `deleteCollectedDataAfterProcessing` is true,
 * verification artefacts are purged once the request is resolved.
 */
export const VerificationSectionSchema = Schema.Struct({
	allowedMethods: Schema.Array(
		Schema.Literals(["existing_auth", "email_link", "manual"])
	),
	deleteCollectedDataAfterProcessing: Schema.Boolean,
	redactionSupported: Schema.Boolean,
	requiredWhen: Schema.Literals([
		"always",
		"when_authority_missing",
		"high_risk",
		"policy_controlled",
	]),
});

/**
 * Response-format constraints for a policy pack.
 *
 * `allowedMediaTypes` lists acceptable MIME types for the
 * response payload. `requireManifest` mandates an artefact manifest.
 * `requireDownloadableCopyForRemoteAccess` enforces a downloadable
 * copy when delivery is via secure remote access.
 */
export const ResponseSectionSchema = Schema.Struct({
	allowedMediaTypes: Schema.Array(Schema.String),
	preferredFormatCapture: Schema.Boolean,
	requireDownloadableCopyForRemoteAccess: Schema.Boolean,
	requireManifest: Schema.Boolean,
});

/**
 * Response-delivery channel and security configuration.
 *
 * `allowedChannels` should contain at least one channel (not
 * enforced by the schema). `securityLevel` of `"token"` or `"step_up"`
 * requires a token gate; `tokenTtlSeconds` is only meaningful when the
 * level is `"token"` and controls how long the download link remains
 * valid.
 */
export const DeliverySectionSchema = Schema.Struct({
	allowedChannels: Schema.Array(
		Schema.Literals(["portal", "email", "secure_remote_access"])
	),
	securityLevel: Schema.Literals(["standard", "token", "step_up"]),
	stepUpRequired: Schema.Boolean,
	tokenTtlSeconds: Schema.optional(Schema.Number),
});

/**
 * Appeal-process configuration for denied or partially fulfilled requests.
 *
 * When `required` is true, an appeal pathway must be offered.
 * `deadlineDays` and `extensionDays` are in calendar days.
 * `mustBeEasyAsOriginalRequest` and `mustIncludeAGContactIfDenied`
 * encode jurisdiction-specific UX requirements.
 */
export const AppealsSectionSchema = Schema.Struct({
	deadlineDays: Schema.optional(Schema.Number),
	extensionDays: Schema.optional(Schema.Number),
	mustBeEasyAsOriginalRequest: Schema.Boolean,
	mustIncludeAGContactIfDenied: Schema.Boolean,
	required: Schema.Boolean,
});

/**
 * Data-retention floor and purge rules for a policy pack.
 *
 * `minimums` maps each record class to its minimum retention
 * period in calendar days; values should be ≥ 0 (not enforced by the
 * schema). `verificationDeleteAfterProcessing` mirrors the verification
 * section's purge flag and should stay consistent with it.
 */
export const RetentionSectionSchema = Schema.Struct({
	minimums: Schema.Struct({
		audit_event: Schema.Number,
		delivery_log: Schema.Number,
		fulfilment_artifact: Schema.Number,
		notification_log: Schema.Number,
		request_record: Schema.Number,
		verification_evidence: Schema.Number,
	}),
	verificationDeleteAfterProcessing: Schema.Boolean,
});

/**
 * Audit-trail requirements for a policy pack.
 *
 * `requireClockExplainability` mandates that every clock
 * segment records a human-readable reason. `requireRuleTrace` mandates
 * that the matched rule id and precedence are captured in the audit log.
 */
export const AuditSectionSchema = Schema.Struct({
	requireClockExplainability: Schema.Boolean,
	requireRuleTrace: Schema.Boolean,
});

/**
 * Top-level Effect Schema for a complete policy pack document.
 *
 * A policy pack combines all section schemas under `sections`,
 * keyed by jurisdiction and version. `packId` is globally unique;
 * `version` should follow semver and `effectiveAt` should be an
 * ISO-8601 timestamp (neither format is validated by the schema).
 */
export const PolicyPackSchema = Schema.Struct({
	effectiveAt: Schema.String,
	jurisdiction: Schema.String,
	packId: Schema.String,
	sections: Schema.Struct({
		appeals: AppealsSectionSchema,
		audit: AuditSectionSchema,
		clock: ClockSectionSchema,
		delivery: DeliverySectionSchema,
		representation: RepresentationSectionSchema,
		response: ResponseSectionSchema,
		retention: RetentionSectionSchema,
		verification: VerificationSectionSchema,
	}),
	version: Schema.String,
});

/**
 * Runtime type inferred from {@link PolicyPackSchema}, representing a
 * fully validated policy pack with all sections populated.
 */
export type PolicyPack = Schema.Schema.Type<typeof PolicyPackSchema>;

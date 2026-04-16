import * as Schema from "effect/Schema";

/**
 * Stable guidance keys returned when intake hard-gates on policy mapping.
 */
export const PolicyGatingGuidanceKeySchema = Schema.Literals([
	"subject_contact_admin",
	"admin_register_policy_pack",
	"admin_activate_policy_pack",
]);

/**
 * Structured payload used by clients to render jurisdiction-gating guidance.
 */
export const PolicyGatingGuidanceSchema = Schema.Struct({
	guidanceKeys: Schema.Array(PolicyGatingGuidanceKeySchema),
	jurisdiction: Schema.String,
	scope: Schema.Struct({
		tenantId: Schema.String,
		workspaceId: Schema.optional(Schema.String),
	}),
});

/** Validated jurisdiction-gating guidance shown to subjects and admins. */
export type PolicyGatingGuidance = Schema.Schema.Type<
	typeof PolicyGatingGuidanceSchema
>;

import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { protectedOperation, s200, s202 } from "../common";
import { successEnvelope } from "../schemas";

const POLICY_UPGRADE_STATUSES = [
	"pending_approval",
	"approved",
	"applied",
] as const;

const PolicyUpgradeStatusSchema = Schema.Literals(POLICY_UPGRADE_STATUSES);

const CustomPolicyRegisterPayloadSchema = Schema.Struct({
	jurisdiction: Schema.String,
	metadata: Schema.Struct({
		changelog: Schema.String,
		compatibilityNotes: Schema.String,
		releaseType: Schema.Literals(["major", "minor", "patch"]),
	}),
	name: Schema.String,
	pack: Schema.Unknown,
	publishedAt: Schema.optional(Schema.String),
	version: Schema.String,
});

const CustomPolicyActivatePayloadSchema = Schema.Struct({
	jurisdiction: Schema.String,
	tenantId: Schema.String,
	version: Schema.String,
	workspaceId: Schema.optional(Schema.String),
});

const CustomPolicyDeactivatePayloadSchema = Schema.Struct({
	tenantId: Schema.String,
	workspaceId: Schema.optional(Schema.String),
});

/** OpenAPI group describing policy listing and custom policy lifecycle endpoints. */
export const policiesGroup = HttpApiGroup.make("policies", { topLevel: true })
	.add(
		protectedOperation(
			HttpApiEndpoint.get("policies_list", "/policies", {
				success: successEnvelope(
					Schema.Array(
						Schema.Struct({
							jurisdiction: Schema.String,
							name: Schema.String,
							packId: Schema.String,
							publishedAt: Schema.optional(Schema.String),
							version: Schema.String,
						})
					)
				).pipe(s200),
			}),
			"List available policy packs"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_upgrades_propose",
				"/policies/upgrades/propose",
				{
					success: successEnvelope(
						Schema.Struct({
							proposalId: Schema.String,
							status: PolicyUpgradeStatusSchema,
						})
					).pipe(s202),
				}
			),
			"Propose policy upgrade"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_upgrades_approve",
				"/policies/upgrades/:proposalId/approve",
				{
					params: { proposalId: Schema.String },
					success: successEnvelope(
						Schema.Struct({
							proposalId: Schema.String,
							status: PolicyUpgradeStatusSchema,
						})
					).pipe(s202),
				}
			),
			"Approve policy upgrade"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_upgrades_apply",
				"/policies/upgrades/:proposalId/apply",
				{
					params: { proposalId: Schema.String },
					success: successEnvelope(
						Schema.Struct({
							proposalId: Schema.String,
							status: PolicyUpgradeStatusSchema,
						})
					).pipe(s202),
				}
			),
			"Apply policy upgrade"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_custom_register",
				"/policies/custom/register",
				{
					payload: CustomPolicyRegisterPayloadSchema,
					success: successEnvelope(
						Schema.Struct({
							jurisdiction: Schema.String,
							name: Schema.String,
							status: Schema.Literal("registered"),
							version: Schema.String,
						})
					).pipe(s202),
				}
			),
			"Register custom policy pack"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_custom_activate",
				"/policies/custom/activate",
				{
					payload: CustomPolicyActivatePayloadSchema,
					success: successEnvelope(
						Schema.Struct({
							jurisdiction: Schema.String,
							status: Schema.Literal("activated"),
							tenantId: Schema.String,
							version: Schema.String,
							workspaceId: Schema.optional(Schema.String),
						})
					).pipe(s202),
				}
			),
			"Activate custom policy pack for scope"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"policies_custom_deactivate",
				"/policies/custom/deactivate",
				{
					payload: CustomPolicyDeactivatePayloadSchema,
					success: successEnvelope(
						Schema.Struct({
							status: Schema.Literal("deactivated"),
							tenantId: Schema.String,
							workspaceId: Schema.optional(Schema.String),
						})
					).pipe(s202),
				}
			),
			"Deactivate scoped custom policy assignment"
		)
	);

import { describe, expect, it } from "@effect/vitest";

import { routeParityMap } from "#src/parity/route-map";

import {
	BASE_JSON_BODY,
	DEFAULT_IDS,
	getRelevantOutput,
	runE2eCli,
} from "./harness";

interface CommandCase {
	readonly id: string;
	readonly argv: readonly string[];
	readonly expectedExitCode: 0 | 1;
	readonly outputIncludes: readonly string[];
}

const asJson = (input: unknown): string => JSON.stringify(input);

const commonCreateBody = asJson({
	intakeSource: BASE_JSON_BODY.intakeSource,
	jurisdiction: "uk",
});

const policiesRegisterBody = asJson({
	jurisdiction: "uk",
	metadata: BASE_JSON_BODY.metadata,
	pack: BASE_JSON_BODY.pack,
});

const policiesActivateBody = asJson({
	jurisdiction: "uk",
	tenantId: DEFAULT_IDS.tenantId,
});

const policiesDeactivateBody = asJson({
	jurisdiction: "uk",
	tenantId: DEFAULT_IDS.tenantId,
});

const genericBody = asJson(BASE_JSON_BODY);

const commandCases: readonly CommandCase[] = [
	{
		argv: ["init"],
		expectedExitCode: 0,
		id: "init_runtime",
		outputIncludes: ['"initialized":true'],
	},
	{
		argv: ["status"],
		expectedExitCode: 0,
		id: "status_health",
		outputIncludes: ['"service":"@dsar/backend"', '"status":"ok"'],
	},
	{
		argv: ["subjects", "get", DEFAULT_IDS.subjectId],
		expectedExitCode: 0,
		id: "subjects_get_profile",
		outputIncludes: [`"subjectId":"${DEFAULT_IDS.subjectId}"`],
	},
	{
		argv: ["policies", "list"],
		expectedExitCode: 0,
		id: "policies_list",
		outputIncludes: ['"jurisdiction":"uk"', '"ok":true'],
	},
	{
		argv: ["policies", "upgrades", "propose", "--json", genericBody],
		expectedExitCode: 1,
		id: "policies_upgrades_propose",
		outputIncludes: ["fromVersion"],
	},
	{
		argv: [
			"policies",
			"upgrades",
			"approve",
			DEFAULT_IDS.proposalId,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "policies_upgrades_approve",
		outputIncludes: ["POLICY_UPGRADE_PROPOSAL_NOT_FOUND"],
	},
	{
		argv: [
			"policies",
			"upgrades",
			"apply",
			DEFAULT_IDS.proposalId,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "policies_upgrades_apply",
		outputIncludes: ["POLICY_UPGRADE_PROPOSAL_NOT_FOUND"],
	},
	{
		argv: ["policies", "custom", "register", "--json", policiesRegisterBody],
		expectedExitCode: 1,
		id: "policies_custom_register",
		outputIncludes: ["Missing key"],
	},
	{
		argv: ["policies", "custom", "activate", "--json", policiesActivateBody],
		expectedExitCode: 1,
		id: "policies_custom_activate",
		outputIncludes: ["version"],
	},
	{
		argv: [
			"policies",
			"custom",
			"deactivate",
			"--json",
			policiesDeactivateBody,
		],
		expectedExitCode: 1,
		id: "policies_custom_deactivate",
		outputIncludes: ["POLICY_ACTIVATION_NOT_FOUND"],
	},
	{
		argv: ["webhooks", "inbound", "resend", "--json", genericBody],
		expectedExitCode: 1,
		id: "webhooks_inbound_resend",
		outputIncludes: ["Inbound adapter 'resend' is not configured."],
	},
	{
		argv: ["webhooks", "inbound", "slack", "--json", genericBody],
		expectedExitCode: 1,
		id: "webhooks_inbound_slack",
		outputIncludes: ["Inbound adapter 'slack' is not configured."],
	},
	{
		argv: ["requests", "create", "--json", commonCreateBody],
		expectedExitCode: 0,
		id: "requests_create",
		outputIncludes: ['"status":"captured"'],
	},
	{
		argv: ["requests", "list"],
		expectedExitCode: 0,
		id: "requests_list",
		outputIncludes: ['"items":[]', '"total":0'],
	},
	{
		argv: ["requests", "capture", "--json", commonCreateBody],
		expectedExitCode: 0,
		id: "requests_capture",
		outputIncludes: ['"status":"captured"'],
	},
	{
		argv: ["requests", "get", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_get",
		outputIncludes: ["Request req-1 was not found"],
	},
	{
		argv: ["requests", "timeline", DEFAULT_IDS.id],
		expectedExitCode: 0,
		id: "requests_timeline",
		outputIncludes: ['"events":[]'],
	},
	{
		argv: ["requests", "clock", "explain", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_clock_explain",
		outputIncludes: ["Failed to explain request legal clock"],
	},
	{
		argv: ["requests", "clarifications", "request", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_clarifications_request",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: ["requests", "clarifications", "receive", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_clarifications_receive",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: [
			"requests",
			"extensions",
			"create",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_extensions_create",
		outputIncludes: ["rationale"],
	},
	{
		argv: [
			"requests",
			"refusals",
			"create",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_refusals_create",
		outputIncludes: ["rationale"],
	},
	{
		argv: ["requests", "closures", "create", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_closures_create",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: ["requests", "acknowledgements", "create", DEFAULT_IDS.id],
		expectedExitCode: 0,
		id: "requests_acknowledgements_create",
		outputIncludes: ['"status":"acknowledged"'],
	},
	{
		argv: [
			"requests",
			"requestor",
			"set",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_requestor_set",
		outputIncludes: ["Request req-1 was not found"],
	},
	{
		argv: [
			"requests",
			"authority",
			"submit",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_authority_submit",
		outputIncludes: ["Request req-1 was not found"],
	},
	{
		argv: ["requests", "authority", "approve", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_authority_approve",
		outputIncludes: ["Request req-1 was not found"],
	},
	{
		argv: ["requests", "authority", "reject", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_authority_reject",
		outputIncludes: ["Request req-1 was not found"],
	},
	{
		argv: [
			"requests",
			"verification",
			"request",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_verification_request",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: [
			"requests",
			"verification",
			"evidence",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_verification_evidence",
		outputIncludes: ["level"],
	},
	{
		argv: ["requests", "verification", "approve", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_verification_approve",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: ["requests", "verification", "reject", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_verification_reject",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: ["requests", "verification", "case", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_verification_case",
		outputIncludes: ["Failed to read verification case"],
	},
	{
		argv: ["requests", "verification", "evidence-upload", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_verification_evidence_upload",
		outputIncludes: ["Missing required --file for binary upload command."],
	},
	{
		argv: [
			"requests",
			"delivery",
			"prepare",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_delivery_prepare",
		outputIncludes: ["No fulfillment artifact found"],
	},
	{
		argv: [
			"requests",
			"delivery",
			"address-verify",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_delivery_address_verify",
		outputIncludes: ["INTERNAL_RUNTIME_ERROR"],
	},
	{
		argv: [
			"requests",
			"delivery",
			"step-up-challenge",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_delivery_step_up_challenge",
		outputIncludes: ["No fulfillment artifact found"],
	},
	{
		argv: [
			"requests",
			"delivery",
			"step-up-complete",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_delivery_step_up_complete",
		outputIncludes: ["token"],
	},
	{
		argv: [
			"requests",
			"artifacts",
			"download",
			DEFAULT_IDS.id,
			DEFAULT_IDS.artifactId,
			"--delivery-token",
			"tok-1",
		],
		expectedExitCode: 1,
		id: "requests_artifacts_download",
		outputIncludes: ["No fulfillment artifact found"],
	},
	{
		argv: ["requests", "delivery", "logs", DEFAULT_IDS.id],
		expectedExitCode: 0,
		id: "requests_delivery_logs",
		outputIncludes: ['"logs":[]'],
	},
	{
		argv: ["requests", "fulfilment", "create", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_fulfilment",
		outputIncludes: ["Failed to apply lifecycle transition"],
	},
	{
		argv: [
			"requests",
			"fulfilment",
			"callback",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_fulfilment_callback",
		outputIncludes: ["Failed to record fulfilment callback"],
	},
	{
		argv: ["requests", "manifest", "get", DEFAULT_IDS.id],
		expectedExitCode: 0,
		id: "requests_manifest_get",
		outputIncludes: ['"artifacts":[]'],
	},
	{
		argv: ["requests", "manifest", "artifact-upload", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_manifest_artifact_upload",
		outputIncludes: ["Missing required --file for binary upload command."],
	},
	{
		argv: ["requests", "manifest", "artifact-download", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_manifest_artifact_download",
		outputIncludes: [
			"Missing required --key for manifest artifact download command.",
		],
	},
	{
		argv: [
			"requests",
			"manifest",
			"artifact-replace",
			DEFAULT_IDS.id,
			DEFAULT_IDS.artifactId,
		],
		expectedExitCode: 1,
		id: "requests_manifest_artifact_replace",
		outputIncludes: ["Missing required --file for binary upload command."],
	},
	{
		argv: [
			"requests",
			"manifest",
			"validate",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_manifest_validate",
		outputIncludes: ["action"],
	},
	{
		argv: [
			"requests",
			"appeals",
			"create",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 1,
		id: "requests_appeals_create",
		outputIncludes: ["message"],
	},
	{
		argv: ["requests", "appeals", "list", DEFAULT_IDS.id],
		expectedExitCode: 1,
		id: "requests_appeals_list",
		outputIncludes: ["Failed to list appeals"],
	},
	{
		argv: [
			"requests",
			"appeals",
			"decide",
			DEFAULT_IDS.id,
			DEFAULT_IDS.appealId,
			"--decision",
			"approve",
			"--explanation",
			"reviewed",
		],
		expectedExitCode: 1,
		id: "requests_appeals_decide",
		outputIncludes: ["Failed to decide appeal"],
	},
	{
		argv: ["requests", "notifications", "list", DEFAULT_IDS.id],
		expectedExitCode: 0,
		id: "requests_notifications_list",
		outputIncludes: ['"events":[]'],
	},
	{
		argv: ["tenants", "retention", "get", DEFAULT_IDS.tenantId],
		expectedExitCode: 0,
		id: "tenants_retention_get",
		outputIncludes: ['"data":[]'],
	},
	{
		argv: [
			"tenants",
			"retention",
			"put",
			DEFAULT_IDS.tenantId,
			"--json",
			genericBody,
		],
		expectedExitCode: 0,
		id: "tenants_retention_put",
		outputIncludes: [`"tenantId":"${DEFAULT_IDS.tenantId}"`],
	},
	{
		argv: ["requests", "audit", "export", DEFAULT_IDS.id, "--format", "jsonl"],
		expectedExitCode: 0,
		id: "requests_audit_export",
		outputIncludes: ['"events":[]'],
	},
	{
		argv: [
			"requests",
			"audit",
			"verify",
			DEFAULT_IDS.id,
			"--json",
			genericBody,
		],
		expectedExitCode: 0,
		id: "requests_audit_verify",
		outputIncludes: ['"verified":true'],
	},
	{
		argv: ["requests", "notifications", "replay", "req-1", "evt-1"],
		expectedExitCode: 1,
		id: "requests_notifications_replay",
		outputIncludes: ["Failed to replay notification event"],
	},
];

const testedCommandIds = new Set(commandCases.map((entry) => entry.id));

describe("cLI e2e command matrix", () => {
	it.each(commandCases)("$id", async (entry) => {
		const result = await runE2eCli({ argv: entry.argv });
		expect(result.exitCode).toBe(entry.expectedExitCode);
		const target = getRelevantOutput(result, entry.expectedExitCode);
		for (const expected of entry.outputIncludes) {
			expect(target).toContain(expected);
		}
	});

	it("route parity map commands are all represented in matrix", () => {
		for (const route of routeParityMap) {
			expect(testedCommandIds.has(route.id)).toBeTruthy();
		}
	});
});

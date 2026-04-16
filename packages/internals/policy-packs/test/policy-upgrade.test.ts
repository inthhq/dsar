import type { PolicyPack } from "@dsar/policy-engine";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	PolicyAudit,
	PolicyPacksLive,
	PolicyUpgrade,
	createPolicyPackVersionRecord,
	PolicyVersionAlreadyExistsError,
	PolicyVersionNotFoundError,
	pinPolicyVersion,
	publishPolicyPackVersion,
	resolveEffectivePolicyVersion,
	UpgradeApprovalRequiredError,
} from "../src";

const makePack = (
	version: string,
	overrides?: Partial<PolicyPack>
): PolicyPack => ({
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "global",
	packId: "pack-global",
	sections: {
		appeals: {
			deadlineDays: 30,
			extensionDays: 30,
			mustBeEasyAsOriginalRequest: true,
			mustIncludeAGContactIfDenied: true,
			required: true,
		},
		audit: {
			requireClockExplainability: true,
			requireRuleTrace: true,
		},
		clock: {
			ackDeadlineBusinessDays: 3,
			ackRequired: true,
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 60,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
			rules: [],
			start: "receipt",
			verificationEffect: "stop_clock",
		},
		delivery: {
			allowedChannels: ["portal"],
			securityLevel: "token",
			stepUpRequired: true,
			tokenTtlSeconds: 900,
		},
		representation: {
			authorityEvidenceRequiredFor: ["representative"],
			enableDeliveryTargeting: true,
		},
		response: {
			allowedMediaTypes: ["application/json"],
			preferredFormatCapture: true,
			requireDownloadableCopyForRemoteAccess: true,
			requireManifest: true,
		},
		retention: {
			minimums: {
				audit_event: 365,
				delivery_log: 365,
				fulfilment_artifact: 365,
				notification_log: 365,
				request_record: 365,
				verification_evidence: 365,
			},
			verificationDeleteAfterProcessing: true,
		},
		verification: {
			allowedMethods: ["existing_auth"],
			deleteCollectedDataAfterProcessing: true,
			redactionSupported: true,
			requiredWhen: "policy_controlled",
		},
	},
	version,
	...overrides,
});

const releaseTypeForVersion = (
	version: string
): "major" | "minor" | "patch" => {
	if (version.endsWith(".0.0")) {
		return "major";
	}
	if (version.endsWith(".0")) {
		return "minor";
	}
	return "patch";
};

const makeRecord = (version: string, pack: PolicyPack = makePack(version)) =>
	createPolicyPackVersionRecord({
		jurisdiction: "global",
		metadata: {
			changelog: `Release ${version}`,
			compatibilityNotes: `Compatibility reviewed for ${version}`,
			releaseType: releaseTypeForVersion(version),
		},
		name: "global-default",
		pack,
		publishedAt: "2026-01-01T00:00:00.000Z",
		version,
	});

describe("policy upgrade flow", () => {
	it.effect("requires approval before apply and emits audit trail", () =>
		Effect.gen(function* _() {
			yield* publishPolicyPackVersion(
				yield* makeRecord("1.0.0"),
				"policy-admin"
			);
			yield* publishPolicyPackVersion(
				yield* makeRecord(
					"1.1.0",
					makePack("1.1.0", {
						sections: {
							...makePack("1.1.0").sections,
							clock: {
								...makePack("1.1.0").sections.clock,
								verificationEffect: "no_stop_clock",
							},
						},
					})
				).pipe(
					Effect.map((record) => ({
						...record,
						publishedAt: "2026-01-03T00:00:00.000Z",
					}))
				),
				"policy-admin"
			);

			const upgrade = yield* Effect.service(PolicyUpgrade);
			const proposal = yield* upgrade.propose({
				actor: "ops-user",
				fromVersion: "1.0.0",
				now: "2026-01-04T00:00:00.000Z",
				proposalId: "proposal-1",
				scope: { tenantId: "tenant-1", workspaceId: "workspace-1" },
				toVersion: "1.1.0",
			});

			const applyWithoutApproval = yield* Effect.result(
				upgrade.apply({
					actor: "ops-user",
					now: "2026-01-05T00:00:00.000Z",
					proposalId: proposal.id,
				})
			);

			yield* upgrade.approve({
				approverId: "admin-1",
				approverRole: "admin",
				now: "2026-01-05T00:00:00.000Z",
				proposalId: proposal.id,
			});
			const applied = yield* upgrade.apply({
				actor: "ops-user",
				now: "2026-01-06T00:00:00.000Z",
				proposalId: proposal.id,
			});

			const audit = yield* Effect.service(PolicyAudit);
			const events = yield* audit.list();

			expect(proposal.diff.clockBehaviorSummary.length).toBeGreaterThan(0);
			expect(applyWithoutApproval._tag).toBe("Failure");
			expect(
				(applyWithoutApproval as { readonly failure: unknown }).failure
			).toBeInstanceOf(UpgradeApprovalRequiredError);
			expect(applied.status).toBe("applied");
			expect(events.map((event) => event.type)).toContain(
				"policy_upgrade_applied"
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("resolves workspace pin over tenant pin", () =>
		Effect.gen(function* _() {
			yield* pinPolicyVersion({
				pinnedAt: "2026-01-07T00:00:00.000Z",
				pinnedBy: "admin-2",
				policyVersion: "1.0.0",
				tenantId: "tenant-2",
			});
			yield* pinPolicyVersion({
				pinnedAt: "2026-01-07T00:01:00.000Z",
				pinnedBy: "admin-2",
				policyVersion: "1.1.0",
				tenantId: "tenant-2",
				workspaceId: "workspace-2",
			});

			const tenantVersion = yield* resolveEffectivePolicyVersion({
				tenantId: "tenant-2",
			});
			const workspaceVersion = yield* resolveEffectivePolicyVersion({
				tenantId: "tenant-2",
				workspaceId: "workspace-2",
			});
			expect(tenantVersion).toBe("1.0.0");
			expect(workspaceVersion).toBe("1.1.0");
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("fails proposing when source version is missing", () =>
		Effect.gen(function* _() {
			const upgrade = yield* Effect.service(PolicyUpgrade);
			const result = yield* Effect.result(
				upgrade.propose({
					actor: "ops-user",
					fromVersion: "0.0.1",
					now: "2026-01-08T00:00:00.000Z",
					proposalId: "proposal-missing",
					scope: { tenantId: "tenant-3" },
					toVersion: "1.0.0",
				})
			);
			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				PolicyVersionNotFoundError
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("allows only one concurrent publish per version", () =>
		Effect.gen(function* _() {
			const versionRecord = yield* makeRecord("2.0.0");
			const [first, second] = yield* Effect.all(
				[
					Effect.result(
						publishPolicyPackVersion(versionRecord, "policy-admin-a")
					),
					Effect.result(
						publishPolicyPackVersion(versionRecord, "policy-admin-b")
					),
				],
				{ concurrency: 2 }
			);
			const outcomes = [first, second];
			const successes = outcomes.filter(
				(outcome) => outcome._tag === "Success"
			);
			const failures = outcomes.filter((outcome) => outcome._tag === "Failure");

			expect(successes).toHaveLength(1);
			expect(failures).toHaveLength(1);
			expect(
				(failures[0] as { readonly failure: unknown }).failure
			).toBeInstanceOf(PolicyVersionAlreadyExistsError);
		}).pipe(Effect.provide(PolicyPacksLive))
	);
});

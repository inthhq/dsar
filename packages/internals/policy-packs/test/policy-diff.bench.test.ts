import type { PolicyPack } from "@dsar/policy-engine";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";

import {
	createPolicyPackVersionRecord,
	PolicyPackDiff,
	PolicyPacksLive,
	PolicyUpgrade,
	publishPolicyPackVersion,
} from "../src";

const runPerfBenches = process.env.PERF === "1";

const PACK_COUNT = 100;
const WARMUP_ITERATIONS = 5;
const SAMPLE_ITERATIONS = 40;
const DIFF_P95_BOUND_MS = 50;
const UPGRADE_BOUND_MS = 1000;
const NOW_MS = Date.parse("2026-03-01T00:00:00.000Z");

const percentile = (samples: readonly number[], p: number): number => {
	const ordered = [...samples].toSorted((left, right) => left - right);
	if (ordered.length === 0) {
		return Number.POSITIVE_INFINITY;
	}
	const index = Math.min(
		ordered.length - 1,
		Math.max(0, Math.ceil(p * ordered.length) - 1)
	);
	return ordered[index] ?? Number.POSITIVE_INFINITY;
};

const makePack = (
	version: string,
	responseDeadlineDays: number
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
			responseDeadlineDays,
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
});

const versionAt = (index: number): string => `1.0.${index}`;

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

describe.skipIf(!runPerfBenches)("policy pack diff and upgrade bench", () => {
	it.effect(
		`diff p95 across ${PACK_COUNT} packs stays under ${DIFF_P95_BOUND_MS}ms and one upgrade stays under ${UPGRADE_BOUND_MS}ms`,
		() =>
			Effect.gen(function* policyDiffBench() {
				yield* TestClock.setTime(NOW_MS);
				const now = yield* Clock.currentTimeMillis.pipe(
					Effect.map((ms) => new Date(ms).toISOString())
				);
				const packs: PolicyPack[] = [];

				for (const index of Array.from(
					{ length: PACK_COUNT },
					(_, packIndex) => packIndex
				)) {
					const version = versionAt(index);
					const pack = makePack(version, 30 + (index % 15));
					packs.push(pack);
					const record = yield* createPolicyPackVersionRecord({
						jurisdiction: "global",
						metadata: {
							changelog: `Bench release ${version}`,
							compatibilityNotes: `Compatibility reviewed for ${version}`,
							releaseType: releaseTypeForVersion(version),
						},
						name: "global-default",
						pack,
						publishedAt: now,
						version,
					});
					yield* publishPolicyPackVersion(record, "bench-admin");
				}

				expect(packs).toHaveLength(PACK_COUNT);

				const diffService = yield* Effect.service(PolicyPackDiff);
				const samples: number[] = [];
				for (const iteration of Array.from(
					{ length: WARMUP_ITERATIONS + SAMPLE_ITERATIONS },
					(_, index) => index
				)) {
					const fromIndex = iteration % (PACK_COUNT - 1);
					const fromPack = packs[fromIndex];
					const toPack = packs[fromIndex + 1];
					expect(fromPack).toBeDefined();
					expect(toPack).toBeDefined();
					if (!fromPack || !toPack) {
						return;
					}
					const started = performance.now();
					const diff = yield* diffService.diff(fromPack, toPack);
					const elapsed = performance.now() - started;
					if (iteration >= WARMUP_ITERATIONS) {
						samples.push(elapsed);
					}
					expect(diff.items.length).toBeGreaterThan(0);
				}

				const upgrade = yield* Effect.service(PolicyUpgrade);
				const upgradeStarted = performance.now();
				const proposal = yield* upgrade.propose({
					actor: "ops-user",
					fromVersion: versionAt(0),
					now,
					proposalId: "proposal-bench-1",
					scope: { tenantId: "tenant-bench", workspaceId: "workspace-bench" },
					toVersion: versionAt(PACK_COUNT - 1),
				});
				yield* upgrade.approve({
					approverId: "admin-1",
					approverRole: "admin",
					now,
					proposalId: proposal.id,
				});
				const applied = yield* upgrade.apply({
					actor: "ops-user",
					now,
					proposalId: proposal.id,
				});
				const upgradeMs = performance.now() - upgradeStarted;

				expect(percentile(samples, 0.95)).toBeLessThan(DIFF_P95_BOUND_MS);
				expect(upgradeMs).toBeLessThan(UPGRADE_BOUND_MS);
				expect(applied.status).toBe("applied");
			}).pipe(Effect.provide(PolicyPacksLive)),
		30_000
	);
});

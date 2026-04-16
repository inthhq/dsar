import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { evaluatePolicy } from "../src";
import { readFixture } from "./test-helpers";

describe("policy evaluator golden outputs", () => {
	it.effect("matches california no-stop verification golden output", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("us-no-stop-verification.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result).toMatchObject({
				clock: {
					baseDueAt: "2026-04-15T00:00:00.000Z",
					extensionDaysApplied: 0,
					finalDueAt: "2026-04-15T00:00:00.000Z",
					pauseDaysApplied: 0,
				},
				decision: {
					appealEligible: true,
					authorityEvidenceRequired: true,
					verificationRequired: true,
				},
				matchedRuleIds: [],
				requiredActions: [
					"collect_authority_evidence",
					"run_identity_verification",
					"collect_artifact_manifest",
				],
				requiredNotices: [
					{
						dueAt: "2026-03-13T00:00:00.000Z",
						type: "acknowledgement_required",
					},
				],
			});

			expect(
				result.explainabilityTrace.map((trace) => trace.code)
			).toStrictEqual(["clock.base", "clock.final"]);
		})
	);

	it.effect("matches precedence fixture golden output", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("edge-partial-refusal-precedence.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result).toMatchObject({
				clock: {
					baseDueAt: "2026-06-21T00:00:00.000Z",
					finalDueAt: "2026-06-21T00:00:00.000Z",
				},
				matchedRuleIds: ["high.precedence.override", "low.precedence.override"],
				requiredActions: ["collect_artifact_manifest"],
				requiredNotices: [
					{
						dueAt: "2026-06-15T00:00:00.000Z",
						type: "acknowledgement_required",
					},
				],
			});

			expect(
				result.explainabilityTrace.map((trace) => trace.code)
			).toStrictEqual([
				"clock.base",
				"clock.rule.applied",
				"clock.rule.applied",
				"clock.final",
			]);
		})
	);
});

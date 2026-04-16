import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { evaluatePolicy } from "../src";
import { readFixture } from "./test-helpers";

describe("policy pack matrix", () => {
	it.effect("applies UK baseline one-month deadline", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("policy-packs/uk-deadline-baseline.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.clock.baseDueAt).toBe("2026-07-31T00:00:00.000Z");
			expect(result.clock.finalDueAt).toBe("2026-07-31T00:00:00.000Z");
			expect(result.clock.extensionDaysApplied).toBe(0);
		})
	);

	it.effect("applies EU clarification pauses but not verification pauses", () =>
		Effect.gen(function* _() {
			const fixture = readFixture(
				"policy-packs/eu-clarification-vs-verification.json"
			);
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.clock.pauseDaysApplied).toBe(3);
			expect(result.clock.finalDueAt).toBe("2026-09-03T00:00:00.000Z");
		})
	);

	it.effect("caps US extension days at policy max", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("policy-packs/us-extension-cap.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.clock.baseDueAt).toBe("2026-10-16T00:00:00.000Z");
			expect(result.clock.extensionDaysApplied).toBe(45);
			expect(result.clock.finalDueAt).toBe("2026-11-30T00:00:00.000Z");
		})
	);

	it.effect("triggers high-risk verification semantics for Colorado", () =>
		Effect.gen(function* _() {
			const fixture = readFixture(
				"policy-packs/us-co-high-risk-verification.json"
			);
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.decision.verificationRequired).toBeTruthy();
			expect(result.requiredActions).toContain("run_identity_verification");
		})
	);

	it.effect("keeps refusal and appeals eligibility on Virginia baseline", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("policy-packs/us-va-refusal-appeal.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.decision.refusalEligible).toBeTruthy();
			expect(result.decision.appealEligible).toBeTruthy();
		})
	);
});

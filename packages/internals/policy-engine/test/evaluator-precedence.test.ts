import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { evaluatePolicy } from "../src";
import { readFixture } from "./test-helpers";

describe("policy evaluator precedence", () => {
	it.effect("applies highest precedence clock override deterministically", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("edge-partial-refusal-precedence.json");
			const result = yield* evaluatePolicy(fixture.input);

			expect(result.matchedRuleIds).toStrictEqual([
				"high.precedence.override",
				"low.precedence.override",
			]);
			expect(result.clock.baseDueAt).toBe("2026-06-21T00:00:00.000Z");
			expect(result.clock.finalDueAt).toBe("2026-06-21T00:00:00.000Z");
		})
	);
});

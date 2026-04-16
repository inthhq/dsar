import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { evaluatePolicy } from "../src";
import { readFixture } from "./test-helpers";

describe("explainability stability", () => {
	it.effect("keeps explain trace stable across patch policy versions", () =>
		Effect.gen(function* _() {
			const fixture = readFixture("policy-packs/uk-deadline-baseline.json");
			const v1 = fixture.input;
			const v1_0_1 = {
				...fixture.input,
				policyPack: {
					...fixture.input.policyPack,
					version: "1.0.1",
				},
				policyVersion: "1.0.1",
			};

			const first = yield* evaluatePolicy(v1);
			const second = yield* evaluatePolicy(v1_0_1);

			expect(first.explainabilityTrace).toStrictEqual(
				second.explainabilityTrace
			);
			expect(first.matchedRuleIds).toStrictEqual(second.matchedRuleIds);
			expect(first.requiredActions).toStrictEqual(second.requiredActions);
		})
	);
});

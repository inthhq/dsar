import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { evaluatePolicy } from "../src";
import { readFixture } from "./test-helpers";

const fixtureNames = [
	"uk-access.json",
	"eu-clarification-pause.json",
	"us-no-stop-verification.json",
	"edge-repeated-clarifications.json",
	"edge-extension-near-deadline.json",
	"edge-partial-refusal-precedence.json",
];

describe("policy evaluator determinism", () => {
	for (const fixtureName of fixtureNames) {
		it.effect(`produces stable output for ${fixtureName}`, () =>
			Effect.gen(function* _() {
				const fixture = readFixture(fixtureName);

				const first = yield* evaluatePolicy(fixture.input);
				const second = yield* evaluatePolicy(fixture.input);

				expect(JSON.stringify(first)).toBe(JSON.stringify(second));
			})
		);
	}
});

import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { PolicyPackSchema } from "../src";
import { readFixture } from "./test-helpers";

const launchFixtureNames = [
	"policy-packs/uk-deadline-baseline.json",
	"policy-packs/eu-clarification-vs-verification.json",
	"policy-packs/us-extension-cap.json",
	"policy-packs/us-co-high-risk-verification.json",
	"policy-packs/us-va-refusal-appeal.json",
];

describe("launch policy pack fixtures", () => {
	it.each(launchFixtureNames)("validates schema for %s", (fixtureName) => {
		const fixture = readFixture(fixtureName);
		const parsed = Schema.decodeUnknownExit(PolicyPackSchema)(
			fixture.input.policyPack
		);

		expect(Exit.isSuccess(parsed)).toBeTruthy();
	});
});

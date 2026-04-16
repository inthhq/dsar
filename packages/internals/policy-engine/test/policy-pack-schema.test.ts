import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { PolicyPackSchema } from "../src";

describe("policy pack schema", () => {
	it("rejects malformed policy packs", () => {
		const parsed = Schema.decodeUnknownExit(PolicyPackSchema)({
			jurisdiction: "uk",
			packId: "broken-pack",
			version: "1.0.0",
		});

		expect(parsed._tag).toBe("Failure");
	});
});

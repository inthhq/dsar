import { describe, expect, it } from "@effect/vitest";

import { resolvePromptSelectionValue } from "#src/interactive/wizard";

describe("resolvePromptSelectionValue cli", () => {
	it("accepts direct string values", () => {
		expect(resolvePromptSelectionValue("requests_get")).toBe("requests_get");
	});

	it("accepts wrapped choice values", () => {
		expect(
			resolvePromptSelectionValue({
				value: "requests_get",
			})
		).toBe("requests_get");
	});
});

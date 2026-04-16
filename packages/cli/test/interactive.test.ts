import { describe, expect, it } from "@effect/vitest";

import { getWizardForm } from "#src/interactive/forms";

describe("wizard forms", () => {
	it("maps requests create fields into expected flags", () => {
		const form = getWizardForm("requests_create", "POST");
		expect(form).toBeDefined();
		const flags = form?.toFlagMap({
			channel: "email",
			contact: "alice@example.com",
			rawContextRef: "ctx-1",
			rawText: "Please provide all records",
		});
		expect(flags).toStrictEqual({
			channel: "email",
			contact: "alice@example.com",
			"raw-context-ref": "ctx-1",
			"raw-text": "Please provide all records",
		});
	});

	it("provides generic json form for body routes", () => {
		const form = getWizardForm("requests_manifest_validate", "POST");
		expect(form).toBeDefined();
		const flags = form?.toFlagMap({
			jsonBody: '{"artifacts":[]}',
		});
		expect(flags).toStrictEqual({
			json: '{"artifacts":[]}',
		});
	});
});

import { describe, expect, it } from "@effect/vitest";

import {
	POLICY_ENGINE_ERROR_CODES,
	POLICY_ENGINE_ERROR_IDS,
	resolvePolicyEngineErrorCatalogEntry,
} from "../src/types/error-codes";

describe("policy-engine error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(POLICY_ENGINE_ERROR_CODES).size).toBe(
			POLICY_ENGINE_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(POLICY_ENGINE_ERROR_IDS).size).toBe(
			POLICY_ENGINE_ERROR_IDS.length
		);
	});

	it("resolver fallback returns POLICY_ENGINE_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolvePolicyEngineErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("POLICY_ENGINE_UNCATALOGED_ERROR");
	});
});

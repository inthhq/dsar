import { describe, expect, it } from "@effect/vitest";

import {
	POLICY_PACKS_ERROR_CODES,
	POLICY_PACKS_ERROR_IDS,
	resolvePolicyPacksErrorCatalogEntry,
} from "../src/types/error-codes";

describe("policy-packs error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(POLICY_PACKS_ERROR_CODES).size).toBe(
			POLICY_PACKS_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(POLICY_PACKS_ERROR_IDS).size).toBe(
			POLICY_PACKS_ERROR_IDS.length
		);
	});

	it("resolver fallback returns POLICY_PACKS_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolvePolicyPacksErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("POLICY_PACKS_UNCATALOGED_ERROR");
	});

	it("includes DSAR-PP-1599 uncataloged catalog entry", () => {
		expect(POLICY_PACKS_ERROR_IDS).toContain("DSAR-PP-1599");
		const entry = resolvePolicyPacksErrorCatalogEntry(
			"POLICY_PACKS_UNCATALOGED_ERROR"
		);
		expect(entry.docsUrl).toContain("/dsar-pp-1599");
	});
});

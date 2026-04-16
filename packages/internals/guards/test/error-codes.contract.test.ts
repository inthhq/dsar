import { describe, expect, it } from "@effect/vitest";

import {
	GUARDS_ERROR_CODES,
	GUARDS_ERROR_IDS,
	resolveGuardsErrorCatalogEntry,
} from "#src/types/error-codes";

describe("guards error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(GUARDS_ERROR_CODES).size).toBe(GUARDS_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(GUARDS_ERROR_IDS).size).toBe(GUARDS_ERROR_IDS.length);
	});

	it("resolver fallback returns GUARDS_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveGuardsErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("GUARDS_UNCATALOGED_ERROR");
	});
});

import { describe, expect, it } from "@effect/vitest";

import {
	CORE_ERROR_CODES,
	CORE_ERROR_IDS,
	resolveCoreErrorCatalogEntry,
} from "#src/types/error-codes";

describe("core error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(CORE_ERROR_CODES).size).toBe(CORE_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(CORE_ERROR_IDS).size).toBe(CORE_ERROR_IDS.length);
	});

	it("resolver fallback returns CORE_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveCoreErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("CORE_UNCATALOGED_ERROR");
	});
});

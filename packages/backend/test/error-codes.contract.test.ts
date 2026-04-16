import { describe, expect, it } from "@effect/vitest";

import {
	BACKEND_ERROR_CODES,
	BACKEND_ERROR_IDS,
	resolveBackendErrorCatalogEntry,
} from "../src/types/error-codes";

describe("backend error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(BACKEND_ERROR_CODES).size).toBe(BACKEND_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(BACKEND_ERROR_IDS).size).toBe(BACKEND_ERROR_IDS.length);
	});

	it("resolver fallback returns INTERNAL_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveBackendErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("INTERNAL_UNCATALOGED_ERROR");
	});
});

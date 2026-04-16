import { describe, expect, it } from "@effect/vitest";

import {
	SDK_ERROR_CODES,
	SDK_ERROR_IDS,
	resolveSdkErrorCatalogEntry,
} from "#src/types/error-codes";

describe("node-sdk error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(SDK_ERROR_CODES).size).toBe(SDK_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(SDK_ERROR_IDS).size).toBe(SDK_ERROR_IDS.length);
	});

	it("resolver fallback returns SDK_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveSdkErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("SDK_UNCATALOGED_ERROR");
	});
});

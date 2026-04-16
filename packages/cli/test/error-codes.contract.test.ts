import { describe, expect, it } from "@effect/vitest";

import {
	CLI_ERROR_CODES,
	CLI_ERROR_IDS,
	resolveCliErrorCatalogEntry,
} from "#src/types/error-codes";

describe("cli error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(CLI_ERROR_CODES).size).toBe(CLI_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(CLI_ERROR_IDS).size).toBe(CLI_ERROR_IDS.length);
	});

	it("resolver fallback returns CLI_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveCliErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("CLI_UNCATALOGED_ERROR");
	});
});

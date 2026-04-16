import {
	resolveSchemaErrorCatalogEntry,
	SCHEMA_ERROR_CODES,
	SCHEMA_ERROR_IDS,
} from "@dsar/schema";
import { describe, expect, it } from "@effect/vitest";

describe("schema error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(SCHEMA_ERROR_CODES).size).toBe(SCHEMA_ERROR_CODES.length);
	});

	it("ids are unique", () => {
		expect(new Set(SCHEMA_ERROR_IDS).size).toBe(SCHEMA_ERROR_IDS.length);
	});

	it("resolver fallback returns SCHEMA_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveSchemaErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("SCHEMA_UNCATALOGED_ERROR");
	});
});

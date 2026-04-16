import { describe, expect, it } from "@effect/vitest";

import {
	PERSISTENCE_ERROR_CODES,
	PERSISTENCE_ERROR_IDS,
	resolvePersistenceErrorCatalogEntry,
} from "../src/types/error-codes";

describe("persistence error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(PERSISTENCE_ERROR_CODES).size).toBe(
			PERSISTENCE_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(PERSISTENCE_ERROR_IDS).size).toBe(
			PERSISTENCE_ERROR_IDS.length
		);
	});

	it("resolver fallback returns PERSISTENCE_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolvePersistenceErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("PERSISTENCE_UNCATALOGED_ERROR");
	});
});

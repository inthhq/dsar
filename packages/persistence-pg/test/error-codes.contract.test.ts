import { describe, expect, it } from "@effect/vitest";

import {
	PERSISTENCE_PG_ERROR_CODES,
	PERSISTENCE_PG_ERROR_IDS,
	resolvePersistencePgErrorCatalogEntry,
} from "#src/types/error-codes";

describe("persistence-pg error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(PERSISTENCE_PG_ERROR_CODES).size).toBe(
			PERSISTENCE_PG_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(PERSISTENCE_PG_ERROR_IDS).size).toBe(
			PERSISTENCE_PG_ERROR_IDS.length
		);
	});

	it("resolver fallback returns PERSISTENCE_PG_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolvePersistencePgErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("PERSISTENCE_PG_UNCATALOGED_ERROR");
	});
});

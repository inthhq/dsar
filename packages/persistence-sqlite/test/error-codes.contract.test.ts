import { describe, expect, it } from "@effect/vitest";

import {
	PERSISTENCE_SQLITE_ERROR_CODES,
	PERSISTENCE_SQLITE_ERROR_IDS,
	resolvePersistenceSqliteErrorCatalogEntry,
} from "#src/types/error-codes";

describe("persistence-sqlite error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(PERSISTENCE_SQLITE_ERROR_CODES).size).toBe(
			PERSISTENCE_SQLITE_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(PERSISTENCE_SQLITE_ERROR_IDS).size).toBe(
			PERSISTENCE_SQLITE_ERROR_IDS.length
		);
	});

	it("resolver fallback returns PERSISTENCE_SQLITE_UNCATALOGED_ERROR for unknown code", () => {
		const entry =
			resolvePersistenceSqliteErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("PERSISTENCE_SQLITE_UNCATALOGED_ERROR");
	});
});

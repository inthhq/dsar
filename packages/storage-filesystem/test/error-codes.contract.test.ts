import { describe, expect, it } from "@effect/vitest";

import {
	resolveStorageFilesystemErrorCatalogEntry,
	STORAGE_FILESYSTEM_ERROR_CODES,
	STORAGE_FILESYSTEM_ERROR_IDS,
} from "#src/types/error-codes";

describe("storage-filesystem error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(STORAGE_FILESYSTEM_ERROR_CODES).size).toBe(
			STORAGE_FILESYSTEM_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(STORAGE_FILESYSTEM_ERROR_IDS).size).toBe(
			STORAGE_FILESYSTEM_ERROR_IDS.length
		);
	});

	it("resolver fallback returns STORAGE_FILESYSTEM_UNCATALOGED_ERROR for unknown code", () => {
		const entry =
			resolveStorageFilesystemErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("STORAGE_FILESYSTEM_UNCATALOGED_ERROR");
	});
});

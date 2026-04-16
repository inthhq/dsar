import { describe, expect, it } from "@effect/vitest";

import {
	resolveStorageVercelBlobErrorCatalogEntry,
	STORAGE_VERCEL_BLOB_ERROR_CODES,
	STORAGE_VERCEL_BLOB_ERROR_IDS,
} from "#src/types/error-codes";

describe("storage-vercel-blob error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(STORAGE_VERCEL_BLOB_ERROR_CODES).size).toBe(
			STORAGE_VERCEL_BLOB_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(STORAGE_VERCEL_BLOB_ERROR_IDS).size).toBe(
			STORAGE_VERCEL_BLOB_ERROR_IDS.length
		);
	});

	it("resolver fallback returns STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR for unknown code", () => {
		const entry =
			resolveStorageVercelBlobErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR");
	});
});

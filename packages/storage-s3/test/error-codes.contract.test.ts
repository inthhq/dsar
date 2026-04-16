import { describe, expect, it } from "@effect/vitest";

import {
	resolveStorageS3ErrorCatalogEntry,
	STORAGE_S3_ERROR_CODES,
	STORAGE_S3_ERROR_IDS,
} from "#src/types/error-codes";

describe("storage-s3 error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(STORAGE_S3_ERROR_CODES).size).toBe(
			STORAGE_S3_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(STORAGE_S3_ERROR_IDS).size).toBe(
			STORAGE_S3_ERROR_IDS.length
		);
	});

	it("resolver fallback returns STORAGE_S3_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveStorageS3ErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("STORAGE_S3_UNCATALOGED_ERROR");
	});
});

import { describe, expect, it } from "@effect/vitest";

import { buildFilesystemArtifactKey, mapFilesystemStatToMetadata } from "#src";

describe("storage-filesystem mappers", () => {
	it("builds deterministic artifact keys with fallback behavior", () => {
		const key = buildFilesystemArtifactKey(
			{
				artifactId: "artifact-1",
				category: "identity_data",
				manifestId: "manifest-1",
				requestId: "request-1",
			},
			"artifacts"
		);
		expect(key).toBe(
			"artifacts/request-1/manifest-1/identity_data/raw/full/artifact-1.bin"
		);
	});

	it("maps file stat output into normalized metadata", () => {
		const metadata = mapFilesystemStatToMetadata({
			key: "artifacts/request-1/file.pdf",
			reference: {
				key: "artifacts/request-1/file.pdf",
				manifestHash: "hash-1",
				manifestId: "manifest-1",
				manifestSignature: "sig-1",
				requestId: "request-1",
			},
			stat: {
				mtime: new Date("2026-01-01T00:00:00.000Z"),
				size: 42,
			},
			stored: {
				checksum: "etag-1",
				contentType: "application/pdf",
				manifestHash: "hash-1",
				manifestId: "manifest-1",
				manifestSignature: "sig-1",
				requestId: "request-1",
				sizeBytes: 42,
			},
		});
		expect(metadata.checksum).toBe("etag-1");
		expect(metadata.sizeBytes).toBe(42);
		expect(metadata.manifestId).toBe("manifest-1");
	});
});

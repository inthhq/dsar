import { describe, expect, it } from "@effect/vitest";

import { buildVercelBlobArtifactKey, mapBlobHeadToMetadata } from "#src";

describe("storage-vercel-blob mappers", () => {
	it("builds deterministic artifact keys with fallback behavior", () => {
		const key = buildVercelBlobArtifactKey(
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

	it("maps blob head output into normalized metadata", () => {
		const metadata = mapBlobHeadToMetadata({
			head: {
				contentType: "application/pdf",
				etag: "etag-1",
				size: 42,
				uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
			},
			key: "artifacts/request-1/file.pdf",
			reference: {
				key: "artifacts/request-1/file.pdf",
				manifestHash: "hash-1",
				manifestId: "manifest-1",
				manifestSignature: "sig-1",
				requestId: "request-1",
				url: "https://blob.example/file.pdf",
			},
		});
		expect(metadata.checksum).toBe("etag-1");
		expect(metadata.sizeBytes).toBe(42);
		expect(metadata.manifestId).toBe("manifest-1");
	});
});

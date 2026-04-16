import { S3ServiceException } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeS3StorageAdapter, normalizeS3ProviderError } from "#src";

const makeS3Error = (message: string) =>
	new S3ServiceException({
		$fault: "server",
		$metadata: {},
		message,
		name: "S3Exception",
	});

describe("storage-s3 adapter", () => {
	it.effect("validates config and reports diagnostics", () =>
		Effect.gen(function* _() {
			const adapter = makeS3StorageAdapter({
				bucket: "dsar-artifacts",
				region: "us-east-1",
			});
			const result = yield* adapter.validateConfig({
				bucket: "dsar-artifacts",
				region: "us-east-1",
			});
			expect(result).toBeUndefined();
			const diagnostics = yield* adapter.diagnostics();
			expect(diagnostics.key).toBe("storage-s3");
			expect(diagnostics.capability).toBe("storage");
		})
	);

	it.effect(
		"supports put/get/head/delete operations with stable references",
		() =>
			Effect.gen(function* _() {
				const send = vi
					.fn()
					.mockResolvedValueOnce({ ETag: '"etag-1"' })
					.mockResolvedValueOnce({
						Body: new Uint8Array([1, 2, 3]),
						ContentLength: 3,
						ContentType: "application/pdf",
						ETag: '"etag-1"',
						Metadata: {
							"manifest-hash": "hash-1",
							"manifest-id": "manifest-1",
							"manifest-signature": "sig-1",
							"request-id": "request-1",
						},
					})
					.mockResolvedValueOnce({
						ContentLength: 3,
						ContentType: "application/pdf",
						ETag: '"etag-1"',
						Metadata: {
							"manifest-id": "manifest-1",
							"request-id": "request-1",
						},
					})
					.mockResolvedValueOnce({});
				const adapter = makeS3StorageAdapter(
					{
						bucket: "dsar-artifacts",
						region: "us-east-1",
					},
					{
						client: {
							send,
						} as never,
					}
				);
				const putResult = yield* adapter.putObject({
					bytes: new Uint8Array([1, 2, 3]),
					contentType: "application/pdf",
					key: "artifacts/request-1/file.pdf",
					manifestHash: "hash-1",
					manifestId: "manifest-1",
					manifestSignature: "sig-1",
					requestId: "request-1",
				});
				const getResult = yield* adapter.getObject(
					"artifacts/request-1/file.pdf"
				);
				const headResult = yield* adapter.headObject(
					"artifacts/request-1/file.pdf"
				);
				const deleteResult = yield* adapter.deleteObject(
					"artifacts/request-1/file.pdf"
				);
				expect(putResult.reference.manifestId).toBe("manifest-1");
				expect(getResult.bytes).toStrictEqual(new Uint8Array([1, 2, 3]));
				expect(headResult.manifestId).toBe("manifest-1");
				expect(deleteResult.deleted).toBeTruthy();
			})
	);

	it.effect(
		"propagates S3 errors as normalized adapter invocation errors",
		() =>
			Effect.gen(function* _() {
				const send = vi.fn().mockRejectedValue(makeS3Error("access denied"));
				const adapter = makeS3StorageAdapter(
					{ bucket: "dsar-artifacts", region: "us-east-1" },
					{ client: { send } as never }
				);
				const exit = yield* Effect.exit(
					adapter.deleteObject("artifacts/request-1/file.pdf")
				);
				expect(exit._tag).toBe("Failure");
			})
	);

	it.effect("healthCheck returns failure status on S3 error", () =>
		Effect.gen(function* _() {
			const send = vi
				.fn()
				.mockRejectedValue(makeS3Error("network connection refused"));
			const adapter = makeS3StorageAdapter(
				{ bucket: "dsar-artifacts", region: "us-east-1" },
				{ client: { send } as never }
			);
			const health = yield* adapter.healthCheck();
			expect(health.ok).toBeFalsy();
			expect(["degraded", "down"]).toContain(health.status);
		})
	);

	it("normalizes retriable provider failures", () => {
		const error = normalizeS3ProviderError(new Error("network timeout"));
		expect(error.retriable).toBeTruthy();
		expect(error.category).toBe("timeout");
	});
});

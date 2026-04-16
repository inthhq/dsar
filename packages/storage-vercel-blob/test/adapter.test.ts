import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	makeVercelBlobStorageAdapter,
	normalizeVercelBlobProviderError,
} from "#src";

const mocks = {
	del: vi.fn(),
	fetch: vi.fn(),
	head: vi.fn(),
	put: vi.fn(),
};

const storageKey = "artifacts/request-1/manifest-1/file.pdf";

const resetMocks = (): void => {
	mocks.del.mockReset();
	mocks.fetch.mockReset();
	mocks.head.mockReset();
	mocks.put.mockReset();
};

const configureCrudMocks = (): void => {
	mocks.put.mockResolvedValue({
		contentDisposition: 'attachment; filename="file.pdf"',
		contentType: "application/pdf",
		downloadUrl: "https://blob.example/download/file.pdf",
		pathname: storageKey,
		url: "https://blob.example/file.pdf",
	});
	mocks.head.mockResolvedValue({
		cacheControl: "public, max-age=60",
		contentDisposition: 'attachment; filename="file.pdf"',
		contentType: "application/pdf",
		downloadUrl: "https://blob.example/download/file.pdf",
		etag: "etag-1",
		pathname: storageKey,
		size: 3,
		uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
		url: "https://blob.example/file.pdf",
	});
	mocks.del.mockResolvedValue();
	mocks.fetch.mockResolvedValue({
		arrayBuffer: async () =>
			await new Response(new Uint8Array([1, 2, 3])).arrayBuffer(),
		ok: true,
		status: 200,
	} as Response);
};

const createAdapter = () =>
	makeVercelBlobStorageAdapter(
		{
			addRandomSuffix: false,
			allowOverwrite: true,
			prefix: "artifacts",
			readWriteToken: "token-1",
		},
		{
			client: {
				del: mocks.del,
				fetch: mocks.fetch as typeof fetch,
				head: mocks.head,
				put: mocks.put,
			},
		}
	);

const runCrudFlow = () =>
	Effect.gen(function* _() {
		const adapter = createAdapter();
		const putResult = yield* adapter.putObject({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: "application/pdf",
			key: storageKey,
			manifestHash: "hash-1",
			manifestId: "manifest-1",
			manifestSignature: "sig-1",
			requestId: "request-1",
		});
		const getResult = yield* adapter.getObject(storageKey);
		const headResult = yield* adapter.headObject(storageKey);
		const deleteResult = yield* adapter.deleteObject(storageKey);
		return { deleteResult, getResult, headResult, putResult };
	});

describe("storage-vercel-blob adapter", () => {
	it.effect("validates config and reports diagnostics", () =>
		Effect.gen(function* _() {
			resetMocks();
			const adapter = makeVercelBlobStorageAdapter({
				readWriteToken: "token-1",
			});
			const result = yield* adapter.validateConfig({
				prefix: "artifacts",
				readWriteToken: "token-1",
			});
			expect(result).toBeUndefined();
			const diagnostics = yield* adapter.diagnostics();
			expect(diagnostics.key).toBe("storage-vercel-blob");
			expect(diagnostics.capability).toBe("storage");
		})
	);

	it.effect(
		"supports put/get/head/delete operations with stable references",
		() =>
			Effect.gen(function* _() {
				resetMocks();
				configureCrudMocks();
				const { deleteResult, getResult, headResult, putResult } =
					yield* runCrudFlow();
				expect(putResult.reference.manifestId).toBe("manifest-1");
				expect(getResult.bytes).toStrictEqual(new Uint8Array([1, 2, 3]));
				expect(headResult.manifestId).toBe("manifest-1");
				expect(deleteResult.deleted).toBeTruthy();
			})
	);

	it("normalizes retriable provider failures", () => {
		resetMocks();
		const error = normalizeVercelBlobProviderError(
			new Error("network timeout")
		);
		expect(error.retriable).toBeTruthy();
		expect(error.category).toBe("timeout");
	});
});

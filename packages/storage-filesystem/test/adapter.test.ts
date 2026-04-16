import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	makeFilesystemStorageAdapter,
	normalizeFilesystemProviderError,
} from "#src";

const makeTempDir = (): Promise<string> =>
	mkdtemp(join(tmpdir(), "dsar-storage-filesystem-"));

const storageKey = "artifacts/request-1/manifest-1/file.pdf";

const runCrudFlow = (baseDir: string) =>
	Effect.gen(function* _() {
		const adapter = makeFilesystemStorageAdapter({
			baseDir,
			prefix: "artifacts",
		});
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
		const secondAdapter = makeFilesystemStorageAdapter({ baseDir });
		const headResult = yield* secondAdapter.headObject(storageKey);
		const deleteResult = yield* adapter.deleteObject(storageKey);
		return { deleteResult, getResult, headResult, putResult };
	});

describe("storage-filesystem adapter", () => {
	it.effect("validates config and reports diagnostics", () =>
		Effect.acquireUseRelease(
			Effect.promise(makeTempDir),
			(baseDir) =>
				Effect.gen(function* _() {
					const adapter = makeFilesystemStorageAdapter({ baseDir });
					const result = yield* adapter.validateConfig({
						baseDir,
						prefix: "artifacts",
					});
					expect(result).toBeUndefined();
					const diagnostics = yield* adapter.diagnostics();
					expect(diagnostics.key).toBe("storage-filesystem");
					expect(diagnostics.capability).toBe("storage");
				}),
			(baseDir) =>
				Effect.promise(() => rm(baseDir, { force: true, recursive: true }))
		)
	);

	it.effect(
		"supports put/get/head/delete operations with stable references",
		() =>
			Effect.acquireUseRelease(
				Effect.promise(makeTempDir),
				(baseDir) =>
					Effect.gen(function* _() {
						const { deleteResult, getResult, headResult, putResult } =
							yield* runCrudFlow(baseDir);
						expect(putResult.reference.manifestId).toBe("manifest-1");
						expect(getResult.bytes).toStrictEqual(new Uint8Array([1, 2, 3]));
						expect(headResult.manifestId).toBe("manifest-1");
						expect(deleteResult.deleted).toBeTruthy();
					}),
				(baseDir) =>
					Effect.promise(() => rm(baseDir, { force: true, recursive: true }))
			)
	);

	it("normalizes retriable provider failures", () => {
		const timeoutError = Object.assign(new Error("timed out"), {
			code: "ETIMEDOUT",
		});
		const normalized = normalizeFilesystemProviderError(timeoutError);
		expect(normalized.retriable).toBeTruthy();
		expect(normalized.category).toBe("timeout");
	});
});

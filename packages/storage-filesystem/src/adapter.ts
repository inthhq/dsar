import {
	access,
	mkdir,
	readFile,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { AdapterHealth, StorageAdapterContract } from "@dsar/backend";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";

import {
	defaultFilesystemStorageConfig,
	parseFilesystemStorageAdapterConfig,
} from "./config";
import {
	createFilesystemError,
	FilesystemInvocationError,
	isPathMissingError,
	normalizeFilesystemProviderError,
} from "./errors";
import {
	buildFilesystemArtifactKey,
	buildFilesystemArtifactReference,
} from "./mappers/keys";
import { mapFilesystemStatToMetadata } from "./mappers/metadata";
import {
	metadataPathFor,
	parseStoredMetadata,
	removeIfExists,
	sha256Hex,
	toBytes,
	toHealthyHealth,
	toReference,
} from "./metadata";
import { runWithRetry } from "./retry";
import type {
	FilesystemStorageAdapterConfig,
	StoredFilesystemMetadata,
} from "./types";

interface FilesystemClient {
	readonly access: typeof access;
	readonly mkdir: typeof mkdir;
	readonly readFile: typeof readFile;
	readonly stat: typeof stat;
	readonly unlink: typeof unlink;
	readonly writeFile: typeof writeFile;
}

/**
 * Creates a filesystem-backed storage adapter contract with retry and metadata support.
 *
 * @param config - Adapter configuration (base directory, prefix, retry settings).
 * @param options - Optional overrides such as an injected filesystem client.
 * @returns A {@link StorageAdapterContract} implementation for filesystem persistence.
 */
export const makeFilesystemStorageAdapter = (
	config: FilesystemStorageAdapterConfig,
	options?: { readonly client?: FilesystemClient }
): StorageAdapterContract => {
	const resolved = {
		...defaultFilesystemStorageConfig(),
		...config,
	};
	const baseDir = resolve(resolved.baseDir);
	const client: FilesystemClient = options?.client ?? {
		access,
		mkdir,
		readFile,
		stat,
		unlink,
		writeFile,
	};
	const retryMaxAttempts = Math.max(resolved.retryMaxAttempts ?? 1, 1);
	const prefix = resolved.prefix ?? "artifacts";

	const keyToPath = (key: string) => {
		const normalizedKey = key.replaceAll("\\", "/");
		const segments = normalizedKey
			.split("/")
			.filter((segment) => segment.length > 0);
		const fullPath = resolve(baseDir, ...segments);
		const rel = relative(baseDir, fullPath);
		if (rel.startsWith("..") || isAbsolute(rel)) {
			throw createFilesystemError({
				category: "validation",
				message: `Artifact key resolves outside configured baseDir: ${key}`,
			});
		}
		return fullPath;
	};

	const runFilesystem = <T>(op: () => Promise<T>) =>
		Effect.tryPromise({
			catch: normalizeFilesystemProviderError,
			try: () => runWithRetry(op, retryMaxAttempts),
		});

	const readStoredMetadata = async (
		key: string
	): Promise<StoredFilesystemMetadata | undefined> => {
		const metadataPath = metadataPathFor(keyToPath(key));
		try {
			const metadataBytes = await client.readFile(metadataPath, {
				encoding: "utf8",
			});
			return parseStoredMetadata(key, metadataBytes);
		} catch (error) {
			if (isPathMissingError(error)) {
				return undefined;
			}
			if (
				error instanceof FilesystemInvocationError &&
				error.category === "validation"
			) {
				return undefined;
			}
			throw error;
		}
	};

	return {
		capability: "storage",
		deleteObject: (key) =>
			runFilesystem(async () => {
				const filePath = keyToPath(key);
				const metadataPath = metadataPathFor(filePath);
				const deleted = await removeIfExists(client, filePath);
				await removeIfExists(client, metadataPath);
				return { deleted, key };
			}),
		diagnostics: () =>
			Effect.succeed({
				capability: "storage",
				details: {
					baseDir,
					prefix,
					retryMaxAttempts,
				},
				key: "storage-filesystem",
			}),
		getObject: (key) =>
			runFilesystem(async () => {
				const filePath = keyToPath(key);
				const [fileBytes, fileStat, stored] = await Promise.all([
					client.readFile(filePath),
					client.stat(filePath),
					readStoredMetadata(key),
				]);
				const reference = toReference(key, stored);
				return {
					bytes: toBytes(fileBytes),
					contentType: stored?.contentType ?? "application/octet-stream",
					key,
					metadata: mapFilesystemStatToMetadata({
						key,
						reference,
						stat: fileStat,
						stored,
					}),
				};
			}),
		headObject: (key) =>
			runFilesystem(async () => {
				const filePath = keyToPath(key);
				const [fileStat, stored] = await Promise.all([
					client.stat(filePath),
					readStoredMetadata(key),
				]);
				const reference = toReference(key, stored);
				return mapFilesystemStatToMetadata({
					key,
					reference,
					stat: fileStat,
					stored,
				});
			}),
		healthCheck: () =>
			Effect.gen(function* filesystemHealthCheckProgram() {
				const result = yield* Effect.result(
					Effect.tryPromise({
						catch: (error) => normalizeFilesystemProviderError(error),
						try: async (): Promise<AdapterHealth> => {
							await client.mkdir(baseDir, { recursive: true });
							await client.access(baseDir);
							return toHealthyHealth(baseDir);
						},
					})
				);
				if (Result.isFailure(result)) {
					const normalized = result.failure;
					return {
						details: {
							baseDir,
							error: normalized,
							reachable: false,
						},
						ok: false,
						status: normalized.retriable ? "degraded" : "down",
					};
				}
				return result.success;
			}),
		init: () =>
			runFilesystem(async () => {
				await client.mkdir(baseDir, { recursive: true });
			}),
		key: "storage-filesystem",
		putObject: (input) =>
			runFilesystem(async () => {
				const key = buildFilesystemArtifactKey(input, prefix);
				const filePath = keyToPath(key);
				await client.mkdir(dirname(filePath), { recursive: true });
				await client.writeFile(filePath, input.bytes);
				const reference = buildFilesystemArtifactReference({
					key,
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
				});
				const fileStat = await client.stat(filePath);
				const stored = {
					checksum: sha256Hex(input.bytes),
					contentType: input.contentType,
					lastModifiedAt: fileStat.mtime.toISOString(),
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
					sizeBytes: input.bytes.byteLength,
				} satisfies StoredFilesystemMetadata;
				await client.writeFile(
					metadataPathFor(filePath),
					JSON.stringify(stored),
					"utf8"
				);
				return {
					key,
					metadata: mapFilesystemStatToMetadata({
						key,
						reference,
						stat: fileStat,
						stored,
					}),
					reference,
				};
			}),
		validateConfig: (input) =>
			Effect.suspend(() => {
				const parsed = parseFilesystemStorageAdapterConfig(input);
				if (Exit.isFailure(parsed)) {
					return Effect.fail({
						issues: {
							parseError: Cause.pretty(parsed.cause),
						},
						message: "Invalid filesystem storage adapter configuration.",
					});
				}
				return Effect.void;
			}),
	};
};

export { normalizeFilesystemProviderError } from "./errors";

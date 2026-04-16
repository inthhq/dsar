import { createHash } from "node:crypto";

import type { AdapterHealth } from "@dsar/backend";
import { asRecord } from "@dsar/guards";

import {
	createFilesystemError,
	FilesystemInvocationError,
	isPathMissingError,
} from "./errors";
import { buildFilesystemArtifactReference } from "./mappers/keys";
import type {
	FilesystemArtifactReference,
	StoredFilesystemMetadata,
} from "./types";

const isStoredFilesystemMetadata = (
	value: unknown
): value is StoredFilesystemMetadata => {
	const record = asRecord(value);
	if (!record) {
		return false;
	}
	return (
		(record.contentType === undefined ||
			typeof record.contentType === "string") &&
		(record.checksum === undefined || typeof record.checksum === "string") &&
		(record.lastModifiedAt === undefined ||
			typeof record.lastModifiedAt === "string") &&
		(record.manifestHash === undefined ||
			typeof record.manifestHash === "string") &&
		(record.manifestId === undefined ||
			typeof record.manifestId === "string") &&
		(record.manifestSignature === undefined ||
			typeof record.manifestSignature === "string") &&
		(record.requestId === undefined || typeof record.requestId === "string") &&
		(record.sizeBytes === undefined ||
			(typeof record.sizeBytes === "number" && record.sizeBytes >= 0))
	);
};

/**
 * Normalizes a `Buffer` or byte array into `Uint8Array`.
 *
 * @param buffer - Byte source returned by the filesystem client.
 * @returns The byte source as `Uint8Array`.
 */
export const toBytes = (buffer: Uint8Array | Buffer) =>
	Buffer.isBuffer(buffer) ? new Uint8Array(buffer) : buffer;

/**
 * Returns the metadata sidecar path for an artifact file.
 *
 * @param filePath - Primary artifact file path.
 * @returns The `.meta.json` sidecar path.
 */
export const metadataPathFor = (filePath: string) => `${filePath}.meta.json`;

/**
 * Parses and validates persisted filesystem metadata.
 *
 * @param key - Artifact key associated with the metadata file.
 * @param metadataBytes - Raw metadata JSON string.
 * @returns Parsed filesystem metadata.
 */
export const parseStoredMetadata = (
	key: string,
	metadataBytes: string
): StoredFilesystemMetadata => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(metadataBytes);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown JSON parse error";
		throw createFilesystemError({
			category: "validation",
			message: `Invalid metadata sidecar for artifact key: ${key}: ${message}`,
		});
	}
	if (!isStoredFilesystemMetadata(parsed)) {
		throw createFilesystemError({
			category: "validation",
			message: `Invalid metadata sidecar for artifact key: ${key}`,
		});
	}
	return parsed;
};

/**
 * Computes the SHA-256 hash of an artifact payload.
 *
 * @param bytes - Artifact bytes to hash.
 * @returns Hex-encoded SHA-256 digest.
 */
export const sha256Hex = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");

/**
 * Creates a healthy adapter health payload for the configured base directory.
 *
 * @param baseDir - Filesystem base directory used by the adapter.
 * @returns Healthy adapter health status.
 */
export const toHealthyHealth = (baseDir: string): AdapterHealth => ({
	details: { baseDir, reachable: true },
	ok: true,
	status: "healthy",
});

/**
 * Removes a file when it exists.
 *
 * @param client - Filesystem client exposing `unlink`.
 * @param targetPath - Path to remove.
 * @returns Whether the file existed and was removed.
 */
export const removeIfExists = async (
	client: {
		readonly unlink: (path: string) => Promise<void>;
	},
	targetPath: string
): Promise<boolean> => {
	try {
		await client.unlink(targetPath);
		return true;
	} catch (error) {
		if (isPathMissingError(error)) {
			return false;
		}
		throw error;
	}
};

/**
 * Builds a public artifact reference from stored filesystem metadata.
 *
 * @param key - Artifact key used for retrieval.
 * @param stored - Optional stored metadata sidecar.
 * @returns Filesystem artifact reference derived from the metadata.
 */
export const toReference = (
	key: string,
	stored?: StoredFilesystemMetadata
): FilesystemArtifactReference =>
	buildFilesystemArtifactReference({
		key,
		manifestHash: stored?.manifestHash,
		manifestId: stored?.manifestId,
		manifestSignature: stored?.manifestSignature,
		requestId: stored?.requestId,
	});

export { isPathMissingError, FilesystemInvocationError };

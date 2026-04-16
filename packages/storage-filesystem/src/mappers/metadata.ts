import type {
	FilesystemArtifactMetadata,
	FilesystemArtifactReference,
	StoredFilesystemMetadata,
} from "../types";

interface StatLike {
	readonly mtime?: Date;
	readonly size?: number;
}

/**
 * Converts a filesystem stat and stored sidecar data into a unified artifact
 * metadata record.
 *
 * @param input - Mapping context.
 * @param input.key - Storage key identifying the artifact on disk.
 * @param input.reference - Manifest-level reference fields (`requestId`,
 *   `manifestId`, `manifestHash`, `manifestSignature`).
 * @param input.stat - Optional `fs.stat` result providing `mtime` and `size`
 *   as fallbacks when stored metadata is absent.
 * @param input.stored - Optional sidecar metadata persisted alongside the
 *   artifact (checksum, content type, size, last-modified).
 * @returns A {@link FilesystemArtifactMetadata} record merging stored values
 *   with stat-derived fallbacks.
 */
export const mapFilesystemStatToMetadata = (input: {
	readonly key: string;
	readonly reference: FilesystemArtifactReference;
	readonly stat?: StatLike;
	readonly stored?: StoredFilesystemMetadata;
}): FilesystemArtifactMetadata => ({
	checksum: input.stored?.checksum,
	contentType: input.stored?.contentType ?? "application/octet-stream",
	key: input.key,
	lastModifiedAt:
		input.stored?.lastModifiedAt ?? input.stat?.mtime?.toISOString(),
	manifestHash: input.reference.manifestHash,
	manifestId: input.reference.manifestId,
	manifestSignature: input.reference.manifestSignature,
	requestId: input.reference.requestId,
	sizeBytes: input.stored?.sizeBytes ?? input.stat?.size,
});

import type { S3ArtifactMetadata, S3ArtifactReference } from "../types";

interface HeadLikeMetadata {
	readonly ETag?: string;
	readonly ChecksumSHA256?: string;
	readonly ChecksumSHA1?: string;
	readonly ContentType?: string;
	readonly ContentLength?: number;
	readonly LastModified?: Date;
}

const stripQuote = (value: string | undefined) => value?.replaceAll('"', "");

/**
 * Converts an S3 HeadObject response into the internal artifact metadata
 * format.
 *
 * @param input - Mapping context.
 * @param input.key - S3 object key for this artifact.
 * @param input.reference - {@link S3ArtifactReference} supplying manifest-level
 *   fields (`requestId`, `manifestId`, `manifestHash`, `manifestSignature`).
 * @param input.head - S3 HeadObject fields; `ETag` (quote-stripped),
 *   `ChecksumSHA256`, or `ChecksumSHA1` are used as the checksum (first
 *   available wins). `ContentType` defaults to `"application/octet-stream"`
 *   when absent.
 * @returns An {@link S3ArtifactMetadata} record combining the head-derived
 *   fields with the reference metadata.
 */
export const mapHeadObjectToMetadata = (input: {
	readonly key: string;
	readonly reference: S3ArtifactReference;
	readonly head: HeadLikeMetadata;
}): S3ArtifactMetadata => ({
	checksum:
		stripQuote(input.head.ETag) ??
		input.head.ChecksumSHA256 ??
		input.head.ChecksumSHA1,
	contentType: input.head.ContentType ?? "application/octet-stream",
	key: input.key,
	lastModifiedAt: input.head.LastModified?.toISOString(),
	manifestHash: input.reference.manifestHash,
	manifestId: input.reference.manifestId,
	manifestSignature: input.reference.manifestSignature,
	requestId: input.reference.requestId,
	sizeBytes: input.head.ContentLength,
});

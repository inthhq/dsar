import type {
	VercelBlobArtifactMetadata,
	VercelBlobArtifactReference,
} from "../types";

interface HeadLikeMetadata {
	readonly etag?: string;
	readonly contentType?: string;
	readonly size?: number;
	readonly uploadedAt?: Date;
}

/**
 * Normalizes a Vercel Blob head response and artifact reference into the
 * library's {@link VercelBlobArtifactMetadata} shape.
 *
 * Maps `etag` to `checksum`, `size` to `sizeBytes`, converts `uploadedAt` to
 * an ISO string for `lastModifiedAt`, defaults `contentType` to
 * `application/octet-stream`, and forwards manifest fields from the reference.
 *
 * @param input - Blob storage key, artifact reference, and head metadata to merge.
 * @returns Unified artifact metadata ready for persistence or API responses.
 */
export const mapBlobHeadToMetadata = (input: {
	readonly key: string;
	readonly reference: VercelBlobArtifactReference;
	readonly head: HeadLikeMetadata;
}): VercelBlobArtifactMetadata => ({
	checksum: input.head.etag,
	contentType: input.head.contentType ?? "application/octet-stream",
	key: input.key,
	lastModifiedAt: input.head.uploadedAt?.toISOString(),
	manifestHash: input.reference.manifestHash,
	manifestId: input.reference.manifestId,
	manifestSignature: input.reference.manifestSignature,
	requestId: input.reference.requestId,
	sizeBytes: input.head.size,
	url: input.reference.url,
});

import type { BuildS3ArtifactKeyInput, S3ArtifactReference } from "../types";

const safeSegment = (value: string) =>
	value
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^-|-$/g, "");

const nonEmpty = (value: string | undefined) =>
	value !== undefined && value.trim().length > 0 ? value : undefined;

const safeSuffixFromName = (name: string) => safeSegment(name) || undefined;

const safeSuffixFromId = (id: string) => {
	const sanitized = safeSegment(id);
	return sanitized ? `${sanitized}.bin` : undefined;
};

const artifactSuffix = (input: BuildS3ArtifactKeyInput) => {
	const name = nonEmpty(input.fileName);
	const id = nonEmpty(input.artifactId);
	const fromName = name ? safeSuffixFromName(name) : undefined;
	const fromId = id ? safeSuffixFromId(id) : undefined;
	return fromName ?? fromId ?? "artifact.bin";
};

/**
 * Builds a deterministic S3 object key for an artifact. If `input.key` is
 * provided it is returned as-is; otherwise the key is assembled as
 * `{prefix}/{requestId}/{manifestId}/{category}/{redaction}/{thirdParty}/{suffix}`.
 *
 * @param input - {@link BuildS3ArtifactKeyInput} fields: optional explicit
 *   `key`, `requestId`, `manifestId`, `category`, `redacted`,
 *   `excludedThirdParty`, and `fileName` or `artifactId` for the suffix.
 * @param prefix - Bucket-level key prefix (sanitised via `safeSegment`).
 * @returns The resolved S3 object key string.
 */
export const buildS3ArtifactKey = (
	input: BuildS3ArtifactKeyInput,
	prefix: string
): string => {
	const explicitKey = nonEmpty(input.key);
	if (explicitKey) {
		return explicitKey;
	}
	const request = safeSegment(nonEmpty(input.requestId) ?? "request-unknown");
	const manifest = safeSegment(
		nonEmpty(input.manifestId) ?? "manifest-unknown"
	);
	const category = safeSegment(nonEmpty(input.category) ?? "uncategorized");
	const redaction = input.redacted ? "redacted" : "raw";
	const thirdParty = input.excludedThirdParty ? "third-party-excluded" : "full";
	const parts = [
		safeSegment(prefix),
		request,
		manifest,
		category,
		redaction,
		thirdParty,
		artifactSuffix(input),
	];
	return parts.join("/");
};

/**
 * Creates an {@link S3ArtifactReference} from a resolved key and optional
 * manifest metadata.
 *
 * @param input - Object containing the S3 `key` and optional `requestId`,
 *   `manifestId`, `manifestHash`, and `manifestSignature`.
 * @returns A reference object suitable for storage adapter responses.
 */
export const buildS3ArtifactReference = (input: {
	readonly key: string;
	readonly requestId?: string;
	readonly manifestId?: string;
	readonly manifestHash?: string;
	readonly manifestSignature?: string;
}): S3ArtifactReference => ({
	key: input.key,
	manifestHash: input.manifestHash,
	manifestId: input.manifestId,
	manifestSignature: input.manifestSignature,
	requestId: input.requestId,
});

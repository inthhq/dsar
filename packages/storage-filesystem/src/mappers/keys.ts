import type {
	BuildFilesystemArtifactKeyInput,
	FilesystemArtifactReference,
} from "../types";

const safeSegment = (value: string) =>
	value
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]/g, "-")
		.replaceAll(/-+/g, "-")
		.replaceAll(/^-|-$/g, "");

const nonEmpty = (value: string | undefined) =>
	value && value.length > 0 ? value : undefined;

const artifactSuffix = (input: BuildFilesystemArtifactKeyInput) => {
	const name = nonEmpty(input.fileName);
	if (name) {
		return safeSegment(name);
	}
	const artifactId = nonEmpty(input.artifactId);
	if (artifactId) {
		return `${safeSegment(artifactId)}.bin`;
	}
	return "artifact.bin";
};

/**
 * Builds a deterministic filesystem path key for an artifact.
 *
 * When `input.key` is set it is returned as-is (explicit override).
 * Otherwise the key is assembled as
 * `{prefix}/{requestId}/{manifestId}/{category}/{redaction}/{thirdParty}/{suffix}`
 * with each segment sanitised via {@link safeSegment}. Missing fields
 * fall back to `"request-unknown"`, `"manifest-unknown"`, or
 * `"uncategorized"`. The suffix is derived from `fileName`, `artifactId`,
 * or defaults to `"artifact.bin"`.
 *
 * @param input - Artifact metadata whose
 *   fields are sanitised and joined into path segments.
 * @param prefix - Namespace prepended to every generated key.
 * @returns The fully assembled slash-separated filesystem key.
 */
export const buildFilesystemArtifactKey = (
	input: BuildFilesystemArtifactKeyInput,
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
 * Constructs a {@link FilesystemArtifactReference} from the resolved key
 * and optional manifest linkage fields.
 *
 * @param input - Object containing the resolved `key` and optional
 *   `requestId`, `manifestId`, `manifestHash`, and `manifestSignature`.
 * @returns Reference record suitable for
 *   persistence alongside the stored artifact.
 */
export const buildFilesystemArtifactReference = (input: {
	readonly key: string;
	readonly requestId?: string;
	readonly manifestId?: string;
	readonly manifestHash?: string;
	readonly manifestSignature?: string;
}): FilesystemArtifactReference => ({
	key: input.key,
	manifestHash: input.manifestHash,
	manifestId: input.manifestId,
	manifestSignature: input.manifestSignature,
	requestId: input.requestId,
});

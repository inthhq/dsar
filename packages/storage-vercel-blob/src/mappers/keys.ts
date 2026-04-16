import type {
	BuildVercelBlobArtifactKeyInput,
	VercelBlobArtifactReference,
} from "../types";

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

const artifactSuffix = (input: BuildVercelBlobArtifactKeyInput) => {
	const name = nonEmpty(input.fileName);
	const id = nonEmpty(input.artifactId);
	const fromName = name ? safeSuffixFromName(name) : undefined;
	const fromId = id ? safeSuffixFromId(id) : undefined;
	return fromName ?? fromId ?? "artifact.bin";
};

/**
 * Derives a `/`-delimited Vercel Blob object key for an artifact.
 *
 * If `input.key` is a non-empty string it is returned verbatim (escape
 * hatch). Otherwise the key is assembled from sanitised segments:
 *
 * `{prefix}/{requestId}/{manifestId}/{category}/{redaction}/{thirdParty}/{suffix}`
 *
 * **Sanitisation** — each segment is lower-cased, non-alphanumeric
 * characters (except `.`, `-`, `_`) are replaced with `-`, consecutive
 * dashes are collapsed, and leading/trailing dashes are stripped.
 *
 * **Fallbacks** — `requestId` → `"request-unknown"`,
 * `manifestId` → `"manifest-unknown"`, `category` → `"uncategorized"`.
 *
 * **Suffix** — derived from `fileName` (sanitised) if present, else
 * `"{artifactId}.bin"`, else `"artifact.bin"`.
 *
 * @example
 * ```ts
 * buildVercelBlobArtifactKey(
 *   { requestId: "REQ-1", manifestId: "M-2", category: "personal_data",
 *     redacted: true, excludedThirdParty: false, fileName: "export.zip" },
 *   "dsar"
 * );
 * // → "dsar/req-1/m-2/personal_data/redacted/full/export.zip"
 * ```
 *
 * @param input - Artifact metadata used to build each path segment.
 * @param prefix - Store-level namespace prepended to every key.
 * @returns The fully assembled object key string.
 */
export const buildVercelBlobArtifactKey = (
	input: BuildVercelBlobArtifactKeyInput,
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
 * Constructs a {@link VercelBlobArtifactReference} from the given key
 * and optional traceability fields. Pure projection — no validation or
 * sanitisation is applied.
 *
 * @param input - Object key and optional metadata (URL, request/manifest
 *   IDs, hash, and signature) to include in the reference.
 * @returns A populated {@link VercelBlobArtifactReference}.
 */
export const buildVercelBlobArtifactReference = (input: {
	readonly key: string;
	readonly url?: string;
	readonly requestId?: string;
	readonly manifestId?: string;
	readonly manifestHash?: string;
	readonly manifestSignature?: string;
}): VercelBlobArtifactReference => ({
	key: input.key,
	manifestHash: input.manifestHash,
	manifestId: input.manifestId,
	manifestSignature: input.manifestSignature,
	requestId: input.requestId,
	url: input.url,
});

/**
 * Runtime configuration accepted by the Vercel Blob storage adapter.
 */
export interface VercelBlobStorageAdapterConfig {
	/** Token authorizing read/write operations against blob storage. */
	readonly readWriteToken?: string;
	/** Optional key prefix for tenant/environment partitioning. */
	readonly prefix?: string;
	/** Enables random suffixes to reduce key-collision risk. */
	readonly addRandomSuffix?: boolean;
	/** Allows overwriting existing objects when true. */
	readonly allowOverwrite?: boolean;
	/** Cache-Control max-age used for served artifact URLs. */
	readonly cacheControlMaxAge?: number;
	/** Per-operation timeout budget for provider calls. */
	readonly timeoutMs?: number;
	/** Retry cap for transient provider/network failures. */
	readonly retryMaxAttempts?: number;
}

/**
 * Manifest-link fields propagated across Vercel Blob artifact records.
 */
export interface VercelBlobManifestLinkage {
	/** Owning request id for artifact lineage and audits. */
	readonly requestId?: string;
	/** Manifest id grouping artifacts for a fulfillment batch. */
	readonly manifestId?: string;
	/** Manifest digest used for integrity verification. */
	readonly manifestHash?: string;
	/** Manifest signature proving source authenticity. */
	readonly manifestSignature?: string;
}

/**
 * Inputs used to deterministically build Vercel Blob artifact keys.
 */
export interface BuildVercelBlobArtifactKeyInput extends VercelBlobManifestLinkage {
	/** Precomputed key when caller controls naming strategy. */
	readonly key?: string;
	/** Artifact id used in deterministic key generation fallback. */
	readonly artifactId?: string;
	/** Original filename segment for operator readability. */
	readonly fileName?: string;
	/** Artifact category used for key namespace grouping. */
	readonly category?: string;
	/** Marks artifacts produced from redacted views. */
	readonly redacted?: boolean;
	/** Marks payloads excluding third-party data sources. */
	readonly excludedThirdParty?: boolean;
}

/**
 * Canonical reference to a stored Vercel Blob artifact.
 */
export interface VercelBlobArtifactReference extends VercelBlobManifestLinkage {
	/** Canonical blob key used for lookup and lifecycle linking. */
	readonly key: string;
	/** Optional provider URL for direct delivery/download flows. */
	readonly url?: string;
}

/**
 * Metadata returned for artifacts stored in Vercel Blob.
 */
export interface VercelBlobArtifactMetadata extends VercelBlobArtifactReference {
	/** Optional checksum for integrity validation. */
	readonly checksum?: string;
	/** MIME type used by delivery and export handlers. */
	readonly contentType: string;
	/** Optional size in bytes for accounting and transfer diagnostics. */
	readonly sizeBytes?: number;
	/** Optional provider-reported modification timestamp as an ISO-8601 / RFC 3339
	 *  UTC string with a trailing `Z` (e.g. `2023-05-01T12:34:56Z`). Consumers
	 *  should parse with standard `Date` or RFC 3339 parsers. */
	readonly lastModifiedAt?: string;
}

/**
 * Normalized Vercel Blob error categories for retry and diagnostics handling.
 */
export type VercelBlobErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Error payload emitted when Vercel Blob adapter operations fail.
 */
export interface VercelBlobAdapterInvocationError {
	/** Stable discriminator used to identify this tagged union member. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced the invocation failure. */
	readonly adapterKey: "storage-vercel-blob";
	/** Adapter capability handled by this contract entry. */
	readonly capability: "storage";
	/** Normalized failure category for retry and incident handling. */
	readonly category: VercelBlobErrorCategory;
	/** Whether this failure is considered safe to retry automatically. */
	readonly retriable: boolean;
	/** Human-readable summary for logs and operator debugging. */
	readonly message: string;
	/** Optional raw provider failure context. */
	readonly details?: Readonly<Record<string, unknown>>;
}

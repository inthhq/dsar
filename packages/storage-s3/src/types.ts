/**
 * Runtime configuration accepted by the S3 storage adapter.
 */
export interface S3StorageAdapterConfig {
	/** S3 bucket holding fulfillment and evidence artifacts. */
	readonly bucket: string;
	/** AWS region where the bucket resides. */
	readonly region: string;
	/** Optional custom endpoint for S3-compatible providers. */
	readonly endpoint?: string;
	/** Optional static access key for runtime credentials. */
	readonly accessKeyId?: string;
	/** Optional static secret access key for runtime credentials. */
	readonly secretAccessKey?: string;
	/** Optional session token for temporary credentials. */
	readonly sessionToken?: string;
	/** Enables path-style addressing for compatible endpoints. */
	readonly forcePathStyle?: boolean;
	/** Optional key prefix for tenant/environment partitioning. */
	readonly prefix?: string;
	/** Per-call timeout budget for S3 operations. */
	readonly timeoutMs?: number;
	/** Retry cap for transient network/provider failures. */
	readonly retryMaxAttempts?: number;
}

/**
 * Manifest-level metadata propagated onto artifact keys and references.
 */
export interface S3ManifestLinkage {
	/** Owning request id for artifact lineage and audit trails. */
	readonly requestId?: string;
	/** Manifest id grouping related generated artifacts. */
	readonly manifestId?: string;
	/** Manifest digest used for integrity checks. */
	readonly manifestHash?: string;
	/** Manifest signature used for authenticity verification. */
	readonly manifestSignature?: string;
}

/**
 * Inputs used to deterministically build S3 artifact object keys.
 */
export interface BuildS3ArtifactKeyInput extends S3ManifestLinkage {
	/** Precomputed key when caller controls object naming. */
	readonly key?: string;
	/** Artifact id used by fallback deterministic key generation. */
	readonly artifactId?: string;
	/** Original filename segment for operator readability. */
	readonly fileName?: string;
	/** Artifact category used for namespace grouping. */
	readonly category?: string;
	/** Marks artifacts generated from redacted data views. */
	readonly redacted?: boolean;
	/** Marks payloads excluding third-party data. */
	readonly excludedThirdParty?: boolean;
}

/**
 * Canonical reference to a stored S3 artifact object.
 */
export interface S3ArtifactReference extends S3ManifestLinkage {
	/** Canonical object key stored in S3. */
	readonly key: string;
}

/**
 * Metadata exposed for S3 artifacts returned by adapter operations.
 */
export interface S3ArtifactMetadata extends S3ArtifactReference {
	/** Optional checksum used for integrity validation. */
	readonly checksum?: string;
	/** MIME type used by downstream delivery/export handlers. */
	readonly contentType: string;
	/** Optional object size in bytes for accounting/diagnostics. */
	readonly sizeBytes?: number;
	/** Optional last-modified timestamp from object metadata. */
	readonly lastModifiedAt?: string;
}

/**
 * Normalized S3 provider error category used by retries and observability.
 */
export type S3ErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Error shape emitted when S3 adapter operations fail.
 */
export interface S3AdapterInvocationError {
	/** Stable discriminator for adapter invocation failures. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced this error. */
	readonly adapterKey: "storage-s3";
	/** Adapter capability surface where the failure occurred. */
	readonly capability: "storage";
	/** Normalized category used by retry and incident policies. */
	readonly category: S3ErrorCategory;
	/** Whether this failure should be retried automatically. */
	readonly retriable: boolean;
	/** Human-readable error summary for operator diagnostics. */
	readonly message: string;
	/** Optional raw provider/transport details for debugging. */
	readonly details?: Readonly<Record<string, unknown>>;
}

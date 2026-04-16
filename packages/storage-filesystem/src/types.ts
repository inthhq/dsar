/**
 * Runtime configuration accepted by the filesystem storage adapter.
 */
export interface FilesystemStorageAdapterConfig {
	/** Root directory where DSAR artifacts are persisted. */
	readonly baseDir: string;
	/** Optional key prefix for tenant/environment partitioning. */
	readonly prefix?: string;
	/** Retry cap for transient filesystem operation failures. */
	readonly retryMaxAttempts?: number;
}

/**
 * Manifest-link fields propagated across filesystem artifact records.
 */
export interface FilesystemManifestLinkage {
	/** Owning request id for artifact lineage and audit exports. */
	readonly requestId?: string;
	/** Manifest id grouping related generated artifacts. */
	readonly manifestId?: string;
	/** Manifest digest used for integrity validation. */
	readonly manifestHash?: string;
	/** Manifest signature used for provenance verification. */
	readonly manifestSignature?: string;
}

/**
 * Inputs used to deterministically build filesystem artifact keys.
 */
export interface BuildFilesystemArtifactKeyInput extends FilesystemManifestLinkage {
	/** Precomputed object key when caller controls naming. */
	readonly key?: string;
	/** Artifact id used in deterministic key generation fallback. */
	readonly artifactId?: string;
	/** Original filename segment for human-friendly key composition. */
	readonly fileName?: string;
	/** Artifact category used for storage-path organization. */
	readonly category?: string;
	/** Marks artifacts created from redacted payloads. */
	readonly redacted?: boolean;
	/** Marks payloads excluding third-party data sources. */
	readonly excludedThirdParty?: boolean;
}

/**
 * Canonical reference to a stored filesystem artifact.
 */
export interface FilesystemArtifactReference extends FilesystemManifestLinkage {
	/** Canonical filesystem key/path for the stored artifact. */
	readonly key: string;
}

/**
 * Metadata returned for filesystem artifacts.
 */
export interface FilesystemArtifactMetadata extends FilesystemArtifactReference {
	/** Optional checksum for integrity checks after read/write flows. */
	readonly checksum?: string;
	/** MIME type used by downstream export/download handlers. */
	readonly contentType: string;
	/** Optional size in bytes for quota/accounting and transfer hints. */
	readonly sizeBytes?: number;
	/** Optional modification timestamp from filesystem stat metadata. */
	readonly lastModifiedAt?: string;
}

/**
 * Normalized filesystem error categories for retry and diagnostics handling.
 */
export type FilesystemErrorCategory =
	| "config"
	| "network"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Error payload emitted when filesystem adapter operations fail.
 */
export interface FilesystemAdapterInvocationError {
	/** Stable discriminator used to identify this tagged union member. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced the invocation failure. */
	readonly adapterKey: "storage-filesystem";
	/** Adapter capability handled by this contract entry. */
	readonly capability: "storage";
	/** Normalized failure category for retry/alerting decisions. */
	readonly category: FilesystemErrorCategory;
	/** Indicates whether automated retry should be attempted. */
	readonly retriable: boolean;
	/** Human-readable failure summary for operator diagnostics. */
	readonly message: string;
	/** Optional low-level error context captured from filesystem APIs. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Metadata persisted in filesystem sidecar records.
 */
export interface StoredFilesystemMetadata extends FilesystemManifestLinkage {
	/** Optional checksum persisted with artifact metadata sidecar. */
	readonly checksum?: string;
	/** Stored content type for download/response headers.
	 *  Legacy sidecar files may omit this field; consumers should
	 *  fall back to `"application/octet-stream"`.
	 *  @default "application/octet-stream" */
	readonly contentType?: string;
	/** Optional artifact size in bytes. */
	readonly sizeBytes?: number;
	/** Optional last-modified timestamp from persisted metadata. */
	readonly lastModifiedAt?: string;
}

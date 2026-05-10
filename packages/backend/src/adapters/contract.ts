import type { Effect } from "effect";

import type {
	DeadDispatchAlertEvent,
	NotificationEventType,
} from "../events/contracts";

export type { DeadDispatchAlertEvent };

/**
 * Supported adapter capability groups used by the runtime registry.
 */
export type AdapterCapability = "inbound" | "notifications" | "storage";

/**
 * Structured validation error emitted when adapter configuration is invalid.
 */
export interface AdapterConfigValidationError {
	/** Human-readable validation failure summary. */
	readonly message: string;
	/** Optional category when adapters choose to classify config failures. */
	readonly category?: "config";
	/** Optional retry hint (typically `false` for config failures). */
	readonly retriable?: boolean;
	/** Optional rich parse/provider details retained for diagnostics. */
	readonly details?: Readonly<Record<string, unknown>>;
	/** Optional machine-readable issue map for schema parse failures. */
	readonly issues?: Readonly<Record<string, unknown>>;
}

/**
 * Structured invocation error emitted during adapter operations.
 */
export interface AdapterInvocationFailure {
	/** Human-readable message describing the event or failure. */
	readonly message: string;
	/** Optional normalized category used for retry/incident workflows. */
	readonly category?: string;
	/** Optional retry hint for transient failures. */
	readonly retriable?: boolean;
	/** Optional provider/raw diagnostics retained for observability. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Unified adapter error shape used by runtime contracts.
 */
export type AdapterContractError =
	| AdapterConfigValidationError
	| AdapterInvocationFailure;

/**
 * Health probe result returned by adapter implementations.
 */
export interface AdapterHealth {
	/** Indicates whether the adapter is operational for request handling. */
	readonly ok: boolean;
	/** Coarse-grained health state used by ops dashboards and readiness checks. */
	readonly status: "healthy" | "degraded" | "down";
	/** Optional provider-specific diagnostics for troubleshooting degraded/down states. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Runtime metadata reported by adapters for troubleshooting and observability.
 */
export interface AdapterDiagnostics {
	/** Stable adapter key used for registry lookup and configuration mapping. */
	readonly key: string;
	/** Capability bucket this adapter participates in at runtime. */
	readonly capability: AdapterCapability;
	/** Adapter version string used for traceability across deployments. */
	readonly version?: string;
	/** Optional arbitrary diagnostics exposed by the adapter implementation. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Base contract implemented by all adapter capabilities.
 *
 * @typeParam TConfig - Adapter-specific configuration shape passed to
 *   {@link AdapterContractBase.validateConfig | validateConfig} for
 *   pre-flight validation and to {@link AdapterContractBase.init | init}
 *   for bootstrap. Each capability (storage, notifications, inbound)
 *   narrows this to its own config interface.
 */
export interface AdapterContractBase<TConfig> {
	/** Stable registry key for this adapter implementation. */
	readonly key: string;
	/** Capability handled by this adapter contract. */
	readonly capability: AdapterCapability;
	/** Validates adapter config before initialization and emits structured validation errors. */
	readonly validateConfig: (
		config: TConfig
	) => Effect.Effect<void, AdapterConfigValidationError>;
	/** Performs startup/bootstrap work after config is validated. */
	readonly init: (config: TConfig) => Effect.Effect<void, AdapterContractError>;
	/** Runs a health probe used by lifecycle checks and control-plane status surfaces. */
	readonly healthCheck: () => Effect.Effect<AdapterHealth>;
	/** Returns metadata and diagnostics for observability tooling. */
	readonly diagnostics: () => Effect.Effect<AdapterDiagnostics>;
}

/**
 * Normalized notification payload passed from backend lifecycle services to adapters.
 */
export interface NotificationDispatchInput {
	/** Unique notification event identifier for auditing and deduplication. */
	readonly eventId: string;
	/** Domain event name that determines template/channel handling. */
	readonly eventType: NotificationEventType;
	/** DSAR request identifier this notification belongs to. */
	readonly requestId: string;
	/** Correlation id shared across pipeline steps for tracing. */
	readonly correlationId: string;
	/** Idempotency key used to prevent duplicate external sends. */
	readonly idempotencyKey: string;
	/** Policy version active when the event was generated. */
	readonly policyVersion: string;
	/** Locale used for localization-aware message rendering. */
	readonly locale: string;
	/** Event-specific business payload consumed by channel adapters. */
	readonly payload: Readonly<Record<string, unknown>>;
	/** Optional outbound webhook signing key for webhook notification adapters. */
	readonly webhookSigningKey?: {
		/** Persisted signing key id to emit as `x-dsar-signature-key-id`. */
		readonly id: string;
		/** Secret used to compute the `x-dsar-signature` HMAC. */
		readonly secret: string;
	};
}

/**
 * Delivery outcome returned by notification adapters.
 */
export interface NotificationDispatchResult {
	/** Final channel outcome for this dispatch attempt. */
	readonly status: "delivered" | "failed" | "skipped";
	/** Optional upstream provider response/status code when available. */
	readonly responseCode?: number;
	/** Human-readable failure/skip reason for audit logs and retries. */
	readonly error?: string;
}

/**
 * Adapter contract for notification delivery channels (email, webhook, etc.).
 */
export interface NotificationAdapterContract extends AdapterContractBase<
	Readonly<Record<string, unknown>>
> {
	/** Adapter capability handled by this contract entry. */
	readonly capability: "notifications";
	/** Sends a notification message through the adapter provider. */
	readonly send: (
		input: NotificationDispatchInput
	) => Effect.Effect<NotificationDispatchResult, AdapterContractError>;
}

/**
 * Reference fields that link persisted storage objects to request artifacts.
 */
export interface StorageArtifactReference {
	/** Storage object key or path used to locate the artifact. */
	readonly key: string;
	/** Optional owning request id for artifact-to-request traceability. */
	readonly requestId?: string;
	/** Optional manifest identifier grouping related artifact versions. */
	readonly manifestId?: string;
	/** Optional manifest hash used for integrity verification. */
	readonly manifestHash?: string;
	/** Optional signature proving manifest authenticity. */
	readonly manifestSignature?: string;
}

/**
 * Persisted object metadata returned by storage adapters.
 */
export interface StorageObjectMetadata extends StorageArtifactReference {
	/** Optional object checksum for integrity checks after upload/download. */
	readonly checksum?: string;
	/** MIME type used by downstream consumers when reading object content. */
	readonly contentType: string;
	/** Optional object size used for transfer/accounting logic. */
	readonly sizeBytes?: number;
	/** Optional last-modified timestamp reported by the storage backend. */
	readonly lastModifiedAt?: string;
}

/**
 * Adapter contract for object storage backends used by the DSAR runtime.
 */
export interface StorageAdapterContract extends AdapterContractBase<
	Readonly<Record<string, unknown>>
> {
	/** Adapter capability handled by this contract entry. */
	readonly capability: "storage";
	/** Stores an object and returns its canonical reference and metadata. */
	readonly putObject: (input: {
		/** Storage key where the object is persisted. */
		readonly key: string;
		/** Raw bytes written to storage. */
		readonly bytes: Uint8Array;
		/** MIME type associated with the stored bytes. */
		readonly contentType: string;
		/** Optional owning request id for lineage tracking. */
		readonly requestId?: string;
		/** Optional manifest id linking this object to a bundle/version. */
		readonly manifestId?: string;
		/** Optional manifest digest used for integrity verification. */
		readonly manifestHash?: string;
		/** Optional signature used to validate manifest provenance. */
		readonly manifestSignature?: string;
	}) => Effect.Effect<
		{
			/** Echoed storage key for the persisted object. */
			readonly key: string;
			/** Canonical artifact reference used by other runtime services. */
			readonly reference: StorageArtifactReference;
			/** Persisted metadata returned by the storage backend. */
			readonly metadata: StorageObjectMetadata;
		},
		AdapterContractError
	>;
	/** Retrieves an object payload by storage key. */
	readonly getObject: (key: string) => Effect.Effect<
		{
			/** Stable key used by StorageAdapterContract. */
			readonly key: string;
			/** Raw bytes received by the adapter runtime. */
			readonly bytes: Uint8Array;
			/** MIME type of returned object content. */
			readonly contentType: string;
			/** Optional metadata when backend supplies head information with body. */
			readonly metadata?: StorageObjectMetadata;
		},
		AdapterContractError
	>;
	/**
	 * Retrieves object metadata (size, content type, checksum, timestamps)
	 * without downloading the object body. Use for existence checks, ETag
	 * comparisons, or pre-flight validation before a full `getObject` call.
	 *
	 * @param key - Storage key identifying the object.
	 * @returns An `Effect` yielding {@link StorageObjectMetadata} on success,
	 *   or failing with {@link AdapterContractError} when the object does not
	 *   exist or the provider request fails.
	 */
	readonly headObject: (
		key: string
	) => Effect.Effect<StorageObjectMetadata, AdapterContractError>;
	/**
	 * Deletes an object by its storage key. The operation is idempotent:
	 * repeated calls for the same key do not error.
	 *
	 * - `deleted: true` — the object existed and was successfully removed.
	 * - `deleted: false` — the key did not exist or was already deleted.
	 *
	 * An {@link AdapterContractError} is thrown only when the provider request
	 * itself fails (network error, auth failure, etc.); a missing key is
	 * **not** treated as an error.
	 *
	 * @param key - Storage key identifying the object to remove.
	 * @returns An `Effect` yielding `{ key, deleted }` on success, or failing
	 *   with {@link AdapterContractError} on provider-level failures.
	 */
	readonly deleteObject: (
		key: string
	) => Effect.Effect<
		{ readonly key: string; readonly deleted: boolean },
		AdapterContractError
	>;
}

/**
 * Adapter contract for inbound intake providers that normalize external payloads.
 */
export interface InboundAdapterContract extends AdapterContractBase<
	Readonly<Record<string, unknown>>
> {
	/** Adapter capability handled by this contract entry. */
	readonly capability: "inbound";
	/** Receives and normalizes an inbound provider payload. */
	readonly receive: (input: {
		/** Provider/source name used for ingestion routing and audit trails. */
		readonly source: string;
		/** Raw provider payload before normalization. */
		readonly payload: unknown;
	}) => Effect.Effect<
		{
			/** Stable source event/message identifier for idempotent ingestion. */
			readonly sourceId: string;
			/** Normalized receive timestamp used by lifecycle intake. */
			readonly receivedAt: string;
			/** Provider-agnostic normalized payload emitted to backend workflows. */
			readonly payload: Readonly<Record<string, unknown>>;
		},
		AdapterContractError
	>;
}

/**
 * Discriminated union of every runtime adapter contract variant.
 */
export type AnyAdapterContract =
	| NotificationAdapterContract
	| StorageAdapterContract
	| InboundAdapterContract;

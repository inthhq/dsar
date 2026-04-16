import type { S3Client as AwsS3Client } from "@aws-sdk/client-s3";
import type { AdapterHealth, StorageAdapterContract } from "@dsar/backend";
import { asRecord } from "@dsar/guards";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";

import { defaultS3StorageConfig, parseS3StorageAdapterConfig } from "./config";
import * as awsS3 from "./generated/s3";
import { buildS3ArtifactReference } from "./mappers/keys";
import { mapHeadObjectToMetadata } from "./mappers/metadata";
import type {
	S3AdapterInvocationError,
	S3ErrorCategory,
	S3StorageAdapterConfig,
} from "./types";
import { resolveStorageS3ErrorCatalogEntry } from "./types/error-codes";

class S3InvocationError extends Error implements S3AdapterInvocationError {
	readonly _tag = "AdapterInvocationError";
	readonly adapterKey = "storage-s3";
	readonly capability = "storage";
	readonly category: S3ErrorCategory;
	readonly retriable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: S3ErrorCategory;
		readonly details?: Readonly<Record<string, unknown>>;
		readonly message: string;
		readonly retriable: boolean;
	}) {
		super(input.message);
		this.name = "AdapterInvocationError";
		this.category = input.category;
		this.details = input.details;
		this.retriable = input.retriable;
	}
}

const CATEGORY_MATCHERS: readonly {
	readonly category: S3ErrorCategory;
	readonly tokens: readonly string[];
}[] = [
	{ category: "timeout", tokens: ["timeout", "timed out", "abort"] },
	{ category: "rate_limit", tokens: ["rate", "429", "throttle"] },
	{ category: "network", tokens: ["network", "socket", "connection"] },
	{
		category: "auth",
		tokens: ["unauthorized", "forbidden", "access denied", "signature"],
	},
	{
		category: "validation",
		tokens: ["invalid", "validation", "malformed", "missing required"],
	},
];

const classifyErrorCategory = (lower: string): S3ErrorCategory => {
	for (const matcher of CATEGORY_MATCHERS) {
		if (matcher.tokens.some((token) => lower.includes(token))) {
			return matcher.category;
		}
	}
	return "unknown";
};

const isRetriable = (category: S3ErrorCategory) =>
	category === "timeout" || category === "rate_limit" || category === "network";

const createS3InvocationError = (input: {
	readonly category: S3ErrorCategory;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
}): S3AdapterInvocationError => {
	const catalogEntry = resolveStorageS3ErrorCatalogEntry(
		input.category === "unknown"
			? "STORAGE_S3_UNCATALOGED_ERROR"
			: "STORAGE_S3_RUNTIME_ERROR"
	);
	return new S3InvocationError({
		category: input.category,
		details: {
			...input.details,
			docsUrl: catalogEntry.docsUrl,
			errorCode: catalogEntry.code,
			errorId: catalogEntry.id,
			status: catalogEntry.status,
		},
		message: input.message,
		retriable: isRetriable(input.category),
	});
};

/**
 * Converts an S3 provider error into a standardised
 * {@link S3AdapterInvocationError}, classifying it by category and
 * preserving the original message when available.
 *
 * @param error - The caught value — typically an AWS/MinIO SDK `Error`
 *   instance, but may be `unknown` for unexpected throw types.
 * @returns A normalised {@link S3AdapterInvocationError} with the
 *   classified category, retriability flag, and any extractable details
 *   from the original error.
 */
export const normalizeS3ProviderError = (
	error: unknown
): S3AdapterInvocationError => {
	const message =
		error instanceof Error ? error.message : "S3 adapter invocation failed.";
	const category = classifyErrorCategory(message.toLowerCase());
	return createS3InvocationError({
		category,
		details: asRecord(error),
		message,
	});
};

const nonEmpty = (value: string | undefined) =>
	value !== undefined && value.trim().length > 0 ? value : undefined;

const toMetadataHeaders = (input: {
	readonly requestId?: string;
	readonly manifestId?: string;
	readonly manifestHash?: string;
	readonly manifestSignature?: string;
}) => {
	const metadata: Record<string, string> = {};
	const entries: readonly (readonly [string, string | undefined])[] = [
		["request-id", nonEmpty(input.requestId)],
		["manifest-id", nonEmpty(input.manifestId)],
		["manifest-hash", nonEmpty(input.manifestHash)],
		["manifest-signature", nonEmpty(input.manifestSignature)],
	];
	for (const [key, value] of entries) {
		if (value) {
			metadata[key] = value;
		}
	}
	return metadata;
};

const getMetadataReference = (input: {
	readonly key: string;
	readonly source?: Record<string, string>;
	readonly fallback: {
		readonly requestId?: string;
		readonly manifestId?: string;
		readonly manifestHash?: string;
		readonly manifestSignature?: string;
	};
}) =>
	buildS3ArtifactReference({
		key: input.key,
		manifestHash:
			input.source?.["manifest-hash"] ?? input.fallback.manifestHash,
		manifestId: input.source?.["manifest-id"] ?? input.fallback.manifestId,
		manifestSignature:
			input.source?.["manifest-signature"] ?? input.fallback.manifestSignature,
		requestId: input.source?.["request-id"] ?? input.fallback.requestId,
	});

const makeClientConfig = (
	config: S3StorageAdapterConfig
): ConstructorParameters<typeof AwsS3Client>[0] => ({
	credentials:
		config.accessKeyId && config.secretAccessKey
			? {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey,
					sessionToken: config.sessionToken,
				}
			: undefined,
	endpoint: config.endpoint,
	forcePathStyle: config.forcePathStyle,
	maxAttempts: config.retryMaxAttempts,
	region: config.region,
});

type S3Action = Parameters<typeof awsS3.make>[0];

const runS3 = <M extends S3Action>(
	layer: Layer.Layer<awsS3.S3Client, never, never>,
	action: M,
	input: awsS3.S3MethodInput<M>
) =>
	awsS3.make(action, input).pipe(
		Effect.provide(layer),
		Effect.sandbox,
		Effect.mapError((cause) => {
			const error = normalizeS3ProviderError(Cause.squash(cause));
			return Object.assign(error, {
				details: { ...error.details, causeTrace: Cause.pretty(cause) },
			});
		})
	);

interface TransformToByteArrayBody {
	readonly transformToByteArray: () => Promise<Uint8Array>;
}

interface ArrayBufferBody {
	readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

const hasTransformToByteArray = (
	value: unknown
): value is TransformToByteArrayBody =>
	typeof value === "object" &&
	value !== null &&
	"transformToByteArray" in value &&
	typeof value.transformToByteArray === "function";

const hasArrayBuffer = (value: unknown): value is ArrayBufferBody =>
	typeof value === "object" &&
	value !== null &&
	"arrayBuffer" in value &&
	typeof value.arrayBuffer === "function";

const toBytes = async (body: unknown) => {
	if (body instanceof Uint8Array) {
		return body;
	}
	if (hasTransformToByteArray(body)) {
		return body.transformToByteArray();
	}
	if (hasArrayBuffer(body)) {
		const buffer = await body.arrayBuffer();
		return new Uint8Array(buffer);
	}
	return new Uint8Array();
};

const makeHealthFailure = (
	error: S3AdapterInvocationError,
	bucket: string
): {
	readonly ok: false;
	readonly status: "degraded" | "down";
	readonly details: Readonly<Record<string, unknown>>;
} => ({
	details: {
		bucket,
		error:
			typeof error === "object" && error !== null
				? error
				: { message: String(error) },
	},
	ok: false,
	status: error.retriable ? "degraded" : "down",
});

const toHealthyHealth = (input: {
	readonly bucket: string;
	readonly region: string;
}): AdapterHealth => ({
	details: {
		bucket: input.bucket,
		region: input.region,
	},
	ok: true,
	status: "healthy",
});

/**
 * Creates a {@link StorageAdapterContract} backed by an S3-compatible
 * object store (AWS S3, MinIO, etc.).
 *
 * Each adapter method returns a composed `Effect` that the caller must
 * run at the application boundary (e.g. with `Effect.runPromise`).
 * S3 provider failures are normalised into
 * {@link S3AdapterInvocationError} with classified category and
 * retriability.
 *
 * @param config - Adapter configuration including bucket name, region,
 *   endpoint, and optional prefix/retry settings. Missing optional
 *   fields are filled by {@link defaultS3StorageConfig}.
 * @param options - Optional overrides; supply `client` to use a
 *   pre-configured S3 client instead of constructing one from `config`.
 * @returns A storage adapter whose methods yield Effects — run them at
 *   the boundary rather than inside other Effect compositions.
 */
export const makeS3StorageAdapter = (
	config: S3StorageAdapterConfig,
	options?: {
		readonly client?: AwsS3Client;
	}
): StorageAdapterContract => {
	const resolved = defaultS3StorageConfig(config);
	const clientLayer = options?.client
		? Layer.succeed(awsS3.S3Client)(options.client)
		: awsS3.S3Client.Default(makeClientConfig(resolved));

	return {
		capability: "storage",
		deleteObject: (key) =>
			runS3(clientLayer, "delete_object", {
				Bucket: resolved.bucket,
				Key: key,
			}).pipe(Effect.map(() => ({ deleted: true, key }))),
		diagnostics: () =>
			Effect.succeed({
				capability: "storage",
				details: {
					bucket: resolved.bucket,
					endpoint: resolved.endpoint ?? null,
					prefix: resolved.prefix ?? null,
					region: resolved.region,
					retryMaxAttempts: resolved.retryMaxAttempts,
					timeoutMs: resolved.timeoutMs,
				},
				key: "storage-s3",
				version: "0.0.0",
			}),
		getObject: (key) =>
			runS3(clientLayer, "get_object", {
				Bucket: resolved.bucket,
				Key: key,
			}).pipe(
				Effect.flatMap((output) =>
					Effect.tryPromise({
						catch: normalizeS3ProviderError,
						try: () => toBytes(output.Body),
					}).pipe(
						Effect.map((bytes) => {
							const reference = getMetadataReference({
								fallback: {},
								key,
								source: output.Metadata,
							});
							return {
								bytes,
								contentType: output.ContentType ?? "application/octet-stream",
								key,
								metadata: mapHeadObjectToMetadata({
									head: {
										ChecksumSHA1: output.ChecksumSHA1,
										ChecksumSHA256: output.ChecksumSHA256,
										ContentLength: output.ContentLength,
										ContentType: output.ContentType,
										ETag: output.ETag,
										LastModified: output.LastModified,
									},
									key,
									reference,
								}),
							};
						})
					)
				)
			),
		headObject: (key) =>
			runS3(clientLayer, "head_object", {
				Bucket: resolved.bucket,
				Key: key,
			}).pipe(
				Effect.map((output) =>
					mapHeadObjectToMetadata({
						head: output,
						key,
						reference: getMetadataReference({
							fallback: {},
							key,
							source: output.Metadata,
						}),
					})
				)
			),
		healthCheck: () =>
			Effect.gen(function* s3HealthCheckProgram() {
				const result = yield* Effect.result(
					runS3(clientLayer, "head_bucket", {
						Bucket: resolved.bucket,
					}).pipe(
						Effect.map(() =>
							toHealthyHealth({
								bucket: resolved.bucket,
								region: resolved.region,
							})
						)
					)
				);
				if (Result.isFailure(result)) {
					return makeHealthFailure(result.failure, resolved.bucket);
				}
				return result.success;
			}),
		init: (_config) => Effect.void,
		key: "storage-s3",
		putObject: (input) =>
			runS3(clientLayer, "put_object", {
				Body: input.bytes,
				Bucket: resolved.bucket,
				ContentType: input.contentType,
				Key: input.key,
				Metadata: toMetadataHeaders({
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
				}),
			}).pipe(
				Effect.map((output) => ({
					key: input.key,
					metadata: {
						checksum: output.ETag?.replaceAll('"', ""),
						contentType: input.contentType,
						key: input.key,
						manifestHash: input.manifestHash,
						manifestId: input.manifestId,
						manifestSignature: input.manifestSignature,
						requestId: input.requestId,
						sizeBytes: input.bytes.byteLength,
					},
					reference: buildS3ArtifactReference({
						key: input.key,
						manifestHash: input.manifestHash,
						manifestId: input.manifestId,
						manifestSignature: input.manifestSignature,
						requestId: input.requestId,
					}),
				}))
			),
		validateConfig: (input) =>
			Effect.suspend(() => {
				const parsed = parseS3StorageAdapterConfig(input);
				if (Exit.isFailure(parsed)) {
					return Effect.fail({
						issues: {
							parseError: Cause.pretty(parsed.cause),
						},
						message: "Invalid S3 storage adapter configuration.",
					});
				}
				return Effect.void;
			}),
	};
};

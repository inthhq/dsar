import type { StorageAdapterContract } from "@dsar/backend";
import { asRecord } from "@dsar/guards";
import {
	BlobAccessError,
	BlobRequestAbortedError,
	BlobServiceNotAvailable,
	BlobServiceRateLimited,
	BlobStoreNotFoundError,
	BlobStoreSuspendedError,
	del,
	head,
	list,
	put,
} from "@vercel/blob";
import type { HeadBlobResult, PutBlobResult } from "@vercel/blob";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";

import {
	defaultVercelBlobStorageConfig,
	parseVercelBlobStorageAdapterConfig,
} from "./config";
import {
	buildVercelBlobArtifactKey,
	buildVercelBlobArtifactReference,
} from "./mappers/keys";
import { mapBlobHeadToMetadata } from "./mappers/metadata";
import type {
	VercelBlobAdapterInvocationError,
	VercelBlobArtifactReference,
	VercelBlobErrorCategory,
	VercelBlobStorageAdapterConfig,
} from "./types";
import { resolveStorageVercelBlobErrorCatalogEntry } from "./types/error-codes";

class VercelBlobInvocationError
	extends Error
	implements VercelBlobAdapterInvocationError
{
	readonly _tag = "AdapterInvocationError";
	readonly adapterKey = "storage-vercel-blob";
	readonly capability = "storage";
	readonly category: VercelBlobErrorCategory;
	readonly retriable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: VercelBlobErrorCategory;
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
	readonly category: VercelBlobErrorCategory;
	readonly tokens: readonly string[];
}[] = [
	{ category: "timeout", tokens: ["timeout", "timed out", "abort"] },
	{ category: "rate_limit", tokens: ["rate", "429", "throttle"] },
	{ category: "network", tokens: ["network", "socket", "connection"] },
	{
		category: "auth",
		tokens: ["unauthorized", "forbidden", "access denied", "token"],
	},
	{
		category: "validation",
		tokens: ["invalid", "validation", "malformed", "missing required"],
	},
];

const classifyByMessage = (message: string): VercelBlobErrorCategory => {
	const lower = message.toLowerCase();
	for (const matcher of CATEGORY_MATCHERS) {
		if (matcher.tokens.some((token) => lower.includes(token))) {
			return matcher.category;
		}
	}
	return "unknown";
};

const isRetriable = (category: VercelBlobErrorCategory) =>
	category === "timeout" || category === "rate_limit" || category === "network";

const createError = (input: {
	readonly catalogCode?: string;
	readonly category: VercelBlobErrorCategory;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
}): VercelBlobAdapterInvocationError => {
	const catalogEntry = resolveStorageVercelBlobErrorCatalogEntry(
		input.catalogCode ??
			(input.category === "unknown"
				? "STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR"
				: "STORAGE_VERCEL_BLOB_RUNTIME_ERROR")
	);
	return new VercelBlobInvocationError({
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
 * Maps a Vercel Blob provider error into a standardised
 * {@link VercelBlobAdapterInvocationError}, classifying it by category
 * (e.g. `rate_limit`, `auth`, `timeout`) and preserving the
 * original message and any extractable details.
 *
 * @param error - The caught value — typically a Vercel Blob SDK error
 *   instance, but may be `unknown` for unexpected throw types.
 * @returns A normalised error with classified category, retriability
 *   flag, catalog metadata, and provider details.
 */
export const normalizeVercelBlobProviderError = (
	error: unknown
): VercelBlobAdapterInvocationError => {
	if (error instanceof VercelBlobInvocationError) {
		return error;
	}
	if (error instanceof BlobServiceRateLimited) {
		return createError({
			category: "rate_limit",
			details: asRecord(error),
			message: error.message || "Vercel Blob rate limited request.",
		});
	}
	if (
		error instanceof BlobAccessError ||
		error instanceof BlobStoreNotFoundError ||
		error instanceof BlobStoreSuspendedError
	) {
		return createError({
			category: "auth",
			details: asRecord(error),
			message: error.message || "Vercel Blob authorization failed.",
		});
	}
	if (
		error instanceof BlobRequestAbortedError ||
		error instanceof BlobServiceNotAvailable
	) {
		return createError({
			category: "timeout",
			details: asRecord(error),
			message: error.message || "Vercel Blob request timed out.",
		});
	}
	const message =
		error instanceof Error
			? error.message
			: "Vercel Blob adapter invocation failed.";
	return createError({
		category: classifyByMessage(message),
		details: asRecord(error),
		message,
	});
};

interface BlobClient {
	readonly del: typeof del;
	readonly fetch: typeof fetch;
	readonly head: typeof head;
	readonly list: typeof list;
	readonly put: typeof put;
}

interface TimeoutOptions {
	readonly timeout: Duration.Duration;
}

const withTimeout = async <T>(
	run: (abortSignal: AbortSignal) => Promise<T>,
	options: TimeoutOptions
): Promise<T> => {
	const controller = new AbortController();
	const timeoutHandle = setTimeout(
		() => controller.abort(),
		Duration.toMillis(options.timeout)
	);
	try {
		return await run(controller.signal);
	} finally {
		clearTimeout(timeoutHandle);
	}
};

const toError = (error: unknown) =>
	error instanceof Error ? error : new Error(String(error));

const runWithRetry = async <T>(
	run: () => Promise<T>,
	retryMaxAttempts: number
): Promise<T> => {
	for (let attempt = 1; attempt <= retryMaxAttempts; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			const normalized = normalizeVercelBlobProviderError(error);
			if (!normalized.retriable) {
				throw toError(error);
			}
			if (attempt === retryMaxAttempts) {
				throw createError({
					catalogCode: "STORAGE_VERCEL_BLOB_RETRY_EXHAUSTED",
					category: "unknown",
					details: { lastError: toError(error).message },
					message: "Vercel Blob adapter retry failed.",
				});
			}
		}
	}
	throw createError({
		catalogCode: "STORAGE_VERCEL_BLOB_RETRY_EXHAUSTED",
		category: "unknown",
		message: "Vercel Blob adapter retry failed.",
	});
};

const parseReferenceFromKey = (key: string): VercelBlobArtifactReference => {
	const parts = key.split("/");
	return buildVercelBlobArtifactReference({
		key,
		manifestId: parts.length > 2 ? parts[2] : undefined,
		requestId: parts.length > 1 ? parts[1] : undefined,
	});
};

const mapPutResultToMetadata = (
	key: string,
	putResult: PutBlobResult,
	reference: VercelBlobArtifactReference,
	bytes: Uint8Array
) => {
	const uploadTime = new Date();
	const headLike = {
		cacheControl: "",
		contentDisposition: putResult.contentDisposition,
		contentType: putResult.contentType,
		downloadUrl: putResult.downloadUrl,
		etag: "",
		pathname: putResult.pathname,
		size: bytes.byteLength,
		uploadedAt: uploadTime,
		url: putResult.url,
	} satisfies HeadBlobResult;
	return mapBlobHeadToMetadata({
		head: headLike,
		key,
		reference,
	});
};

const healthSuccess = (
	prefix: string
): {
	readonly ok: true;
	readonly status: "healthy";
	readonly details: Readonly<Record<string, unknown>>;
} => ({
	details: { prefix, reachable: true },
	ok: true,
	status: "healthy",
});

const healthFailure = (
	prefix: string,
	normalized: VercelBlobAdapterInvocationError
): {
	readonly ok: false;
	readonly status: "degraded" | "down";
	readonly details: Readonly<Record<string, unknown>>;
} => ({
	details: {
		error: normalized,
		prefix,
		reachable: false,
	},
	ok: false,
	status: normalized.retriable ? "degraded" : "down",
});

const healthState = {
	failure: healthFailure,
	success: healthSuccess,
} satisfies {
	readonly success: typeof healthSuccess;
	readonly failure: typeof healthFailure;
};

const TIMEOUT_FLOOR_MS = 1000;

/**
 * Creates a {@link StorageAdapterContract} backed by Vercel Blob storage.
 * Provider errors are surfaced through
 * {@link normalizeVercelBlobProviderError}.
 *
 * @param config - Adapter configuration including token and
 *   optional prefix/retry settings. Missing optional fields are filled
 *   by defaults.
 * @param options - Optional overrides; supply `client` to use a
 *   pre-configured Blob client instead of constructing one from
 *   `config`.
 * @returns A storage adapter implementing get, put, delete, list, and
 *   health-check operations against the configured Vercel Blob store.
 */
export const makeVercelBlobStorageAdapter = (
	config: VercelBlobStorageAdapterConfig,
	options?: { readonly client?: BlobClient }
): StorageAdapterContract => {
	const resolved = {
		...defaultVercelBlobStorageConfig(),
		...config,
	};
	const client: BlobClient = options?.client ?? {
		del,
		fetch,
		head,
		list,
		put,
	};
	const references = new Map<string, VercelBlobArtifactReference>();
	const prefix = resolved.prefix ?? "artifacts";
	const retryMaxAttempts = Math.max(resolved.retryMaxAttempts ?? 1, 1);
	const timeout = Duration.millis(
		Math.max(resolved.timeoutMs ?? TIMEOUT_FLOOR_MS, TIMEOUT_FLOOR_MS)
	);

	const runBlob = <T>(op: () => Promise<T>) =>
		Effect.tryPromise({
			catch: normalizeVercelBlobProviderError,
			try: () => runWithRetry(op, retryMaxAttempts),
		});

	const getReference = (
		key: string,
		fallback?: {
			readonly requestId?: string;
			readonly manifestId?: string;
			readonly manifestHash?: string;
			readonly manifestSignature?: string;
			readonly url?: string;
		}
	): VercelBlobArtifactReference =>
		buildVercelBlobArtifactReference({
			...parseReferenceFromKey(key),
			...references.get(key),
			...fallback,
			key,
		});

	const getHead = (key: string) =>
		runBlob(() =>
			withTimeout(
				(signal) =>
					client.head(key, {
						abortSignal: signal,
						token: resolved.readWriteToken,
					}),
				{ timeout }
			)
		);

	return {
		capability: "storage",
		deleteObject: (key) =>
			runBlob(async () => {
				await withTimeout(
					(signal) =>
						client.del(key, {
							abortSignal: signal,
							token: resolved.readWriteToken,
						}),
					{ timeout }
				);
				references.delete(key);
				return { deleted: true, key };
			}),
		diagnostics: () =>
			Effect.succeed({
				capability: "storage",
				details: {
					addRandomSuffix: resolved.addRandomSuffix ?? false,
					allowOverwrite: resolved.allowOverwrite ?? false,
					hasReadWriteToken: Boolean(resolved.readWriteToken),
					prefix,
					retryMaxAttempts,
					timeoutMs: Duration.toMillis(timeout),
				},
				key: "storage-vercel-blob",
			}),
		getObject: (key) =>
			getHead(key).pipe(
				Effect.flatMap((headResult) =>
					runBlob(async () => {
						const response = await withTimeout(
							(signal) => client.fetch(headResult.url, { signal }),
							{ timeout }
						);
						if (!response.ok) {
							throw createError({
								catalogCode: "STORAGE_VERCEL_BLOB_FETCH_FAILED",
								category: "network",
								details: { httpStatus: response.status },
								message: `Failed to fetch blob payload (status ${response.status}).`,
							});
						}
						const bytes = new Uint8Array(await response.arrayBuffer());
						const reference = getReference(key, { url: headResult.url });
						return {
							bytes,
							contentType: headResult.contentType ?? "application/octet-stream",
							key,
							metadata: mapBlobHeadToMetadata({
								head: headResult,
								key,
								reference,
							}),
						};
					})
				)
			),
		headObject: (key) =>
			getHead(key).pipe(
				Effect.map((headResult) => {
					const reference = getReference(key, { url: headResult.url });
					return mapBlobHeadToMetadata({
						head: headResult,
						key,
						reference,
					});
				})
			),
		healthCheck: () =>
			Effect.gen(function* vercelBlobHealthCheckProgram() {
				const result = yield* Effect.result(
					Effect.tryPromise({
						catch: (error) => normalizeVercelBlobProviderError(error),
						try: async () => {
							await runWithRetry(
								() =>
									withTimeout(
										(signal) =>
											client.list({
												abortSignal: signal,
												limit: 1,
												prefix,
												token: resolved.readWriteToken,
											}),
										{ timeout }
									),
								retryMaxAttempts
							);
							return healthState.success(prefix);
						},
					})
				);
				if (Result.isFailure(result)) {
					return healthState.failure(prefix, result.failure);
				}
				return result.success;
			}),
		init: (_config) => Effect.void,
		key: "storage-vercel-blob",
		putObject: (input) =>
			runBlob(async () => {
				const key = buildVercelBlobArtifactKey(input, prefix);
				const putResult = await withTimeout(
					(signal) =>
						client.put(key, Buffer.from(input.bytes), {
							abortSignal: signal,
							access: "public",
							addRandomSuffix: resolved.addRandomSuffix ?? false,
							allowOverwrite: resolved.allowOverwrite ?? false,
							cacheControlMaxAge: resolved.cacheControlMaxAge,
							contentType: input.contentType,
							token: resolved.readWriteToken,
						}),
					{ timeout }
				);
				const reference = getReference(key, {
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
					url: putResult.url,
				});
				references.set(key, reference);
				return {
					key,
					metadata: mapPutResultToMetadata(
						key,
						putResult,
						reference,
						input.bytes
					),
					reference,
				};
			}),
		validateConfig: (input) =>
			Effect.suspend(() => {
				const parsed = parseVercelBlobStorageAdapterConfig(input);
				if (Exit.isFailure(parsed)) {
					return Effect.fail({
						issues: {
							parseError: Cause.pretty(parsed.cause),
						},
						message: "Invalid vercel blob storage adapter configuration.",
					});
				}
				return Effect.void;
			}),
	};
};

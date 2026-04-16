import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type { VercelBlobStorageAdapterConfig } from "./types";

const UrlSafePrefix = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter((value: string) =>
			value.length === 0 || !value.startsWith("/")
				? undefined
				: "prefix must not start with '/'"
		)
	)
);

/**
 * Effect schema used to validate Vercel Blob adapter configuration input.
 */
export const VercelBlobStorageAdapterConfigSchema = Schema.Struct({
	addRandomSuffix: Schema.optional(Schema.Boolean),
	allowOverwrite: Schema.optional(Schema.Boolean),
	cacheControlMaxAge: Schema.optional(
		Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
	),
	prefix: Schema.optional(UrlSafePrefix),
	readWriteToken: Schema.optional(Schema.NonEmptyString),
	retryMaxAttempts: Schema.optional(
		Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
	),
	timeoutMs: Schema.optional(
		Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))
	),
}) satisfies Schema.Schema<VercelBlobStorageAdapterConfig>;

/**
 * Returns default Vercel Blob adapter values for optional fields.
 *
 * @returns Config defaults for retry, timeout, prefix, and overwrite behavior.
 */
export const defaultVercelBlobStorageConfig =
	(): VercelBlobStorageAdapterConfig => ({
		addRandomSuffix: false,
		allowOverwrite: false,
		cacheControlMaxAge: undefined,
		prefix: "artifacts",
		readWriteToken: undefined,
		retryMaxAttempts: 3,
		timeoutMs: 10_000,
	});

/**
 * Decodes unknown input into a typed Vercel Blob storage adapter config.
 *
 * @param config - Untrusted configuration input.
 * @returns Exit containing parsed config or schema validation errors.
 */
export const parseVercelBlobStorageAdapterConfig = (
	config: unknown
): Exit.Exit<VercelBlobStorageAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(VercelBlobStorageAdapterConfigSchema)(config);

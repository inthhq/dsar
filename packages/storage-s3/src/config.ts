import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type { S3StorageAdapterConfig } from "./types";

const UrlString = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter((value: string) =>
			URL.canParse(value) ? undefined : "Expected a valid URL."
		)
	)
);

const PositiveNumber = Schema.Number.pipe(
	Schema.check(Schema.isGreaterThan(0))
);

/**
 * Effect schema used to validate raw S3 adapter configuration input.
 */
export const S3StorageAdapterConfigSchema = Schema.Struct({
	accessKeyId: Schema.optional(Schema.NonEmptyString),
	bucket: Schema.String.pipe(Schema.check(Schema.isMinLength(3))),
	endpoint: Schema.optional(UrlString),
	forcePathStyle: Schema.optional(Schema.Boolean),
	prefix: Schema.optional(Schema.String),
	region: Schema.NonEmptyString,
	retryMaxAttempts: Schema.optional(PositiveNumber),
	secretAccessKey: Schema.optional(Schema.NonEmptyString),
	sessionToken: Schema.optional(Schema.NonEmptyString),
	timeoutMs: Schema.optional(PositiveNumber),
});

/**
 * Decodes unknown input into a typed S3 storage adapter config.
 *
 * @param input - Untrusted configuration input.
 * @returns Exit containing parsed config or schema validation errors.
 */
export const parseS3StorageAdapterConfig = (
	input: unknown
): Exit.Exit<S3StorageAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(S3StorageAdapterConfigSchema)(input);

/**
 * Applies default S3 storage settings for omitted optional fields.
 *
 * @param config - Caller-provided S3 config values.
 * @returns Config with default retry, timeout, prefix, and path-style values.
 */
export const defaultS3StorageConfig = (
	config: S3StorageAdapterConfig
): Required<Pick<S3StorageAdapterConfig, "retryMaxAttempts" | "timeoutMs">> &
	S3StorageAdapterConfig => ({
	...config,
	forcePathStyle: config.forcePathStyle ?? false,
	prefix: config.prefix ?? "artifacts",
	retryMaxAttempts: config.retryMaxAttempts ?? 3,
	timeoutMs: config.timeoutMs ?? 3000,
});

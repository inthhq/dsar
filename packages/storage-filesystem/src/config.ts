import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type { FilesystemStorageAdapterConfig } from "./types";

const PositiveNumber = Schema.Number.pipe(
	Schema.check(Schema.isGreaterThan(0))
);

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
 * Effect schema used to validate filesystem storage adapter configuration.
 */
export const FilesystemStorageAdapterConfigSchema = Schema.Struct({
	baseDir: Schema.NonEmptyString,
	prefix: Schema.optional(UrlSafePrefix),
	retryMaxAttempts: Schema.optional(PositiveNumber),
}) satisfies Schema.Schema<FilesystemStorageAdapterConfig>;

/**
 * Returns default filesystem adapter values for optional fields.
 *
 * @returns Default values: `prefix` is `"artifacts"` and
 *   `retryMaxAttempts` is `1`.
 */
export const defaultFilesystemStorageConfig = (): Required<
	Pick<FilesystemStorageAdapterConfig, "prefix" | "retryMaxAttempts">
> => ({
	prefix: "artifacts",
	retryMaxAttempts: 1,
});

/**
 * Decodes unknown input into a typed filesystem storage config.
 *
 * @param input - Untrusted configuration input.
 * @returns Exit containing parsed config or schema validation errors.
 */
export const parseFilesystemStorageAdapterConfig = (
	input: unknown
): Exit.Exit<FilesystemStorageAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(FilesystemStorageAdapterConfigSchema)(input);

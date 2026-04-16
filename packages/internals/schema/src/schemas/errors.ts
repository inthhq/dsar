import * as Schema from "effect/Schema";

import { IsoTimestampSchema, MetadataSchema } from "./shared";

/**
 * Machine-readable error code string validated as a non-empty string
 * at API boundaries. Does not enforce membership in a predefined
 * allowlist; annotated with a diagnostic message for decode failures.
 */
export const ErrorCodeSchema = Schema.String.pipe(
	Schema.annotate({
		message:
			"SCHEMA_RUNTIME_ERROR: Invalid error code. See https://dsar-sdk.dev/errors/dsar-sch-1500",
	})
);

/**
 * Metadata envelope attached to every backend response, carrying
 * generation timestamp, trace IDs, and schema version.
 */
export const ResponseMetadataSchema = Schema.Struct({
	generatedAt: IsoTimestampSchema,
	metadata: MetadataSchema,
	requestId: Schema.optional(Schema.String),
	schemaVersion: Schema.optional(Schema.String),
	traceId: Schema.optional(Schema.String),
});

/**
 * Wire-format schema for error responses returned by all backend
 * endpoints, wrapping an error code/message and response metadata.
 */
export const ErrorEnvelopeSchema = Schema.Struct({
	error: Schema.Struct({
		code: ErrorCodeSchema,
		message: Schema.String,
		trace: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
		traceId: Schema.optional(Schema.String),
	}),
	meta: ResponseMetadataSchema,
});

/** Validated error response payload sent to API consumers. */
export type ErrorEnvelope = Schema.Schema.Type<typeof ErrorEnvelopeSchema>;
/** Validated response metadata attached to every backend reply. */
export type ResponseMetadata = Schema.Schema.Type<
	typeof ResponseMetadataSchema
>;

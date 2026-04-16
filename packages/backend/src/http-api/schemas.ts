import * as Schema from "effect/Schema";

import { ErrorCodeSchema } from "../types/error-codes";

export { ErrorCodeSchema } from "../types/error-codes";

/**
 * Shared metadata map for response envelopes.
 */
const EnvelopeMetaSchema = Schema.optional(
	Schema.Record(Schema.String, Schema.Unknown)
);

/**
 * Reusable success envelope schema for HttpApi/OpenAPI contracts.
 *
 * @typeParam S - Schema type extending `Schema.Top`.
 * @param data - Schema used for the `data` field of the success envelope.
 * @returns A `Schema.Struct` representing the success envelope with `ok`, `data`, and `meta` fields.
 */
export const successEnvelope = <S extends Schema.Top>(data: S) =>
	Schema.Struct({
		data,
		meta: EnvelopeMetaSchema,
		ok: Schema.Literal(true),
	});

/**
 * Reusable error envelope schema for HttpApi/OpenAPI contracts.
 */
export const ErrorEnvelopeSchema = Schema.Struct({
	error: Schema.Struct({
		code: ErrorCodeSchema,
		docsUrl: Schema.String,
		id: Schema.String,
		message: Schema.String,
		status: Schema.Number,
		trace: EnvelopeMetaSchema,
	}),
	ok: Schema.Literal(false),
});

import * as Schema from "effect/Schema";

import { ActorSchema, IsoTimestampSchema, MetadataSchema } from "./shared";

/**
 * Schema accepting only `"sha256"` — the single hash algorithm used for audit
 * event signing and chain verification.
 */
export const HashAlgorithmSchema = Schema.Literal("sha256");

/**
 * Schema for a single audit event in the hash-chain. Each event carries its
 * own hash, a back-pointer (`prevHash`) to the preceding event, and a
 * monotonic `sequence` number for ordering verification.
 */
export const AuditEventSchema = Schema.Struct({
	actor: Schema.optional(ActorSchema),
	eventType: Schema.String,
	hash: Schema.String,
	hashAlg: HashAlgorithmSchema,
	id: Schema.String,
	metadata: MetadataSchema,
	occurredAt: IsoTimestampSchema,
	prevHash: Schema.optional(Schema.String),
	requestId: Schema.String,
	sequence: Schema.Number,
});

/**
 * Schema for an audit export payload containing all events for a given
 * request, the export format (`jsonl` or `csv`), and an optional `rootHash`
 * for verifying chain integrity from the first event.
 */
export const AuditExportSchema = Schema.Struct({
	events: Schema.Array(AuditEventSchema),
	format: Schema.Literals(["jsonl", "csv"]),
	requestId: Schema.String,
	rootHash: Schema.optional(Schema.String),
});

/**
 * Decoded runtime type of a single audit event in the hash-chain.
 */
export type AuditEvent = Schema.Schema.Type<typeof AuditEventSchema>;

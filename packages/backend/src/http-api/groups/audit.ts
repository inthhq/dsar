import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { protectedOperation, s200 } from "../common";
import { successEnvelope } from "../schemas";

const AuditListItemSchema = Schema.Struct({
	action: Schema.String,
	actor: Schema.String,
	createdAt: Schema.String,
	hash: Schema.String,
	hashAlg: Schema.String,
	id: Schema.String,
	object: Schema.String,
	prevHash: Schema.optional(Schema.String),
	requestId: Schema.optional(Schema.String),
	sequence: Schema.Number,
});

const AuditExportEventSchema = Schema.Struct({
	actor: Schema.String,
	eventType: Schema.String,
	hash: Schema.String,
	hashAlg: Schema.String,
	id: Schema.String,
	metadata: Schema.Record(Schema.String, Schema.Unknown),
	occurredAt: Schema.String,
	prevHash: Schema.optional(Schema.String),
	requestId: Schema.String,
	sequence: Schema.Number,
});

/** OpenAPI group describing the operator-facing audit log endpoints. */
export const auditGroup = HttpApiGroup.make("audit", { topLevel: true })
	.add(
		protectedOperation(
			HttpApiEndpoint.get("audit_list", "/audit", {
				query: {
					actor: Schema.optional(Schema.String),
					created_after: Schema.optional(Schema.String),
					created_before: Schema.optional(Schema.String),
					cursor: Schema.optional(Schema.String),
					event_type: Schema.optional(Schema.String),
					limit: Schema.optional(Schema.NumberFromString),
					request_id: Schema.optional(Schema.String),
					subject_id: Schema.optional(Schema.String),
				},
				success: successEnvelope(
					Schema.Struct({
						items: Schema.Array(AuditListItemSchema),
						pagination: Schema.Struct({
							limit: Schema.Number,
							nextCursor: Schema.optional(Schema.String),
						}),
					})
				).pipe(s200),
			}),
			"List audit events"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("audit_export", "/audit/export", {
				query: {
					format: Schema.optional(Schema.Literals(["jsonl", "csv"])),
					since: Schema.String,
					until: Schema.optional(Schema.String),
				},
				success: successEnvelope(
					Schema.Struct({
						eventCount: Schema.Number,
						events: Schema.Array(AuditExportEventSchema),
						format: Schema.Literals(["jsonl", "csv"]),
						rootHash: Schema.optional(Schema.String),
						since: Schema.String,
						tipHash: Schema.optional(Schema.String),
						until: Schema.optional(Schema.String),
					})
				).pipe(s200),
			}),
			"Export tenant audit trail"
		)
	);

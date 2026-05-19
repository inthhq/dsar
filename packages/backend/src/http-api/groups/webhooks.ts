import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { WebhookRotateKeyPayloadSchema } from "../../webhook-schemas";
import { protectedOperation, publicOperation, s202 } from "../common";
import {
	SlackWebhookAcceptedResponseSchema,
	SlackWebhookChallengeResponseSchema,
} from "../request-schemas";
import { successEnvelope } from "../schemas";

const ResendWebhookPayloadSchema = Schema.Struct({
	created_at: Schema.String,
	data: Schema.Unknown,
	type: Schema.String,
});

const SlackWebhookPayloadSchema = Schema.Unknown;

const WebhookRotateKeyResponseSchema = Schema.Struct({
	activeKeyIds: Schema.Array(Schema.String),
	endpointId: Schema.String,
	newPrimaryKeyId: Schema.String,
	newSigningSecret: Schema.String,
	previousKeyExpiresAt: Schema.optional(Schema.String),
	previousKeyId: Schema.optional(Schema.String),
});

const WebhookDispatchSchema = Schema.Struct({
	attempt: Schema.Number,
	createdAt: Schema.String,
	destination: Schema.String,
	dispatchId: Schema.String,
	endpointId: Schema.optional(Schema.String),
	error: Schema.optional(Schema.String),
	eventId: Schema.String,
	eventType: Schema.optional(Schema.String),
	replayable: Schema.Boolean,
	requestId: Schema.String,
	responseCode: Schema.optional(Schema.Number),
	status: Schema.Literals(["pending", "delivered", "failed", "skipped"]),
});

const WebhookDispatchListResponseSchema = Schema.Struct({
	items: Schema.Array(WebhookDispatchSchema),
	limit: Schema.Number,
	offset: Schema.Number,
	total: Schema.Number,
});

const WebhookDispatchReplayResponseSchema = Schema.Struct({
	dispatchId: Schema.String,
	eventId: Schema.String,
	status: Schema.Literals(["replayed", "already_replayed"]),
});

/** OpenAPI group describing public inbound webhook endpoints. */
export const webhooksGroup = HttpApiGroup.make("webhooks", { topLevel: true })
	.add(
		publicOperation(
			HttpApiEndpoint.post(
				"webhooks_inbound_resend",
				"/webhooks/inbound/resend",
				{
					payload: ResendWebhookPayloadSchema,
					success: successEnvelope(
						Schema.Struct({
							id: Schema.optional(Schema.String),
							jurisdiction: Schema.optional(Schema.String),
							receivedAt: Schema.optional(Schema.String),
							sourceId: Schema.String,
							status: Schema.Literals(["captured", "ignored_non_dsar"]),
							tenantId: Schema.optional(Schema.String),
							workspaceId: Schema.optional(Schema.String),
						})
					).pipe(s202),
				}
			),
			"Receive Resend inbound webhook"
		)
	)
	.add(
		publicOperation(
			HttpApiEndpoint.post(
				"webhooks_inbound_slack",
				"/webhooks/inbound/slack",
				{
					payload: SlackWebhookPayloadSchema,
					success: [
						SlackWebhookChallengeResponseSchema,
						SlackWebhookAcceptedResponseSchema,
					],
				}
			),
			"Receive Slack inbound webhook"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"webhooks_endpoint_rotate_key",
				"/webhooks/endpoints/:id/rotate-key",
				{
					params: { id: Schema.String },
					payload: WebhookRotateKeyPayloadSchema,
					success: successEnvelope(WebhookRotateKeyResponseSchema),
				}
			),
			"Rotate webhook endpoint signing key"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("webhooks_dispatches_list", "/webhooks/dispatches", {
				query: {
					created_after: Schema.optional(Schema.String),
					created_before: Schema.optional(Schema.String),
					endpoint_id: Schema.optional(Schema.String),
					limit: Schema.optional(Schema.NumberFromString),
					offset: Schema.optional(Schema.NumberFromString),
					status: Schema.optional(Schema.String),
				},
				success: successEnvelope(WebhookDispatchListResponseSchema),
			}),
			"List outbound webhook dispatches"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"webhooks_dispatches_replay",
				"/webhooks/dispatches/:id/replay",
				{
					headers: { "x-idempotency-key": Schema.String },
					params: { id: Schema.String },
					success: successEnvelope(WebhookDispatchReplayResponseSchema).pipe(
						s202
					),
				}
			),
			"Replay outbound webhook dispatch"
		)
	);

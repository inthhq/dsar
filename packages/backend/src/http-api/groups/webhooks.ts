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
	);

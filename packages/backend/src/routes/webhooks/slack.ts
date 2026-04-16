import * as Effect from "effect/Effect";

import { backendErrorCatalogByCode } from "../../types/error-codes";
import { RequestValidationError } from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import { jsonResponse } from "../helpers";
import { captureInboundRequest } from "../inbound-capture";
import type { RouteDefinition } from "../types";
import { mapSlackInboundReceiveError, parseSlackPayload } from "./shared";

/** Route definition for receiving Slack inbound webhooks. */
export const slackWebhookRoute: RouteDefinition = {
	handler: ({ request }) =>
		Effect.gen(function* handler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const inbound = services.adapterRegistry.resolveInbound("slack");
			if (!inbound) {
				return yield* Effect.fail(
					new RequestValidationError({
						message: "Inbound adapter 'slack' is not configured.",
						reasonCode: backendErrorCatalogByCode.INTERNAL_RUNTIME_ERROR.code,
					})
				);
			}
			const rawBody = yield* Effect.tryPromise({
				catch: () =>
					new RequestValidationError({
						message: "Unable to read inbound Slack webhook body.",
						reasonCode:
							backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
					}),
				try: () => request.text(),
			});
			const received = yield* inbound
				.receive({
					payload: {
						headers: {
							contentType: request.headers.get("content-type") ?? undefined,
							signature: request.headers.get("x-slack-signature") ?? undefined,
							timestamp:
								request.headers.get("x-slack-request-timestamp") ?? undefined,
						},
						rawBody,
					},
					source: "slack:webhook",
				})
				.pipe(Effect.mapError(mapSlackInboundReceiveError));
			const slackPayload = parseSlackPayload(received.payload);
			if (slackPayload.kind === "url_verification") {
				return jsonResponse({ challenge: slackPayload.challenge }, 200);
			}
			return yield* captureInboundRequest({
				actor: "inbound-slack",
				idempotencyKey: `inbound-slack:${received.sourceId}:${slackPayload.route.tenantId}:${slackPayload.route.workspaceId ?? "*"}`,
				intakeSource: {
					channel: slackPayload.intakeSourceChannel,
					contact: slackPayload.requestor.email,
					rawContextRef: slackPayload.rawContextRef,
					rawText: slackPayload.text,
					receivedAt: received.receivedAt,
					type: "slack",
				},
				intent: slackPayload.intent,
				receivedAt: received.receivedAt,
				requestor: {
					email: slackPayload.requestor.email,
					name:
						slackPayload.requestor.name ??
						slackPayload.requestor.id ??
						"Slack user",
					type: "subject",
				},
				response: {
					callbackId: slackPayload.callbackId,
					channelId: slackPayload.channelId,
					surface: slackPayload.surface,
					teamId: slackPayload.teamId,
				},
				route: slackPayload.route,
				sourceId: received.sourceId,
			});
		}),
	method: "POST",
	path: "/webhooks/inbound/slack",
	protected: false,
	summary: "Receive Slack inbound webhook",
};

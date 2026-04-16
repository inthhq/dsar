import { asObject } from "@dsar/guards";
import * as Effect from "effect/Effect";

import { backendErrorCatalogByCode } from "../../types/error-codes";
import { RequestValidationError } from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import { captureInboundRequest } from "../inbound-capture";
import type { RouteDefinition } from "../types";
import { parseInboundPayload } from "./shared";

/** Route definition for receiving Resend inbound webhooks. */
export const resendWebhookRoute: RouteDefinition = {
	handler: ({ request }) =>
		Effect.gen(function* handler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const inbound = services.adapterRegistry.resolveInbound("resend");
			if (!inbound) {
				return yield* Effect.fail(
					new RequestValidationError({
						message: "Inbound adapter 'resend' is not configured.",
						reasonCode: backendErrorCatalogByCode.INTERNAL_RUNTIME_ERROR.code,
					})
				);
			}
			const rawBody = yield* Effect.tryPromise({
				catch: () =>
					new RequestValidationError({
						message: "Unable to read inbound webhook body.",
						reasonCode:
							backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
					}),
				try: () => request.text(),
			});
			const received = yield* inbound
				.receive({
					payload: {
						headers: {
							id: request.headers.get("svix-id") ?? undefined,
							signature: request.headers.get("svix-signature") ?? undefined,
							timestamp: request.headers.get("svix-timestamp") ?? undefined,
						},
						rawBody,
					},
					source: "resend:webhook",
				})
				.pipe(
					Effect.mapError((error) => {
						const details = asObject(error);
						return new RequestValidationError({
							details,
							message:
								details && "message" in details
									? String(details.message)
									: "Inbound webhook was rejected.",
							reasonCode:
								backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
						});
					})
				);
			const inboundPayload = parseInboundPayload(received.payload);
			return yield* captureInboundRequest({
				actor: "inbound-resend",
				idempotencyKey: `inbound-resend:${received.sourceId}:${inboundPayload.route.tenantId}:${inboundPayload.route.workspaceId ?? "*"}`,
				intakeSource: {
					channel: "inbound_email",
					contact: inboundPayload.fromEmail,
					rawText: inboundPayload.text ?? inboundPayload.subject,
					receivedAt: received.receivedAt,
					type: "inbound_email",
				},
				intent: {
					isDsar: inboundPayload.isDsar,
					reason: inboundPayload.reason,
				},
				receivedAt: received.receivedAt,
				requestor: {
					email: inboundPayload.fromEmail,
					name: inboundPayload.from,
					type: "subject",
				},
				response: {
					to: inboundPayload.to,
				},
				route: inboundPayload.route,
				sourceId: received.sourceId,
			});
		}),
	method: "POST",
	path: "/webhooks/inbound/resend",
	protected: false,
	summary: "Receive Resend inbound webhook",
};

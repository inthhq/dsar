import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type DeliveryRequestsApi = Pick<
	RequestsApi,
	| "artifactDownload"
	| "deliveryAddressVerify"
	| "deliveryLogs"
	| "deliveryPrepare"
	| "deliveryStepUpChallenge"
	| "deliveryStepUpComplete"
	| "fulfilmentCallback"
>;

/**
 * Creates the delivery and fulfilment endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints covering delivery preparation, logs, and callbacks.
 */
export const makeDeliveryRequestsApi = (
	ctx: EndpointContext
): DeliveryRequestsApi => ({
	artifactDownload: (requestId, artifactId, deliveryToken, options) =>
		ctx.call({
			method: "GET",
			options: {
				...options,
				headers: {
					...options?.headers,
					"x-delivery-token": deliveryToken,
				},
			},
			path: `/requests/${encodeURIComponent(requestId)}/artifacts/${encodeURIComponent(artifactId)}/download`,
		}),
	deliveryAddressVerify: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/delivery/address/verify`,
		}),
	deliveryLogs: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/delivery/logs`,
		}),
	deliveryPrepare: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/delivery/prepare`,
		}),
	deliveryStepUpChallenge: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/delivery/step-up/challenge`,
		}),
	deliveryStepUpComplete: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/delivery/step-up/complete`,
		}),
	fulfilmentCallback: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/fulfilment/callback`,
		}),
});

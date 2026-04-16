import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type CoreRequestsApi = Pick<
	RequestsApi,
	| "capture"
	| "clarificationReceive"
	| "clarificationRequest"
	| "clockExplain"
	| "close"
	| "create"
	| "createAcknowledgement"
	| "createExtension"
	| "fulfil"
	| "get"
	| "list"
	| "refuse"
	| "timeline"
>;

/**
 * Creates the core request-management endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request lifecycle endpoints covering create, capture, and status flows.
 */
export const makeCoreRequestsApi = (ctx: EndpointContext): CoreRequestsApi => ({
	capture: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/requests/capture",
		}),
	clarificationReceive: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/clarifications/receive`,
		}),
	clarificationRequest: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/clarifications/request`,
		}),
	clockExplain: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/clock/explain`,
		}),
	close: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/closures`,
		}),
	create: (payload, options) =>
		ctx.call({ body: payload, method: "POST", options, path: "/requests" }),
	createAcknowledgement: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/acknowledgements`,
		}),
	createExtension: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/extensions`,
		}),
	fulfil: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/fulfilment`,
		}),
	get: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${encodeURIComponent(requestId)}`,
		}),
	list: (query, options) =>
		ctx.call({
			method: "GET",
			options,
			path: "/requests",
			query: query as
				| Readonly<Record<string, string | number | boolean | undefined>>
				| undefined,
		}),
	refuse: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/refusals`,
		}),
	timeline: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/timeline`,
		}),
});

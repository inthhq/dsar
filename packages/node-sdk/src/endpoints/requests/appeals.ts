import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type AppealRequestsApi = Pick<
	RequestsApi,
	"appealsCreate" | "appealsDecide" | "appealsList"
>;

/**
 * Creates appeal-management endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints for creating, deciding, and listing appeals.
 */
export const makeAppealRequestsApi = (
	ctx: EndpointContext
): AppealRequestsApi => ({
	appealsCreate: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/appeals`,
		}),
	appealsDecide: (requestId, appealId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/appeals/${encodeURIComponent(appealId)}/decide`,
		}),
	appealsList: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${encodeURIComponent(requestId)}/appeals`,
		}),
});

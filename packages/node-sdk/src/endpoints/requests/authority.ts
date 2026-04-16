import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type AuthorityRequestsApi = Pick<
	RequestsApi,
	"approveAuthority" | "rejectAuthority" | "setRequestor" | "submitAuthority"
>;

/**
 * Creates the authority-related request endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints for authority submission, approval, and requestor updates.
 */
export const makeAuthorityRequestsApi = (
	ctx: EndpointContext
): AuthorityRequestsApi => ({
	approveAuthority: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${requestId}/authority/approve`,
		}),
	rejectAuthority: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${requestId}/authority/reject`,
		}),
	setRequestor: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "PUT",
			options,
			path: `/requests/${requestId}/requestor`,
		}),
	submitAuthority: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${requestId}/authority/submit`,
		}),
});

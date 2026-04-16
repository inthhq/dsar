import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type VerificationRequestsApi = Pick<
	RequestsApi,
	| "verificationApprove"
	| "verificationCase"
	| "verificationEvidence"
	| "verificationEvidenceUpload"
	| "verificationReject"
	| "verificationRequest"
>;

/**
 * Creates identity-verification endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints for verification cases, evidence, and decisions.
 */
export const makeVerificationRequestsApi = (
	ctx: EndpointContext
): VerificationRequestsApi => ({
	verificationApprove: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${requestId}/verification/approve`,
		}),
	verificationCase: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${requestId}/verification-case`,
		}),
	verificationEvidence: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${requestId}/verification/evidence`,
		}),
	verificationEvidenceUpload: (requestId, payload, options) =>
		ctx.call({
			body: payload.bytes,
			method: "POST",
			options: {
				...options,
				headers: {
					...options?.headers,
					"content-type": payload.contentType,
					"x-evidence-content-type": payload.contentType,
					"x-evidence-filename": encodeURIComponent(payload.fileName),
					...(payload.level ? { "x-evidence-level": payload.level } : {}),
				},
			},
			path: `/requests/${requestId}/verification/evidence/upload`,
		}),
	verificationReject: (requestId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/requests/${requestId}/verification/reject`,
		}),
	verificationRequest: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${requestId}/verification/request`,
		}),
});

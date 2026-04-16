import type { RequestsApi } from "../requests";
import type { EndpointContext } from "../types";

type ManifestRequestsApi = Pick<
	RequestsApi,
	| "manifestArtifactDownload"
	| "manifestArtifactReplace"
	| "manifestArtifactUpload"
	| "manifestGet"
	| "manifestValidate"
>;

/**
 * Creates fulfillment-manifest endpoints for the Node SDK.
 *
 * @param ctx - Shared endpoint context used to perform HTTP calls.
 * @returns Request endpoints for reading and mutating fulfillment manifests.
 */
export const makeManifestRequestsApi = (
	ctx: EndpointContext
): ManifestRequestsApi => ({
	manifestArtifactDownload: (requestId, artifactId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${requestId}/manifest/artifact/download`,
			query: { artifactId },
		}),
	manifestArtifactReplace: (requestId, artifactId, payload, options) =>
		ctx.call({
			body: payload.bytes,
			method: "PUT",
			options: {
				...options,
				headers: {
					...options?.headers,
					"content-type": payload.contentType,
					"x-artifact-content-type": payload.contentType,
					"x-artifact-filename": encodeURIComponent(payload.fileName),
				},
			},
			path: `/requests/${requestId}/manifest/artifact/${artifactId}/replace`,
		}),
	manifestArtifactUpload: (requestId, payload, options) =>
		ctx.call({
			body: payload.bytes,
			method: "POST",
			options: {
				...options,
				headers: {
					...options?.headers,
					"content-type": payload.contentType,
					"x-artifact-content-type": payload.contentType,
					"x-artifact-filename": encodeURIComponent(payload.fileName),
					...(payload.title
						? { "x-artifact-title": encodeURIComponent(payload.title) }
						: {}),
					...(payload.artifactType
						? { "x-artifact-type": payload.artifactType }
						: {}),
				},
			},
			path: `/requests/${requestId}/manifest/artifact/upload`,
		}),
	manifestGet: (requestId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${requestId}/manifest`,
		}),
	manifestValidate: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${requestId}/manifest/validate`,
		}),
});

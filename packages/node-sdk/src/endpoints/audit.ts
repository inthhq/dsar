import type { DsarResult, RequestOptions } from "../types";
import type {
	AuditExportResponse,
	AuditVerifyResponse,
	EndpointContext,
} from "./types";

/**
 * Audit operations for exporting and verifying immutable event chains.
 */
export interface AuditApi {
	/** Exports the audit event chain for a request as JSONL or CSV with a root hash for offline integrity checks. */
	readonly export: (
		requestId: string,
		format?: "jsonl" | "csv",
		options?: RequestOptions
	) => Promise<DsarResult<AuditExportResponse>>;
	/** Verifies hash-chain continuity, signature integrity, and sequence monotonicity for a request's audit trail. */
	readonly verify: (
		requestId: string,
		payload?: {
			readonly hash?: string;
			readonly prevHash?: string;
			readonly sequence?: number;
		},
		options?: RequestOptions
	) => Promise<DsarResult<AuditVerifyResponse>>;
}

/**
 * Creates the {@link AuditApi} surface bound to the given endpoint context.
 *
 * @param ctx - Shared endpoint context providing the authenticated HTTP caller.
 * @returns Audit API with `export` and `verify` operations.
 */
export const makeAuditApi = (ctx: EndpointContext): AuditApi => ({
	export: (requestId, format, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/requests/${requestId}/audit/export`,
			query: { format },
		}),
	verify: (requestId, payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: `/requests/${requestId}/audit/verify`,
		}),
});

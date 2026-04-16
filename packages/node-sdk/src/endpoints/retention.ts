import type { RetentionPolicy } from "@dsar/schema";

import type { DsarResult, RequestOptions } from "../types";
import type { EndpointContext } from "./types";

/**
 * SDK surface for managing tenant-level data-retention policies.
 */
export interface RetentionApi {
	/**
	 * Fetches all {@link RetentionPolicy} entries for a tenant.
	 *
	 * @param tenantId - Tenant whose retention policies are retrieved.
	 * @param options - Optional {@link RequestOptions} such as additional
	 *   headers and idempotency key.
	 * @returns A {@link DsarResult} containing the full list of retention
	 *   policies for the tenant.
	 */
	readonly get: (
		tenantId: string,
		options?: RequestOptions
	) => Promise<DsarResult<readonly RetentionPolicy[]>>;
	/**
	 * Creates or replaces a {@link RetentionPolicy} for a tenant.
	 *
	 * @param tenantId - Tenant to store the retention policy under.
	 * @param payload - Policy data; `class` is required, all other
	 *   {@link RetentionPolicy} fields are optional and default to the
	 *   server's current values when omitted.
	 * @param options - Optional {@link RequestOptions}.
	 * @returns A {@link DsarResult} containing the persisted
	 *   {@link RetentionPolicy}.
	 */
	readonly put: (
		tenantId: string,
		payload: Pick<RetentionPolicy, "class"> &
			Partial<Omit<RetentionPolicy, "class">>,
		options?: RequestOptions
	) => Promise<DsarResult<RetentionPolicy>>;
}

/**
 * Creates a {@link RetentionApi} bound to the given endpoint context.
 *
 * @param ctx - Shared {@link EndpointContext} providing the HTTP call helper
 *   and resolved SDK configuration.
 * @returns A {@link RetentionApi} instance whose methods issue HTTP requests
 *   through `ctx.call`.
 */
export const makeRetentionApi = (ctx: EndpointContext): RetentionApi => ({
	get: (tenantId, options) =>
		ctx.call({
			method: "GET",
			options,
			path: `/tenants/${tenantId}/retention`,
		}),
	put: (tenantId, payload, options) =>
		ctx.call({
			body: payload,
			method: "PUT",
			options,
			path: `/tenants/${tenantId}/retention`,
		}),
});

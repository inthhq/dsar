import type { DsarResult, RequestOptions } from "../types";
import type {
	CustomPolicyActivateResponse,
	CustomPolicyDeactivateResponse,
	CustomPolicyRegisterResponse,
	EndpointContext,
	PolicyUpgradeActionResponse,
	PolicyUpgradeProposalResponse,
} from "./types";

/**
 * Policy management operations including listing, upgrade lifecycle, and custom policy administration.
 */
export interface PoliciesApi {
	/** Lists active policy packs for the current request context. */
	readonly list: (
		options?: RequestOptions
	) => Promise<DsarResult<{ policies: readonly unknown[] }>>;
	/** Creates a policy-upgrade proposal with the supplied change payload. */
	readonly proposeUpgrade: (
		payload: Readonly<Record<string, unknown>>,
		options?: RequestOptions
	) => Promise<DsarResult<PolicyUpgradeProposalResponse>>;
	/** Approves a pending upgrade proposal identified by its proposal ID. */
	readonly approveUpgrade: (
		proposalId: string,
		options?: RequestOptions
	) => Promise<DsarResult<PolicyUpgradeActionResponse>>;
	/** Applies an approved upgrade proposal to the target policy. */
	readonly applyUpgrade: (
		proposalId: string,
		options?: RequestOptions
	) => Promise<DsarResult<PolicyUpgradeActionResponse>>;
	/** Registers a custom policy pack from the provided definition payload. */
	readonly customRegister: (
		payload: Readonly<Record<string, unknown>>,
		options?: RequestOptions
	) => Promise<DsarResult<CustomPolicyRegisterResponse>>;
	/** Activates a registered custom policy pack for the current tenant/workspace. */
	readonly customActivate: (
		payload: Readonly<Record<string, unknown>>,
		options?: RequestOptions
	) => Promise<DsarResult<CustomPolicyActivateResponse>>;
	/** Deactivates an active custom policy pack for the current tenant/workspace. */
	readonly customDeactivate: (
		payload: Readonly<Record<string, unknown>>,
		options?: RequestOptions
	) => Promise<DsarResult<CustomPolicyDeactivateResponse>>;
}

/**
 * Creates the {@link PoliciesApi} surface bound to the given endpoint context.
 *
 * @param ctx - Shared endpoint context providing the authenticated HTTP caller.
 * @returns Policies API with listing, upgrade lifecycle, and custom policy operations.
 */
export const makePoliciesApi = (ctx: EndpointContext): PoliciesApi => ({
	applyUpgrade: (proposalId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/policies/upgrades/${proposalId}/apply`,
		}),
	approveUpgrade: (proposalId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/policies/upgrades/${proposalId}/approve`,
		}),
	customActivate: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/policies/custom/activate",
		}),
	customDeactivate: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/policies/custom/deactivate",
		}),
	customRegister: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/policies/custom/register",
		}),
	list: (options) =>
		ctx.call({
			method: "GET",
			options,
			path: "/policies",
		}),
	proposeUpgrade: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/policies/upgrades/propose",
		}),
});

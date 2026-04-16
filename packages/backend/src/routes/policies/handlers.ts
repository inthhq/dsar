import { PolicyUpgrade } from "@dsar/policy-packs";
import * as Effect from "effect/Effect";

/**
 * Request payload for creating a policy upgrade proposal.
 */
export interface ProposeUpgradeRequest {
	/** Unique proposal identifier supplied by caller/workflow. */
	readonly proposalId: string;
	/** Tenant that owns the upgrade proposal. */
	readonly tenantId: string;
	/** Optional workspace scope under the tenant. */
	readonly workspaceId?: string;
	/** Currently pinned policy version. */
	readonly fromVersion: string;
	/** Target policy version to move to after approval. */
	readonly toVersion: string;
	/** Actor initiating the proposal. */
	readonly actor: string;
	/** Proposal timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Request payload for role-gated proposal approval.
 */
export interface ApproveUpgradeRequest {
	/** Proposal id being approved. */
	readonly proposalId: string;
	/** Identity of the approving actor. */
	readonly approverId: string;
	/** Role used for approval authorization checks. */
	readonly approverRole: string;
	/** Approval timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Request payload for applying an approved proposal.
 */
export interface ApplyUpgradeRequest {
	/** Approved proposal id being applied. */
	readonly proposalId: string;
	/** Actor applying the approved proposal. */
	readonly actor: string;
	/** Apply timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Bridges backend route input to the policy-upgrade Effect service.
 *
 * @param request - Proposal details including scope, version range, and actor.
 * @returns An `Effect` delegating to {@link PolicyUpgrade}.propose.
 */
export const proposePolicyUpgrade = (request: ProposeUpgradeRequest) =>
	Effect.flatMap(Effect.service(PolicyUpgrade), (upgrade) =>
		upgrade.propose({
			actor: request.actor,
			fromVersion: request.fromVersion,
			now: request.now,
			proposalId: request.proposalId,
			scope: {
				tenantId: request.tenantId,
				workspaceId: request.workspaceId,
			},
			toVersion: request.toVersion,
		})
	);

/**
 * Approves a previously proposed policy upgrade.
 *
 * @param request - Approval payload containing the proposal ID, approver
 *   identity and role, and timestamp.
 * @returns An `Effect` delegating to {@link PolicyUpgrade}.approve.
 */
export const approvePolicyUpgrade = (request: ApproveUpgradeRequest) =>
	Effect.flatMap(Effect.service(PolicyUpgrade), (upgrade) =>
		upgrade.approve({
			approverId: request.approverId,
			approverRole: request.approverRole,
			now: request.now,
			proposalId: request.proposalId,
		})
	);

/**
 * Applies an approved policy upgrade and updates active pinning.
 *
 * @param request - Apply payload containing the approved proposal ID, actor,
 *   and timestamp.
 * @returns An `Effect` delegating to {@link PolicyUpgrade}.apply.
 */
export const applyPolicyUpgrade = (request: ApplyUpgradeRequest) =>
	Effect.flatMap(Effect.service(PolicyUpgrade), (upgrade) =>
		upgrade.apply({
			actor: request.actor,
			now: request.now,
			proposalId: request.proposalId,
		})
	);

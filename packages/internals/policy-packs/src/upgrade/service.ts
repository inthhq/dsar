import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { PolicyPackDiff } from "../diff/service";
import { PolicyPinning } from "../pinning/service";
import { PolicyRegistry } from "../registry/service";
import type {
	ApprovalRole,
	PinRecord,
	PolicyScope,
	UpgradeProposalRecord,
} from "../types/domain";
import type { PolicyVersionNotFoundError } from "../types/errors";
import {
	UnauthorizedApproverError,
	UpgradeApprovalRequiredError,
	UpgradeProposalNotFoundError,
} from "../types/errors";
import { PolicyAudit } from "./audit";

const allowedApproverRoles: readonly ApprovalRole[] = [
	"admin",
	"compliance_admin",
];

/**
 * Input payload for creating an upgrade proposal.
 */
export interface ProposeUpgradeInput {
	/** Unique id for the new proposal. */
	readonly proposalId: string;
	/** Tenant/workspace scope where the upgrade will apply. */
	readonly scope: PolicyScope;
	/** Current version used as diff baseline. */
	readonly fromVersion: string;
	/** Target version requested for upgrade. */
	readonly toVersion: string;
	/** Actor creating the proposal. */
	readonly actor: string;
	/** Proposal timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Input payload for approval checks and proposal approval.
 */
export interface ApproveUpgradeInput {
	/** Identifier of the policy-upgrade proposal. */
	readonly proposalId: string;
	/** Identifier of the approver who authorized the upgrade. */
	readonly approverId: string;
	/** Approver role used by policy gate checks. */
	readonly approverRole: string;
	/** Approval timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Input payload for applying an approved proposal.
 */
export interface ApplyUpgradeInput {
	/** Approved proposal being applied. */
	readonly proposalId: string;
	/** Actor applying the proposal. */
	readonly actor: string;
	/** Apply timestamp in ISO-8601 form. */
	readonly now: string;
}

/**
 * Service contract for policy upgrade lifecycle operations.
 */
export interface PolicyUpgradeService {
	/** Creates a proposal and stores a categorized upgrade diff. */
	readonly propose: (
		input: ProposeUpgradeInput
	) => Effect.Effect<UpgradeProposalRecord, PolicyVersionNotFoundError>;
	/** Validates approver role and marks proposal approved. */
	readonly approve: (
		input: ApproveUpgradeInput
	) => Effect.Effect<
		UpgradeProposalRecord,
		UpgradeProposalNotFoundError | UnauthorizedApproverError
	>;
	/** Applies an approved proposal and updates active pinning. */
	readonly apply: (
		input: ApplyUpgradeInput
	) => Effect.Effect<
		UpgradeProposalRecord,
		UpgradeProposalNotFoundError | UpgradeApprovalRequiredError
	>;
	/** Reads a single proposal by id. */
	readonly get: (
		proposalId: string
	) => Effect.Effect<UpgradeProposalRecord, UpgradeProposalNotFoundError>;
}

/**
 * Effect tag for the policy upgrade lifecycle service.
 */
export class PolicyUpgrade extends Context.Service<
	PolicyUpgrade,
	PolicyUpgradeService
>()("PolicyUpgrade") {}

/**
 * In-memory implementation used by the runtime and tests.
 */
export const PolicyUpgradeLive = Layer.effect(PolicyUpgrade)(
	Effect.gen(function* PolicyUpgradeLive() {
		const proposals = yield* Ref.make(new Map<string, UpgradeProposalRecord>());
		const registry = yield* Effect.service(PolicyRegistry);
		const diffService = yield* Effect.service(PolicyPackDiff);
		const pinning = yield* Effect.service(PolicyPinning);
		const audit = yield* Effect.service(PolicyAudit);

		const getProposal = (proposalId: string) =>
			Ref.get(proposals).pipe(
				Effect.flatMap((current) => {
					const proposal = current.get(proposalId);
					if (!proposal) {
						return Effect.fail(
							new UpgradeProposalNotFoundError({ proposalId })
						);
					}
					return Effect.succeed(proposal);
				})
			);

		const persistProposal = (proposal: UpgradeProposalRecord) =>
			Ref.update(proposals, (current) =>
				new Map(current).set(proposal.id, proposal)
			);

		return {
			apply: (input) =>
				Effect.gen(function* apply() {
					const proposal = yield* getProposal(input.proposalId);
					if (proposal.status !== "approved") {
						return yield* Effect.fail(
							new UpgradeApprovalRequiredError({ proposalId: input.proposalId })
						);
					}

					const pin = {
						pinnedAt: input.now,
						pinnedBy: input.actor,
						policyVersion: proposal.toVersion,
						tenantId: proposal.tenantId,
						workspaceId: proposal.workspaceId,
					} satisfies PinRecord;
					yield* pinning.pinVersion(pin);

					const applied = {
						...proposal,
						appliedAt: input.now,
						status: "applied",
					} satisfies UpgradeProposalRecord;
					yield* persistProposal(applied);
					yield* audit.append({
						actor: input.actor,
						at: input.now,
						metadata: {
							clockBehaviorSummary: proposal.diff.clockBehaviorSummary,
						},
						policyVersion: proposal.toVersion,
						tenantId: proposal.tenantId,
						type: "policy_upgrade_applied",
						workspaceId: proposal.workspaceId,
					});
					return applied;
				}),
			approve: (input) =>
				Effect.gen(function* approve() {
					if (
						!allowedApproverRoles.includes(input.approverRole as ApprovalRole)
					) {
						return yield* Effect.fail(
							new UnauthorizedApproverError({
								actualRole: input.approverRole,
								requiredRoles: allowedApproverRoles,
							})
						);
					}

					const proposal = yield* getProposal(input.proposalId);
					const approved = {
						...proposal,
						approvedAt: input.now,
						approvedBy: input.approverId,
						status: "approved",
					} satisfies UpgradeProposalRecord;

					yield* persistProposal(approved);
					yield* audit.append({
						actor: input.approverId,
						at: input.now,
						policyVersion: proposal.toVersion,
						tenantId: proposal.tenantId,
						type: "policy_upgrade_approved",
						workspaceId: proposal.workspaceId,
					});
					return approved;
				}),
			get: getProposal,
			propose: (input) =>
				Effect.gen(function* propose() {
					const [fromPack, toPack] = yield* Effect.all([
						registry.getByVersion("global", input.fromVersion),
						registry.getByVersion("global", input.toVersion),
					]);
					const diff = yield* diffService.diff(fromPack.pack, toPack.pack);

					const proposal = {
						diff,
						fromVersion: input.fromVersion,
						id: input.proposalId,
						proposedAt: input.now,
						proposedBy: input.actor,
						status: "pending_approval",
						tenantId: input.scope.tenantId,
						toVersion: input.toVersion,
						workspaceId: input.scope.workspaceId,
					} satisfies UpgradeProposalRecord;

					yield* persistProposal(proposal);
					yield* audit.append({
						actor: input.actor,
						at: input.now,
						metadata: {
							clockBehaviorSummary: diff.clockBehaviorSummary,
							fromVersion: input.fromVersion,
							toVersion: input.toVersion,
						},
						tenantId: input.scope.tenantId,
						type: "policy_upgrade_proposed",
						workspaceId: input.scope.workspaceId,
					});
					return proposal;
				}),
		} satisfies PolicyUpgradeService;
	})
);

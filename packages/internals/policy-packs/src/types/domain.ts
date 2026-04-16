import type { PolicyPack } from "@dsar/policy-engine";

/**
 * Scope used for resolving tenant-level or workspace-level policy pinning.
 */
export type PolicyScope =
	| {
			/** Tenant that owns the active policy assignment scope. */
			readonly tenantId: string;
			/** Optional workspace for tenant-wide/default pin resolution. */
			readonly workspaceId?: string;
	  }
	| {
			/** Tenant that owns this workspace-specific policy scope. */
			readonly tenantId: string;
			/** Workspace receiving an explicit version override. */
			readonly workspaceId: string;
	  };

/**
 * Immutable registry record for a published policy pack version.
 */
export interface PolicyPackVersionRecord {
	/** Human-readable pack family name. */
	readonly name: string;
	/** Jurisdiction scope this pack version applies to. */
	readonly jurisdiction: string;
	/** Semantic version identifier for the pack. */
	readonly version: string;
	/** Immutable checksum of serialized pack content. */
	readonly checksum: string;
	/** Version changelog and compatibility details used in publish governance. */
	readonly metadata: PolicyPackVersionMetadata;
	/** Publication timestamp for auditability. */
	readonly publishedAt: string;
	/** Canonical policy-pack payload used for evaluation/diff. */
	readonly pack: PolicyPack;
}

/**
 * Version compatibility bump level aligned with semantic versioning.
 */
export type CompatibilityLevel = "major" | "minor" | "patch";

/**
 * Immutable metadata required for every published policy pack version.
 */
export interface PolicyPackVersionMetadata {
	/** Human-readable changelog text for this specific release. */
	readonly changelog: string;
	/** Compatibility guidance for adopters before upgrading. */
	readonly compatibilityNotes: string;
	/** Declared semver bump classification for publication checks. */
	readonly releaseType: CompatibilityLevel;
}

/**
 * Active policy version assignment for a tenant or workspace.
 */
export interface PinRecord {
	/** Tenant receiving this policy assignment. */
	readonly tenantId: string;
	/** Optional workspace override within the tenant. */
	readonly workspaceId?: string;
	/** Version pinned as the active policy for the scope. */
	readonly policyVersion: string;
	/** Timestamp when this policy version was pinned. */
	readonly pinnedAt: string;
	/** Actor that performed the pin operation. */
	readonly pinnedBy: string;
}

/**
 * High-level legal-impact group for policy upgrade diffs.
 */
export type DiffCategory =
	| "deadline_changes"
	| "verification_changes"
	| "appeals_changes"
	| "retention_changes"
	| "communication_changes";

/**
 * Single human-readable diff entry for upgrade review workflows.
 */
export interface PolicyDiffItem {
	/** Legal-impact category for reviewer grouping. */
	readonly category: DiffCategory;
	/** Dot-path of changed field in the policy structure. */
	readonly path: string;
	/** Previous value before upgrade. */
	readonly from: unknown;
	/** New value after upgrade. */
	readonly to: unknown;
	/** Reviewer-facing explanation of why this change matters. */
	readonly message: string;
}

/**
 * Full upgrade diff payload between two policy versions.
 */
export interface PolicyUpgradeDiff {
	/** Source policy version in the comparison. */
	readonly fromVersion: string;
	/** Target policy version in the comparison. */
	readonly toVersion: string;
	/** Detailed list of changed fields and impact descriptions. */
	readonly items: readonly PolicyDiffItem[];
	/** Quick summary of clock-behavior deltas for approvals/audit. */
	readonly clockBehaviorSummary: readonly string[];
}

/**
 * Lifecycle state of an upgrade proposal.
 */
export type UpgradeProposalStatus =
	| "pending_approval"
	| "approved"
	| "applied"
	| "rejected";

/**
 * Persisted record for a propose/approve/apply policy upgrade flow.
 */
export interface UpgradeProposalRecord {
	/** Unique identifier for the proposal record. */
	readonly id: string;
	/** Tenant scope of the proposal. */
	readonly tenantId: string;
	/** Optional workspace scope for workspace-level upgrades. */
	readonly workspaceId?: string;
	/** Version currently in use before apply. */
	readonly fromVersion: string;
	/** Version requested for upgrade. */
	readonly toVersion: string;
	/** Current proposal lifecycle status. */
	readonly status: UpgradeProposalStatus;
	/** Actor that created the proposal. */
	readonly proposedBy: string;
	/** Timestamp when this upgrade was proposed. */
	readonly proposedAt: string;
	/** Approver identity when approved. */
	readonly approvedBy?: string;
	/** Timestamp when this upgrade was approved. */
	readonly approvedAt?: string;
	/** Apply timestamp once successfully applied. */
	readonly appliedAt?: string;
	/** Captured diff payload used in approval and audit flows. */
	readonly diff: PolicyUpgradeDiff;
}

/**
 * Audit event emitted by policy lifecycle actions.
 */
export interface AuditEvent {
	/** Lifecycle event name emitted by policy workflows. */
	readonly type:
		| "policy_pack_published"
		| "policy_pack_pinned"
		| "custom_policy_registered"
		| "custom_policy_activated"
		| "custom_policy_deactivated"
		| "policy_upgrade_proposed"
		| "policy_upgrade_approved"
		| "policy_upgrade_applied";
	/** Timestamp when this audit event occurred. */
	readonly at: string;
	/** Actor responsible for the event. */
	readonly actor: string;
	/** Tenant context for scoped events. */
	readonly tenantId?: string;
	/** Optional workspace context for scoped events. */
	readonly workspaceId?: string;
	/** Related policy version, when applicable. */
	readonly policyVersion?: string;
	/** Additional safe metadata for audit explainability. */
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Roles that can approve policy upgrades in the default model.
 */
export type ApprovalRole = "admin" | "compliance_admin";

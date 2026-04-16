import * as Data from "effect/Data";

import type { PolicyPacksErrorCode } from "./error-codes";

interface PolicyPacksCatalogMetadata {
	readonly code?: PolicyPacksErrorCode;
	readonly docsUrl?: string;
	readonly id?: string;
}

/**
 * Thrown when a policy pack version already exists in the registry
 * (carries `version`).
 */
export class PolicyVersionAlreadyExistsError extends Data.TaggedError(
	"PolicyVersionAlreadyExistsError"
)<PolicyPacksCatalogMetadata & { readonly version: string }> {}

/**
 * Thrown when the requested policy pack version does not exist in the registry
 * (carries `version`).
 */
export class PolicyVersionNotFoundError extends Data.TaggedError(
	"PolicyVersionNotFoundError"
)<PolicyPacksCatalogMetadata & { readonly version: string }> {}

/**
 * Thrown when an operation targets a policy version that is currently pinned
 * (carries `version`).
 */
export class PolicyVersionPinnedError extends Data.TaggedError(
	"PolicyVersionPinnedError"
)<
	PolicyPacksCatalogMetadata & {
		readonly version: string;
	}
> {}

/**
 * Thrown when a policy pack document fails schema validation
 * (carries `message`).
 */
export class InvalidPolicyPackSchemaError extends Data.TaggedError(
	"InvalidPolicyPackSchemaError"
)<PolicyPacksCatalogMetadata & { readonly message: string }> {}

/**
 * Thrown when a policy pack's computed checksum does not match the expected
 * value (carries `expected` and `actual` hashes).
 */
export class PolicyChecksumMismatchError extends Data.TaggedError(
	"PolicyChecksumMismatchError"
)<
	PolicyPacksCatalogMetadata & {
		readonly expected: string;
		readonly actual: string;
	}
> {}

/**
 * Thrown when the checksum computation itself fails (e.g. `subtle.digest`
 * unavailable), as opposed to a mismatch between two known hashes.
 */
export class PolicyChecksumComputationError extends Data.TaggedError(
	"PolicyChecksumComputationError"
)<PolicyPacksCatalogMetadata & { readonly cause: string }> {}

/**
 * Thrown when policy version metadata is invalid or incomplete
 * (carries `message`).
 */
export class PolicyVersionMetadataError extends Data.TaggedError(
	"PolicyVersionMetadataError"
)<PolicyPacksCatalogMetadata & { readonly message: string }> {}

/**
 * Thrown when the referenced upgrade proposal does not exist
 * (carries `proposalId`).
 */
export class UpgradeProposalNotFoundError extends Data.TaggedError(
	"UpgradeProposalNotFoundError"
)<PolicyPacksCatalogMetadata & { readonly proposalId: string }> {}

/**
 * Thrown when a proposal requires approval before it can be applied
 * (carries `proposalId`).
 */
export class UpgradeApprovalRequiredError extends Data.TaggedError(
	"UpgradeApprovalRequiredError"
)<PolicyPacksCatalogMetadata & { readonly proposalId: string }> {}

/**
 * Thrown when the caller's role is not authorised for the requested operation
 * (carries `requiredRoles` and `actualRole`).
 */
export class UnauthorizedApproverError extends Data.TaggedError(
	"UnauthorizedApproverError"
)<
	PolicyPacksCatalogMetadata & {
		readonly requiredRoles: readonly string[];
		readonly actualRole: string;
	}
> {}

/**
 * Thrown when no policy pack maps to the given jurisdiction and scope
 * (carries `jurisdiction`, `tenantId`, and `guidanceKeys`).
 */
export class UnmappedJurisdictionError extends Data.TaggedError(
	"UnmappedJurisdictionError"
)<
	PolicyPacksCatalogMetadata & {
		readonly jurisdiction: string;
		readonly tenantId: string;
		readonly workspaceId?: string;
		readonly guidanceKeys: readonly string[];
		readonly message: string;
	}
> {}

/**
 * Thrown when no active policy pin exists for the target scope
 * (carries `tenantId` and optional `workspaceId`).
 */
export class PolicyActivationNotFoundError extends Data.TaggedError(
	"PolicyActivationNotFoundError"
)<
	PolicyPacksCatalogMetadata & {
		readonly tenantId: string;
		readonly workspaceId?: string;
	}
> {}

/**
 * Union of all error types produced by the policy-packs subsystem.
 */
export type PolicyPacksError =
	| PolicyVersionAlreadyExistsError
	| PolicyVersionNotFoundError
	| PolicyVersionPinnedError
	| InvalidPolicyPackSchemaError
	| PolicyChecksumMismatchError
	| PolicyChecksumComputationError
	| PolicyVersionMetadataError
	| UpgradeProposalNotFoundError
	| UpgradeApprovalRequiredError
	| UnauthorizedApproverError
	| UnmappedJurisdictionError
	| PolicyActivationNotFoundError;

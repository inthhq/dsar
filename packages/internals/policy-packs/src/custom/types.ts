import type { PolicyPack } from "@dsar/policy-engine";

import type { PolicyPackVersionMetadata, PolicyScope } from "../types/domain";

/**
 * Role values authorized to manage custom policy packs.
 */
export type CustomPolicyRole = "admin" | "compliance_admin";

/**
 * Input payload for registering a custom policy-pack version.
 */
export interface RegisterCustomPolicyPackInput {
	/** Identity of the actor performing the registration. */
	readonly actor: string;
	/** Role asserted by the caller for authorisation checks. */
	readonly role: string;
	/** Jurisdiction code scoping where the pack is available. */
	readonly jurisdiction: string;
	/** Logical name of the custom policy pack (must be unique per
	 *  jurisdiction). */
	readonly name: string;
	/** Version identifier being registered. */
	readonly version: string;
	/** Full {@link PolicyPack} document to publish in the registry. */
	readonly pack: PolicyPack;
	/** {@link PolicyPackVersionMetadata} used by governance and changelog
	 *  tooling. */
	readonly metadata: PolicyPackVersionMetadata;
	/** ISO-8601 timestamp when this policy version was published. */
	readonly publishedAt: string;
}

/**
 * Input payload for activating a custom policy-pack version.
 */
export interface ActivateCustomPolicyPackInput {
	/** Identity of the actor performing the activation. */
	readonly actor: string;
	/** Role asserted by the caller for authorisation checks. */
	readonly role: string;
	/** Jurisdiction code identifying the policy pack to activate. */
	readonly jurisdiction: string;
	/** Version identifier to pin as active. */
	readonly version: string;
	/** {@link PolicyScope} (tenant/workspace) where the pin is applied. */
	readonly scope: PolicyScope;
	/** ISO-8601 timestamp recorded in the activation audit event. */
	readonly now: string;
}

/**
 * Input payload for deactivating a custom policy-pack version.
 */
export interface DeactivateCustomPolicyPackInput {
	/** Identity of the actor performing the deactivation. */
	readonly actor: string;
	/** Role asserted by the caller for authorisation checks. */
	readonly role: string;
	/** {@link PolicyScope} (tenant/workspace) to unpin. */
	readonly scope: PolicyScope;
	/** ISO-8601 timestamp recorded in the deactivation audit event. */
	readonly now: string;
}

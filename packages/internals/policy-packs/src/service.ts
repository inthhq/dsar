import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { PolicyPackDiffLive } from "./diff/service";
import { PolicyPinning, PolicyPinningLive } from "./pinning/service";
import { computePolicyPackChecksum } from "./registry/checksum";
import { PolicyRegistry, PolicyRegistryLive } from "./registry/service";
import type {
	PinRecord,
	PolicyPackVersionRecord,
	PolicyPackVersionMetadata,
	PolicyScope,
} from "./types/domain";
import { resolvePolicyPacksErrorCatalogEntry } from "./types/error-codes";
import {
	PolicyVersionPinnedError,
	UnmappedJurisdictionError,
} from "./types/errors";
import type {
	PolicyPacksError,
	PolicyChecksumComputationError,
} from "./types/errors";
import { PolicyAudit, PolicyAuditLive } from "./upgrade/audit";
import { PolicyUpgrade, PolicyUpgradeLive } from "./upgrade/service";

/**
 * Base layer: registry, pinning, diff, and audit. Provides the infrastructure
 * that the upgrade feature module depends on.
 */
const PolicyPacksBaseLayer = Layer.mergeAll(
	PolicyRegistryLive,
	PolicyPinningLive,
	PolicyPackDiffLive,
	PolicyAuditLive
);

/**
 * Feature module: upgrade orchestration depends on the base layer.
 */
const PolicyUpgradeModuleLive = Layer.provide(
	PolicyUpgradeLive,
	PolicyPacksBaseLayer
);

/**
 * Composite Effect `Layer` providing the full policy-packs runtime. Composes
 * the base layer (registry, pinning, diff, audit) with the upgrade module.
 */
export const PolicyPacksLive = Layer.mergeAll(
	PolicyPacksBaseLayer,
	PolicyUpgradeModuleLive
);

/**
 * Publishes a policy-pack version and records an audit event.
 *
 * @param record - Policy-pack version record to publish.
 * @param actor - Actor id recorded in the audit trail.
 * @returns Effect that publishes the version and appends an audit event.
 */
export const publishPolicyPackVersion = (
	record: PolicyPackVersionRecord,
	actor: string
): Effect.Effect<void, PolicyPacksError, PolicyRegistry | PolicyAudit> =>
	Effect.gen(function* publishPolicyPackVersion() {
		const registry = yield* Effect.service(PolicyRegistry);
		const audit = yield* Effect.service(PolicyAudit);
		yield* registry.publish(record);
		yield* audit.append({
			actor,
			at: record.publishedAt,
			metadata: {
				checksum: record.checksum,
				jurisdiction: record.jurisdiction,
			},
			policyVersion: record.version,
			type: "policy_pack_published",
		});
	});

/**
 * Input required to build a persisted policy-pack version record.
 */
export interface CreatePolicyPackVersionRecordInput {
	/** Logical pack name, for example `us-state-default`. */
	readonly name: string;
	/** Jurisdiction code the pack version applies to. */
	readonly jurisdiction: string;
	/** Semantic version label for this pack release. */
	readonly version: string;
	/** Concrete policy-pack payload to checksum and persist. */
	readonly pack: PolicyPackVersionRecord["pack"];
	/** Release metadata used for registry and changelog display. */
	readonly metadata: PolicyPackVersionMetadata;
	/** Timestamp when this policy version was published. */
	readonly publishedAt: string;
}

/**
 * Creates a persisted policy-pack version record with computed checksum.
 *
 * @param input - Source values for the new policy-pack version record.
 * @returns Effect that yields the finalized version record.
 */
export const createPolicyPackVersionRecord = (
	input: CreatePolicyPackVersionRecordInput
): Effect.Effect<PolicyPackVersionRecord, PolicyChecksumComputationError> =>
	Effect.map(computePolicyPackChecksum(input.pack), (checksum) => ({
		checksum,
		jurisdiction: input.jurisdiction,
		metadata: input.metadata,
		name: input.name,
		pack: input.pack,
		publishedAt: input.publishedAt,
		version: input.version,
	}));

/**
 * Pins a policy version for a scope and records an audit event.
 *
 * @param pin - Pin record describing tenant/workspace/version scope.
 * @returns Effect that persists the pin and appends an audit event.
 */
export const pinPolicyVersion = (
	pin: PinRecord
): Effect.Effect<void, never, PolicyPinning | PolicyAudit> =>
	Effect.gen(function* pinPolicyVersion() {
		const pinning = yield* Effect.service(PolicyPinning);
		const audit = yield* Effect.service(PolicyAudit);
		yield* pinning.pinVersion(pin);
		yield* audit.append({
			actor: pin.pinnedBy,
			at: pin.pinnedAt,
			policyVersion: pin.policyVersion,
			tenantId: pin.tenantId,
			type: "policy_pack_pinned",
			workspaceId: pin.workspaceId,
		});
	});

/**
 * Resolves the effective pinned policy version for a scope, if any.
 *
 * @param scope - Tenant/workspace scope to resolve.
 * @returns Effect yielding the pinned version, or `undefined` when none exists.
 */
export const resolveEffectivePolicyVersion = (
	scope: PolicyScope
): Effect.Effect<string | undefined, never, PolicyPinning> =>
	Effect.flatMap(Effect.service(PolicyPinning), (pinning) =>
		pinning.resolveEffectiveVersion(scope)
	);

const defaultGuidanceKeys = [
	"subject_contact_admin",
	"admin_register_policy_pack",
	"admin_activate_policy_pack",
] as const;
const POLICY_PACKS_RUNTIME_ERROR = resolvePolicyPacksErrorCatalogEntry(
	"POLICY_PACKS_RUNTIME_ERROR"
);

const parseSemver = (
	version: string
): readonly [major: number, minor: number, patch: number] | undefined => {
	const segments = version.split(".");
	const [majorRaw, minorRaw, patchRaw] = segments;
	if (
		segments.length !== 3 ||
		majorRaw === undefined ||
		minorRaw === undefined ||
		patchRaw === undefined
	) {
		return undefined;
	}
	const major = Number.parseInt(majorRaw, 10);
	const minor = Number.parseInt(minorRaw, 10);
	const patch = Number.parseInt(patchRaw, 10);
	if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
		return undefined;
	}
	return [major, minor, patch];
};

const compareSemver = (left: string, right: string) => {
	const parsedLeft = parseSemver(left);
	const parsedRight = parseSemver(right);
	if (!parsedLeft || !parsedRight) {
		return left.localeCompare(right);
	}
	const [leftMajor, leftMinor, leftPatch] = parsedLeft;
	const [rightMajor, rightMinor, rightPatch] = parsedRight;
	if (leftMajor !== rightMajor) {
		return leftMajor - rightMajor;
	}
	if (leftMinor !== rightMinor) {
		return leftMinor - rightMinor;
	}
	return leftPatch - rightPatch;
};

const unmappedJurisdictionError = (input: {
	readonly jurisdiction: string;
	readonly scope: PolicyScope;
	readonly message: string;
}): UnmappedJurisdictionError =>
	new UnmappedJurisdictionError({
		code: POLICY_PACKS_RUNTIME_ERROR.code,
		docsUrl: POLICY_PACKS_RUNTIME_ERROR.docsUrl,
		guidanceKeys: defaultGuidanceKeys,
		id: POLICY_PACKS_RUNTIME_ERROR.id,
		jurisdiction: input.jurisdiction,
		message: input.message,
		tenantId: input.scope.tenantId,
		workspaceId: input.scope.workspaceId,
	});

/**
 * Resolves the active policy pack for a jurisdiction within a tenant/workspace scope.
 *
 * @param input - Jurisdiction and scope used to resolve the effective version.
 * @returns Effect that yields the active policy-pack record.
 * @throws UnmappedJurisdictionError when no active or pinned version is available.
 */
export const resolveActivePolicyPack = (input: {
	readonly jurisdiction: string;
	readonly scope: PolicyScope;
}): Effect.Effect<
	PolicyPackVersionRecord,
	UnmappedJurisdictionError,
	PolicyPinning | PolicyRegistry
> =>
	Effect.gen(function* resolveActivePolicyPack() {
		const version = yield* resolveEffectivePolicyVersion(input.scope);
		const registry = yield* Effect.service(PolicyRegistry);
		const resolvedVersion =
			version ??
			(yield* registry.listByJurisdiction(input.jurisdiction).pipe(
				Effect.flatMap((records) => {
					const sorted = records.toSorted((left, right) =>
						compareSemver(right.version, left.version)
					);
					const [active] = sorted;
					return active
						? Effect.succeed(active.version)
						: Effect.fail(
								unmappedJurisdictionError({
									jurisdiction: input.jurisdiction,
									message: `No policy pack is available for jurisdiction ${input.jurisdiction}.`,
									scope: input.scope,
								})
							);
				})
			));
		return yield* registry
			.getByVersion(input.jurisdiction, resolvedVersion)
			.pipe(
				Effect.mapError(() =>
					unmappedJurisdictionError({
						jurisdiction: input.jurisdiction,
						message: `Policy version ${resolvedVersion} is not available for jurisdiction ${input.jurisdiction}.`,
						scope: input.scope,
					})
				)
			);
	});

/**
 * Fails when the provided version is currently pinned in any active scope.
 *
 *
 * This guard performs a point-in-time read from the {@link PolicyPinning}
 * service; a pin may be created between this check and the caller's
 * subsequent mutation (TOCTOU window). For the current in-memory
 * `Ref`-backed implementation the practical risk is low, but callers
 * requiring stronger guarantees should sequence the check and mutation
 * within a single fiber and avoid yielding between them.
 *
 * @param version - Policy-pack version to validate before mutation/deletion.
 * @returns Effect that succeeds when the version is not pinned, or fails
 *   with {@link PolicyVersionPinnedError} when a scope still references it.
 */
export const ensureVersionNotPinned = (
	version: string
): Effect.Effect<void, PolicyVersionPinnedError, PolicyPinning> =>
	Effect.flatMap(Effect.service(PolicyPinning), (pinning) =>
		Effect.gen(function* ensureVersionNotPinned() {
			const pinned = yield* pinning.isVersionPinned(version);
			if (pinned) {
				return yield* Effect.fail(
					new PolicyVersionPinnedError({
						code: POLICY_PACKS_RUNTIME_ERROR.code,
						docsUrl: POLICY_PACKS_RUNTIME_ERROR.docsUrl,
						id: POLICY_PACKS_RUNTIME_ERROR.id,
						version,
					})
				);
			}
		})
	);

export { PolicyUpgrade } from "./upgrade/service";

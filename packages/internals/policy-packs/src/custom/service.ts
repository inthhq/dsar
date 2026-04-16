import * as Effect from "effect/Effect";

import { PolicyPinning } from "../pinning/service";
import { PolicyRegistry } from "../registry/service";
import {
	createPolicyPackVersionRecord,
	pinPolicyVersion,
	publishPolicyPackVersion,
} from "../service";
import type { PinRecord, PolicyPackVersionRecord } from "../types/domain";
import type {
	PolicyPacksError,
	PolicyVersionNotFoundError,
} from "../types/errors";
import {
	PolicyActivationNotFoundError,
	UnauthorizedApproverError,
} from "../types/errors";
import { PolicyAudit } from "../upgrade/audit";
import type {
	ActivateCustomPolicyPackInput,
	CustomPolicyRole,
	DeactivateCustomPolicyPackInput,
	RegisterCustomPolicyPackInput,
} from "./types";

const allowedCustomPolicyRoles: readonly CustomPolicyRole[] = [
	"admin",
	"compliance_admin",
];

/**
 * Asserts that the caller holds a role authorised for custom policy operations.
 *
 * @param role - Role string to validate (must be `"admin"` or
 *   `"compliance_admin"`).
 * @returns An `Effect` that succeeds with `void` when the role is allowed.
 * @throws {@link UnauthorizedApproverError} When the role is not in the
 *   allowed set.
 */
export const requireCustomPolicyRole = (
	role: string
): Effect.Effect<void, UnauthorizedApproverError> =>
	allowedCustomPolicyRoles.includes(role as CustomPolicyRole)
		? Effect.void
		: Effect.fail(
				new UnauthorizedApproverError({
					actualRole: role,
					requiredRoles: allowedCustomPolicyRoles,
				})
			);

/**
 * Registers a new custom policy pack version in the registry and emits an
 * audit event.
 *
 * @param input - Registration payload including the pack definition, version,
 *   jurisdiction, metadata, actor, and role.
 * @returns An `Effect` yielding the persisted {@link PolicyPackVersionRecord}.
 * @throws {@link UnauthorizedApproverError} When the caller's role is not
 *   authorised.
 * @throws {@link PolicyPacksError} When registry publication or version
 *   record creation fails.
 */
export const registerCustomPolicyPack = (
	input: RegisterCustomPolicyPackInput
): Effect.Effect<
	PolicyPackVersionRecord,
	UnauthorizedApproverError | PolicyPacksError,
	PolicyRegistry | PolicyAudit
> =>
	Effect.gen(function* registerCustomPolicyPack() {
		yield* requireCustomPolicyRole(input.role);
		const record = yield* createPolicyPackVersionRecord({
			jurisdiction: input.jurisdiction,
			metadata: input.metadata,
			name: input.name,
			pack: input.pack,
			publishedAt: input.publishedAt,
			version: input.version,
		});
		yield* publishPolicyPackVersion(record, input.actor);
		const audit = yield* Effect.service(PolicyAudit);
		yield* audit.append({
			actor: input.actor,
			at: input.publishedAt,
			metadata: {
				jurisdiction: input.jurisdiction,
				name: input.name,
				version: input.version,
			},
			policyVersion: input.version,
			type: "custom_policy_registered",
		});
		return record;
	});

/**
 * Pins a registered custom policy version to a tenant/workspace scope and
 * emits an audit event.
 *
 * @param input - Activation payload including the version, jurisdiction,
 *   scope, actor, and role.
 * @returns An `Effect` yielding the created {@link PinRecord}.
 * @throws {@link UnauthorizedApproverError} When the caller's role is not
 *   authorised.
 * @throws {@link PolicyVersionNotFoundError} When the requested version does
 *   not exist in the registry.
 */
export const activateCustomPolicyPack = (
	input: ActivateCustomPolicyPackInput
): Effect.Effect<
	PinRecord,
	UnauthorizedApproverError | PolicyVersionNotFoundError,
	PolicyRegistry | PolicyAudit | PolicyPinning
> =>
	Effect.gen(function* activateCustomPolicyPack() {
		yield* requireCustomPolicyRole(input.role);
		const registry = yield* Effect.service(PolicyRegistry);
		const policy = yield* registry.getByVersion(
			input.jurisdiction,
			input.version
		);
		const pin: PinRecord = {
			pinnedAt: input.now,
			pinnedBy: input.actor,
			policyVersion: policy.version,
			tenantId: input.scope.tenantId,
			workspaceId: input.scope.workspaceId,
		};
		yield* pinPolicyVersion(pin);
		const audit = yield* Effect.service(PolicyAudit);
		yield* audit.append({
			actor: input.actor,
			at: input.now,
			metadata: {
				jurisdiction: input.jurisdiction,
				name: policy.name,
				version: policy.version,
			},
			policyVersion: policy.version,
			tenantId: input.scope.tenantId,
			type: "custom_policy_activated",
			workspaceId: input.scope.workspaceId,
		});
		return pin;
	});

/**
 * Unpins the active custom policy from a tenant/workspace scope and emits an
 * audit event.
 *
 * @param input - Deactivation payload including the scope, actor, and role.
 * @returns An `Effect` that succeeds with `void` after the pin is removed.
 * @throws {@link UnauthorizedApproverError} When the caller's role is not
 *   authorised.
 * @throws {@link PolicyActivationNotFoundError} When no pin exists for the
 *   given scope.
 */
export const deactivateCustomPolicyPack = (
	input: DeactivateCustomPolicyPackInput
): Effect.Effect<
	void,
	UnauthorizedApproverError | PolicyActivationNotFoundError,
	PolicyAudit | PolicyPinning
> =>
	Effect.gen(function* deactivateCustomPolicyPack() {
		yield* requireCustomPolicyRole(input.role);
		const pinning = yield* Effect.service(PolicyPinning);
		const existing = yield* pinning.getPinForScope(input.scope);
		if (!existing) {
			return yield* Effect.fail(
				new PolicyActivationNotFoundError({
					tenantId: input.scope.tenantId,
					workspaceId: input.scope.workspaceId,
				})
			);
		}
		yield* pinning.unpinScope(input.scope);
		const audit = yield* Effect.service(PolicyAudit);
		yield* audit.append({
			actor: input.actor,
			at: input.now,
			metadata: {
				tenantId: input.scope.tenantId,
				workspaceId: input.scope.workspaceId,
			},
			policyVersion: existing.policyVersion,
			tenantId: input.scope.tenantId,
			type: "custom_policy_deactivated",
			workspaceId: input.scope.workspaceId,
		});
	});

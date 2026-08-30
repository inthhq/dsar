import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type { PinRecord, PolicyScope } from "../types/domain";

const scopeKey = (scope: PolicyScope) =>
	`${scope.tenantId}:${scope.workspaceId ?? "*"}`;

/**
 * Service contract for managing policy-version pins scoped to
 * tenant/workspace boundaries.
 */
export interface PolicyPinningService {
	/** Stores a {@link PinRecord}, replacing any existing pin for the same scope. */
	readonly pinVersion: (pin: PinRecord) => Effect.Effect<void>;
	/** Removes the pin for a scope, reverting to no pinned version. */
	readonly unpinScope: (scope: PolicyScope) => Effect.Effect<void>;
	/** Returns the direct {@link PinRecord} for a scope, or `undefined` if none. */
	readonly getPinForScope: (
		scope: PolicyScope
	) => Effect.Effect<PinRecord | undefined>;
	/** Resolves the effective pinned version for a scope: checks the
	 *  workspace-level pin first, then falls back to the tenant-level pin.
	 *  Returns `undefined` when neither exists. */
	readonly resolveEffectiveVersion: (
		scope: PolicyScope
	) => Effect.Effect<string | undefined>;
	/** Returns `true` when any scope currently pins the given version. */
	readonly isVersionPinned: (version: string) => Effect.Effect<boolean>;
}

/**
 * Effect service tag for injecting the {@link PolicyPinningService}
 * implementation.
 */
export class PolicyPinning extends Context.Service<
	PolicyPinning,
	PolicyPinningService
>()("PolicyPinning") {}

/**
 * In-memory {@link PolicyPinning} layer backed by a `Ref<Map>`. State is
 * ephemeral and not persisted across process restarts.
 */
export const PolicyPinningLive = Layer.effect(PolicyPinning)(
	Effect.gen(function* PolicyPinningLive() {
		const pins = yield* Ref.make(new Map<string, PinRecord>());

		return {
			getPinForScope: (scope) =>
				Ref.get(pins).pipe(
					Effect.map((current) => current.get(scopeKey(scope)))
				),
			isVersionPinned: (version) =>
				Ref.get(pins).pipe(
					Effect.map((current) =>
						[...current.values()].some((pin) => pin.policyVersion === version)
					)
				),
			pinVersion: (pin) =>
				Ref.update(pins, (current) =>
					new Map(current).set(
						scopeKey({
							tenantId: pin.tenantId,
							workspaceId: pin.workspaceId,
						}),
						pin
					)
				),
			resolveEffectiveVersion: (scope) =>
				Ref.get(pins).pipe(
					Effect.map((current) => {
						const workspacePin = current.get(scopeKey(scope));
						if (workspacePin) {
							return workspacePin.policyVersion;
						}

						const tenantPin = current.get(
							scopeKey({
								tenantId: scope.tenantId,
							})
						);
						return tenantPin?.policyVersion;
					})
				),
			unpinScope: (scope) =>
				Ref.update(pins, (current) => {
					const next = new Map(current);
					next.delete(scopeKey(scope));
					return next;
				}),
		} satisfies PolicyPinningService;
	})
);

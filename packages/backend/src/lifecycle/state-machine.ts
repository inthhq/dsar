import * as Effect from "effect/Effect";

import {
	InvalidLifecycleTransitionError,
	MissingLifecycleRationaleError,
} from "../types/errors";

const LIFECYCLE_STATUSES = [
	"captured",
	"verification_pending",
	"in_progress",
	"fulfilled",
	"refused",
	"closed",
] as const;

/**
 * Union of stages a DSAR request can occupy — from initial `captured` through
 * `verification_pending`, `in_progress`, `fulfilled` or `refused`, to `closed`.
 * Derived from {@link LIFECYCLE_STATUSES}.
 */
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

const LIFECYCLE_ACTIONS = [
	"verification_request",
	"verification_approve",
	"verification_reject",
	"clarification_request",
	"clarification_receive",
	"extension",
	"fulfil",
	"refuse",
	"close",
] as const;

/**
 * Operations that drive transitions between {@link LifecycleStatus} stages
 * (verification, clarification, extension, fulfilment, refusal, and closure).
 * Derived from {@link LIFECYCLE_ACTIONS}.
 */
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

const transitions: Record<LifecycleAction, readonly LifecycleStatus[]> = {
	clarification_receive: ["in_progress"],
	clarification_request: ["in_progress", "verification_pending"],
	close: ["fulfilled", "refused"],
	extension: ["in_progress"],
	fulfil: ["in_progress"],
	refuse: ["in_progress", "verification_pending"],
	verification_approve: ["verification_pending"],
	verification_reject: ["verification_pending"],
	verification_request: ["captured", "in_progress"],
};

const rationaleRequired = new Set<LifecycleAction>(["extension", "refuse"]);

const statusByAction: Record<LifecycleAction, LifecycleStatus> = {
	clarification_receive: "in_progress",
	clarification_request: "in_progress",
	close: "closed",
	extension: "in_progress",
	fulfil: "fulfilled",
	refuse: "refused",
	verification_approve: "in_progress",
	verification_reject: "in_progress",
	verification_request: "verification_pending",
};

/**
 * Input payload for {@link applyLifecycleTransition}, describing the request
 * and the action to attempt.
 */
export interface ApplyLifecycleTransitionInput {
	/** Identifier of the request whose lifecycle is being transitioned. */
	readonly requestId: string;
	/** Current status of the request; validated at runtime against
	 *  {@link LifecycleStatus}. */
	readonly currentStatus: string;
	/** Transition action to apply; must be allowed from `currentStatus`. */
	readonly action: LifecycleAction;
	/** Operator rationale — required for `extension` and `refuse` actions,
	 *  ignored otherwise. */
	readonly rationale?: string;
}

/**
 * Result returned after applying a lifecycle transition.
 */
export interface ApplyLifecycleTransitionResult {
	/** Lifecycle status before the transition. */
	readonly from: LifecycleStatus;
	/** Lifecycle status after the transition. */
	readonly to: LifecycleStatus;
	/** {@link LifecycleAction} that triggered this state transition. */
	readonly action: LifecycleAction;
}

const lifecycleStatusSet: ReadonlySet<string> = new Set(LIFECYCLE_STATUSES);

const isLifecycleStatus = (value: string): value is LifecycleStatus =>
	lifecycleStatusSet.has(value);

const allowedActionsByStatus: Record<
	LifecycleStatus,
	readonly LifecycleAction[]
> = (() => {
	const map: Record<string, LifecycleAction[]> = {};
	for (const status of LIFECYCLE_STATUSES) {
		map[status] = [];
	}
	for (const action of LIFECYCLE_ACTIONS) {
		for (const status of transitions[action]) {
			const bucket = map[status];
			if (bucket) {
				bucket.push(action);
			}
		}
	}
	return map as Record<LifecycleStatus, readonly LifecycleAction[]>;
})();

/**
 * Returns lifecycle actions allowed from the provided status, in declared order.
 *
 * Unknown statuses return an empty array.
 *
 * @param status - Lifecycle status to inspect.
 * @returns Allowed lifecycle actions for the status.
 */
export const allowedActionsFromStatus = (
	status: string
): readonly LifecycleAction[] => {
	if (!isLifecycleStatus(status)) {
		return [];
	}
	return allowedActionsByStatus[status];
};

/**
 * Validates and applies a lifecycle transition for a request.
 *
 * @param input - {@link ApplyLifecycleTransitionInput} containing:
 *   - `requestId` — identifier of the request whose lifecycle is being
 *     transitioned (used in error diagnostics).
 *   - `currentStatus` — current status string validated at runtime against
 *     {@link LifecycleStatus}.
 *   - `action` — the {@link LifecycleAction} to apply; must be allowed from
 *     `currentStatus`.
 *   - `rationale` (optional) — operator justification required for `extension`
 *     and `refuse` actions.
 * @returns Effect yielding {@link ApplyLifecycleTransitionResult} with the
 *   previous status, next status, and triggering action.
 * @throws {@link InvalidLifecycleTransitionError} When `currentStatus` is not a
 *   recognised {@link LifecycleStatus} or `action` is not permitted from that
 *   status.
 * @throws {@link MissingLifecycleRationaleError} When `action` requires a
 *   rationale (`extension`, `refuse`) and none is provided.
 */
export const applyLifecycleTransition = (
	input: ApplyLifecycleTransitionInput
): Effect.Effect<
	ApplyLifecycleTransitionResult,
	InvalidLifecycleTransitionError | MissingLifecycleRationaleError
> => {
	const { requestId, currentStatus, action, rationale } = input;
	if (!isLifecycleStatus(currentStatus)) {
		return Effect.fail(
			new InvalidLifecycleTransitionError({
				action,
				from: currentStatus,
				reasonCode: "LIFECYCLE_STATUS_UNKNOWN",
				requestId,
			})
		);
	}

	if (
		rationaleRequired.has(action) &&
		(!rationale || rationale.trim().length === 0)
	) {
		return Effect.fail(
			new MissingLifecycleRationaleError({
				action,
				reasonCode: "LIFECYCLE_RATIONALE_MISSING",
				requestId,
			})
		);
	}

	if (!transitions[action].includes(currentStatus)) {
		return Effect.fail(
			new InvalidLifecycleTransitionError({
				action,
				from: currentStatus,
				reasonCode: "LIFECYCLE_TRANSITION_DISALLOWED",
				requestId,
			})
		);
	}

	return Effect.succeed({
		action,
		from: currentStatus,
		to: statusByAction[action],
	});
};

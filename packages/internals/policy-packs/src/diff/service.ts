import type { PolicyPack } from "@dsar/policy-engine";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { PolicyDiffItem, PolicyUpgradeDiff } from "../types/domain";

const makeItem = (
	category: PolicyDiffItem["category"],
	path: string,
	from: unknown,
	to: unknown,
	message: string
): PolicyDiffItem => ({
	category,
	from,
	message,
	path,
	to,
});

const compare = (
	items: PolicyDiffItem[],
	input: {
		readonly category: PolicyDiffItem["category"];
		readonly path: string;
		readonly from: unknown;
		readonly to: unknown;
		readonly message: string;
	}
) => {
	if (input.from !== input.to) {
		items.push(
			makeItem(input.category, input.path, input.from, input.to, input.message)
		);
	}
};

const summarizeClockChanges = (
	items: readonly PolicyDiffItem[]
): readonly string[] =>
	items
		.filter((item) => item.path.startsWith("sections.clock"))
		.map((item) => `${item.path} changed to ${String(item.to)}`);

/**
 * Service contract for computing structural differences between two policy
 * packs.
 */
export interface PolicyPackDiffService {
	/**
	 * Compares two {@link PolicyPack} versions and returns the set of
	 * field-level differences.
	 *
	 * @param fromPack - Baseline policy pack (the "before" snapshot).
	 * @param toPack - Target policy pack (the "after" snapshot).
	 * @returns An `Effect` yielding a {@link PolicyUpgradeDiff} containing
	 *   the list of changed items, version identifiers, and a clock-behaviour
	 *   summary.
	 */
	readonly diff: (
		fromPack: PolicyPack,
		toPack: PolicyPack
	) => Effect.Effect<PolicyUpgradeDiff>;
}

/**
 * Effect service tag for injecting the {@link PolicyPackDiffService}
 * implementation.
 */
export class PolicyPackDiff extends Context.Service<
	PolicyPackDiff,
	PolicyPackDiffService
>()("PolicyPackDiff") {}

/**
 * Effect Layer providing the live implementation of the
 * {@link PolicyPackDiff} service.
 */
export const PolicyPackDiffLive = Layer.succeed(PolicyPackDiff)({
	diff: (fromPack, toPack) =>
		Effect.sync(() => {
			const items: PolicyDiffItem[] = [];

			compare(items, {
				category: "deadline_changes",
				from: fromPack.sections.clock.responseDeadlineDays,
				message: "Base response deadline changed.",
				path: "sections.clock.responseDeadlineDays",
				to: toPack.sections.clock.responseDeadlineDays,
			});
			compare(items, {
				category: "deadline_changes",
				from: fromPack.sections.clock.clarificationEffect,
				message: "Clarification pause semantics changed.",
				path: "sections.clock.clarificationEffect",
				to: toPack.sections.clock.clarificationEffect,
			});
			compare(items, {
				category: "deadline_changes",
				from: fromPack.sections.clock.verificationEffect,
				message: "Verification pause semantics changed.",
				path: "sections.clock.verificationEffect",
				to: toPack.sections.clock.verificationEffect,
			});
			compare(items, {
				category: "deadline_changes",
				from: fromPack.sections.clock.extension.maxAdditionalDays,
				message: "Extension allowance changed.",
				path: "sections.clock.extension.maxAdditionalDays",
				to: toPack.sections.clock.extension.maxAdditionalDays,
			});
			compare(items, {
				category: "verification_changes",
				from: fromPack.sections.verification.requiredWhen,
				message: "Verification trigger changed.",
				path: "sections.verification.requiredWhen",
				to: toPack.sections.verification.requiredWhen,
			});
			compare(items, {
				category: "verification_changes",
				from: fromPack.sections.verification.deleteCollectedDataAfterProcessing,
				message: "Verification data retention/deletion changed.",
				path: "sections.verification.deleteCollectedDataAfterProcessing",
				to: toPack.sections.verification.deleteCollectedDataAfterProcessing,
			});
			compare(items, {
				category: "communication_changes",
				from: fromPack.sections.response.requireManifest,
				message: "Required response communication changed.",
				path: "sections.response.requireManifest",
				to: toPack.sections.response.requireManifest,
			});
			compare(items, {
				category: "appeals_changes",
				from: fromPack.sections.appeals.required,
				message: "Appeal requirement changed.",
				path: "sections.appeals.required",
				to: toPack.sections.appeals.required,
			});
			compare(items, {
				category: "appeals_changes",
				from: fromPack.sections.appeals.deadlineDays,
				message: "Appeal deadline changed.",
				path: "sections.appeals.deadlineDays",
				to: toPack.sections.appeals.deadlineDays,
			});
			compare(items, {
				category: "appeals_changes",
				from: fromPack.sections.appeals.mustIncludeAGContactIfDenied,
				message: "AG contact requirement changed.",
				path: "sections.appeals.mustIncludeAGContactIfDenied",
				to: toPack.sections.appeals.mustIncludeAGContactIfDenied,
			});
			compare(items, {
				category: "retention_changes",
				from: fromPack.sections.retention.verificationDeleteAfterProcessing,
				message: "Verification retention delete behavior changed.",
				path: "sections.retention.verificationDeleteAfterProcessing",
				to: toPack.sections.retention.verificationDeleteAfterProcessing,
			});
			compare(items, {
				category: "retention_changes",
				from: fromPack.sections.retention.minimums.verification_evidence,
				message: "Verification evidence minimum retention changed.",
				path: "sections.retention.minimums.verification_evidence",
				to: toPack.sections.retention.minimums.verification_evidence,
			});

			return {
				clockBehaviorSummary: summarizeClockChanges(items),
				fromVersion: fromPack.version,
				items,
				toVersion: toPack.version,
			} satisfies PolicyUpgradeDiff;
		}),
} satisfies PolicyPackDiffService);

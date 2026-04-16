import { defu } from "defu";

import type { PolicyPack } from "../schema/policy-pack";
import type {
	EvaluatorInput,
	ExplainabilityTraceEntry,
	RuleMatchResult,
} from "../types/evaluator";

const doesRuleMatch = (
	input: EvaluatorInput,
	rule: PolicyPack["sections"]["clock"]["rules"][number]
): boolean => {
	if (!rule.when) {
		return true;
	}

	if (
		rule.when.requestTypes &&
		!rule.when.requestTypes.includes(input.requestType)
	) {
		return false;
	}

	if (
		rule.when.requestorTypes &&
		!rule.when.requestorTypes.includes(input.requestorType)
	) {
		return false;
	}

	if (
		typeof rule.when.hasAuthorityEvidence === "boolean" &&
		rule.when.hasAuthorityEvidence !== input.hasAuthorityEvidence
	) {
		return false;
	}

	if (
		typeof rule.when.isComplex === "boolean" &&
		rule.when.isComplex !== input.context.isComplex
	) {
		return false;
	}

	return true;
};

/**
 * Matches clock rules from a policy pack against the evaluator input and
 * merges matching overrides into an effective clock configuration.
 *
 * @param policyPack - {@link PolicyPack} whose `sections.clock.rules` are
 *   filtered and sorted by precedence.
 * @param input - {@link EvaluatorInput} providing request type, requestor
 *   type, authority-evidence flag, and complexity context used to evaluate
 *   rule conditions.
 * @returns A {@link RuleMatchResult} containing the merged `effectiveClock`,
 *   the `matchedClockRules` in precedence order, and `traceEntries`
 *   documenting why each rule was applied.
 */
export const matchAndResolveClockRules = (
	policyPack: PolicyPack,
	input: EvaluatorInput
): RuleMatchResult => {
	const matchedClockRules = [...policyPack.sections.clock.rules]
		.filter((rule) => doesRuleMatch(input, rule))
		.sort((a, b) => {
			if (a.precedence !== b.precedence) {
				return b.precedence - a.precedence;
			}
			return a.id.localeCompare(b.id);
		});

	const traceEntries: ExplainabilityTraceEntry[] = matchedClockRules.map(
		(rule) => ({
			code: "clock.rule.applied",
			details: {
				apply: rule.apply,
				precedence: rule.precedence,
				ruleId: rule.id,
			},
			message: rule.explanation,
		})
	);

	let effectiveClock = policyPack.sections.clock;
	for (const rule of [...matchedClockRules].reverse()) {
		effectiveClock = defu(rule.apply, effectiveClock);
	}

	return {
		effectiveClock,
		matchedClockRules,
		traceEntries,
	};
};

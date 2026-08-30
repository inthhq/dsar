import type { Effect } from "effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

import type { PolicyEvaluatorError } from "../types/errors";
import type { EvaluatorInput, EvaluatorOutput } from "../types/evaluator";
import { evaluatePolicy } from "./evaluate";

/**
 * Service contract for evaluating policy packs against a DSAR request
 * context and returning compliance decisions.
 */
export interface PolicyEvaluatorService {
	/**
	 * Evaluates the resolved policy pack against the DSAR request context
	 * described by {@link EvaluatorInput} and produces an
	 * {@link EvaluatorOutput} containing the compliance decision, matched
	 * rules, and any applicable deadlines.
	 */
	readonly evaluate: (
		input: EvaluatorInput
	) => Effect.Effect<EvaluatorOutput, PolicyEvaluatorError>;
}

/**
 * Effect service tag for the policy evaluator. Provide this tag via a
 * layer (e.g. {@link PolicyEvaluatorLive}) to make the
 * {@link PolicyEvaluatorService} contract — evaluating policy packs
 * against DSAR request contexts and returning compliance decisions —
 * available to downstream effects.
 */
export class PolicyEvaluator extends Context.Service<
	PolicyEvaluator,
	PolicyEvaluatorService
>()("@dsar/policy-engine/PolicyEvaluator") {}

/**
 * Production layer that satisfies {@link PolicyEvaluator} by delegating
 * to {@link evaluatePolicy}. Stateless — no caching or side effects
 * beyond the evaluation itself.
 */
export const PolicyEvaluatorLive = Layer.succeed(PolicyEvaluator)({
	evaluate: evaluatePolicy,
});

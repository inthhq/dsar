import * as Data from "effect/Data";

/**
 * Raised when a policy pack document fails schema validation or
 * contains structural issues that prevent evaluation.
 */
export class InvalidPolicyPackError extends Data.TaggedError(
	"InvalidPolicyPackError"
)<{
	readonly code?: string;
	readonly docsUrl?: string;
	readonly id?: string;
	readonly message: string;
	readonly parseIssue: string;
}> {}

/**
 * Raised when the requested jurisdiction does not match any registered
 * policy pack, preventing evaluation from proceeding.
 */
export class UnsupportedJurisdictionError extends Data.TaggedError(
	"UnsupportedJurisdictionError"
)<{
	readonly code?: string;
	readonly docsUrl?: string;
	readonly id?: string;
	readonly expected: string;
	readonly actual: string;
}> {}

/**
 * Discriminated union of failures the policy evaluator may produce,
 * used by callers to branch on validation vs. jurisdiction errors.
 */
export type PolicyEvaluatorError =
	| InvalidPolicyPackError
	| UnsupportedJurisdictionError;

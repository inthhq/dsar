import type { RequestType } from "@dsar/schema";

import type { PolicyPack } from "../schema/policy-pack";

/**
 * Role of the person filing the DSAR relative to the data subject,
 * used by policy rules to determine evidence and eligibility requirements.
 */
export type RequestorKind = "subject" | "representative" | "authorised_agent";

/**
 * Reason a statutory response clock is paused: `"verification"` while
 * awaiting identity proof, or `"clarification"` while awaiting
 * requestor input.
 */
export type PauseReason = "verification" | "clarification";

/**
 * Time interval during which the statutory clock was paused,
 * recorded on the request timeline for due-date recomputation.
 */
export interface TimelinePause {
	/** Business reason the statutory clock is paused. */
	readonly reason: PauseReason;
	/** Pause start time used when recalculating due dates. */
	readonly from: string;
	/** Pause end time; omitted when the pause is still active. */
	readonly to?: string;
}

/**
 * Approved deadline extension adding calendar days beyond the base
 * statutory deadline, with a justification reason.
 */
export interface TimelineExtension {
	/** Number of additional days granted beyond base deadline. */
	readonly days: number;
	/** Human-readable justification for the extension decision. */
	readonly reason: string;
}

/**
 * Context supplied to the policy evaluator: the candidate policy pack,
 * jurisdiction, request classification, requestor role, timeline state,
 * and situational flags that influence rule matching.
 */
export interface EvaluatorInput {
	/** Candidate policy pack payload to evaluate against request context. */
	readonly policyPack: unknown;
	/** Legal jurisdiction used to pick the applicable rule set. */
	readonly jurisdiction: string;
	/** Policy version label used for deterministic evaluation/audit. */
	readonly policyVersion: string;
	/** DSAR request class that drives rule branching. */
	readonly requestType: RequestType;
	/** Requestor role that affects eligibility and evidence requirements. */
	readonly requestorType: RequestorKind;
	/** Indicates whether authority evidence is already present. */
	readonly hasAuthorityEvidence: boolean;
	/** Timeline state used for due-date recomputation. */
	readonly timeline: {
		/** Intake timestamp used as baseline for legal clock calculations. */
		readonly receivedAt: string;
		/** Evaluation timestamp for "as-of-now" deadline computation. */
		readonly now: string;
		/** Clock pauses currently on record for this request. */
		readonly pauses: readonly TimelinePause[];
		/** Approved extensions that add days to the deadline. */
		readonly extensions: readonly TimelineExtension[];
	};
	/** Additional evaluation flags derived from request context. */
	readonly context: {
		/** Marks complex requests that may allow alternate handling windows. */
		readonly isComplex: boolean;
		/** Signals that identity/authority verification must be completed first. */
		readonly requiresVerification: boolean;
	};
}

/**
 * Audit-trail entry explaining a single decision step during policy
 * evaluation, with a machine-readable code and human-readable message.
 */
export interface ExplainabilityTraceEntry {
	/** Stable machine-readable reason code for policy audit trails. */
	readonly code: string;
	/** Reviewer-facing explanation of the decision step. */
	readonly message: string;
	/** Optional structured context used for deep audit diagnostics. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Binary compliance determinations produced by policy evaluation,
 * controlling whether a request may proceed, requires verification,
 * or is eligible for refusal or appeal.
 */
export interface EvaluatorDecision {
	/** Whether processing the request is legally permitted. */
	readonly requestAllowed: boolean;
	/** Whether verification must be completed before fulfilment. */
	readonly verificationRequired: boolean;
	/** Whether proof of authority is required for this requestor. */
	readonly authorityEvidenceRequired: boolean;
	/** Whether this decision can be appealed under policy rules. */
	readonly appealEligible: boolean;
	/** Whether refusal is permitted under current policy context. */
	readonly refusalEligible: boolean;
}

/**
 * Computed statutory deadline produced by policy evaluation, reflecting
 * the base due date adjusted for pauses and approved extensions.
 */
export interface EvaluatorClockResult {
	/** Policy version that produced this clock result. */
	readonly policyVersion: string;
	/** Baseline due date before pauses/extensions are applied. */
	readonly baseDueAt: string;
	/** Final due date after all adjustments are applied. */
	readonly finalDueAt: string;
	/** Total paused days excluded from statutory countdown. */
	readonly pauseDaysApplied: number;
	/** Total extension days added through approved actions. */
	readonly extensionDaysApplied: number;
}

/**
 * Complete evaluation result consumed by lifecycle and compliance
 * services, combining decisions, clock calculations, required actions
 * and notices, and an explainability trace.
 */
export interface EvaluatorOutput {
	/** Policy pack identity resolved for this evaluation run. */
	readonly policyPackRef: {
		/** Stable policy pack identifier used for downstream references. */
		readonly packId: string;
		/** Exact policy version used for this evaluation. */
		readonly version: string;
		/** Jurisdiction scope for this applied policy pack. */
		readonly jurisdiction: string;
	};
	/** Binary policy determinations for request processing behavior. */
	readonly decision: EvaluatorDecision;
	/** Legal clock outcome with due-date calculations. */
	readonly clock: EvaluatorClockResult;
	/** Operational actions that must be completed to stay compliant. */
	readonly requiredActions: readonly string[];
	/** Notices that must be issued to remain policy-compliant. */
	readonly requiredNotices: readonly {
		/** Notice class (acknowledgement, extension, refusal, etc.). */
		readonly type: string;
		/** Deadline by which this notice must be sent. */
		readonly dueAt: string;
	}[];
	/** Ordered trace explaining why policy decisions were made. */
	readonly explainabilityTrace: readonly ExplainabilityTraceEntry[];
	/** Rule ids that matched and materially influenced this result. */
	readonly matchedRuleIds: readonly string[];
}

/**
 * Intermediate rule-match detail used by evaluator internals.
 */
export interface RuleMatchResult {
	/** Clock rules that matched the current request context. */
	readonly matchedClockRules: readonly PolicyPack["sections"]["clock"]["rules"][number][];
	/** Effective clock configuration after precedence/overrides are applied. */
	readonly effectiveClock: PolicyPack["sections"]["clock"];
	/** Trace entries produced while evaluating rule matches. */
	readonly traceEntries: readonly ExplainabilityTraceEntry[];
}

import { asObject, isRecord } from "@dsar/guards";
import type { RequestTimelineEventRecord } from "@dsar/persistence";
import { evaluatePolicy } from "@dsar/policy-engine";
import type { EvaluatorInput, EvaluatorOutput } from "@dsar/policy-engine";
import type { PolicyPackVersionRecord } from "@dsar/policy-packs";
import type { RequestType } from "@dsar/schema";
import * as Effect from "effect/Effect";

type PauseReason = "verification" | "clarification";

interface PauseWindow {
	readonly reason: PauseReason;
	readonly from: string;
	readonly to: string;
}

const REQUEST_TYPES = [
	"access",
	"delete",
	"correct",
	"portability",
	"restriction",
	"objection",
	"other",
] as const;

const isRequestType = (value: unknown): value is RequestType =>
	typeof value === "string" &&
	(REQUEST_TYPES as readonly string[]).includes(value);

const parsePauseWindows = (
	events: readonly RequestTimelineEventRecord[],
	now: string
): readonly PauseWindow[] => {
	const sorted = [...events].toSorted(
		(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
	);
	const openPauseByReason: Partial<Record<PauseReason, string>> = {};
	const windows: PauseWindow[] = [];
	for (const event of sorted) {
		if (event.eventType === "verification_requested") {
			openPauseByReason.verification = event.createdAt;
		}
		if (event.eventType === "clarification_requested") {
			openPauseByReason.clarification = event.createdAt;
		}
		if (event.eventType === "verification_resolved") {
			const from = openPauseByReason.verification;
			if (from) {
				windows.push({ from, reason: "verification", to: event.createdAt });
				delete openPauseByReason.verification;
			}
		}
		if (event.eventType === "clarification_received") {
			const from = openPauseByReason.clarification;
			if (from) {
				windows.push({ from, reason: "clarification", to: event.createdAt });
				delete openPauseByReason.clarification;
			}
		}
	}
	if (openPauseByReason.verification) {
		windows.push({
			from: openPauseByReason.verification,
			reason: "verification",
			to: now,
		});
	}
	if (openPauseByReason.clarification) {
		windows.push({
			from: openPauseByReason.clarification,
			reason: "clarification",
			to: now,
		});
	}
	return windows;
};

const parseExtensionDays = (
	events: readonly RequestTimelineEventRecord[]
): readonly { readonly days: number; readonly reason: string }[] => {
	const extensions: { readonly days: number; readonly reason: string }[] = [];
	for (const event of events) {
		if (
			event.eventType !== "deadline_extended" &&
			event.eventType !== "extension_applied"
		) {
			continue;
		}
		const payload = isRecord(event.payload) ? event.payload : undefined;
		const days =
			typeof payload?.additionalDays === "number" ? payload.additionalDays : 0;
		const reason =
			typeof payload?.rationale === "string" ? payload.rationale : "extension";
		if (days > 0) {
			extensions.push({ days, reason });
		}
	}
	return extensions;
};

const resolveRequestType = (capture: unknown): RequestType => {
	const obj = asObject(capture);
	const candidate = obj?.requestType;
	if (isRequestType(candidate)) {
		return candidate;
	}
	return "access";
};

const resolveRequestorType = (
	capture: unknown
): "subject" | "representative" | "authorised_agent" => {
	const obj = asObject(capture);
	const requestor = asObject(obj?.requestor);
	const candidate =
		typeof requestor?.type === "string" ? requestor.type : undefined;
	if (
		candidate === "subject" ||
		candidate === "representative" ||
		candidate === "authorised_agent"
	) {
		return candidate;
	}
	return "subject";
};

const buildRestrictiveFallback = (
	resolvedPack: PolicyPackVersionRecord,
	jurisdiction: string
): EvaluatorOutput => ({
	clock: {
		baseDueAt: new Date().toISOString(),
		extensionDaysApplied: 0,
		finalDueAt: new Date().toISOString(),
		pauseDaysApplied: 0,
		policyVersion: resolvedPack.version,
	},
	decision: {
		appealEligible: false,
		authorityEvidenceRequired: false,
		refusalEligible: true,
		requestAllowed: false,
		verificationRequired: true,
	},
	explainabilityTrace: [
		{
			code: "fallback_restrictive",
			message:
				"Policy evaluation failed; using restrictive fallback decision that requires manual intervention.",
		},
	],
	matchedRuleIds: [],
	policyPackRef: {
		jurisdiction,
		packId: resolvedPack.pack.packId,
		version: resolvedPack.version,
	},
	requiredActions: [],
	requiredNotices: [],
});

/**
 * Constructs an {@link EvaluatorInput} from the provided request data and
 * invokes the policy engine to produce an evaluation outcome.
 *
 * @param input - Request context used to build the evaluator input.
 * @param input.resolvedPack - Resolved policy pack and version to evaluate
 *   against.
 * @param input.jurisdiction - Jurisdiction code governing which rules apply
 *   (e.g. `"eu"`, `"us-ca"`).
 * @param input.receivedAt - ISO-8601 timestamp of when the request was
 *   received, used for deadline calculation.
 * @param input.capture - Raw capture payload; inspected for `isComplex`,
 *   `requiresVerification`, request type, and requestor type.
 * @param input.authority - Authority-of-agent record; checked for a
 *   `"verified"` status to flag evidence presence.
 * @param input.timelineEvents - Chronological request timeline events used to
 *   derive pause windows and extension days.
 * @param input.now - Current ISO-8601 timestamp for clock calculations.
 * @returns An `Effect` yielding an {@link EvaluatorOutput} containing the
 *   policy decision, legal-clock result, required actions, required notices,
 *   and an explainability trace. Falls back to a restrictive default if the
 *   policy engine errors.
 */
export const runPolicyEvaluation = (input: {
	readonly resolvedPack: PolicyPackVersionRecord;
	readonly jurisdiction: string;
	readonly receivedAt: string;
	readonly capture: unknown;
	readonly authority: unknown;
	readonly timelineEvents: readonly RequestTimelineEventRecord[];
	readonly now: string;
}): Effect.Effect<EvaluatorOutput, never> => {
	const pauses = parsePauseWindows(input.timelineEvents, input.now);
	const extensions = parseExtensionDays(input.timelineEvents);
	const authorityObj = asObject(input.authority);
	const hasAuthorityEvidence =
		typeof authorityObj?.status === "string" &&
		authorityObj.status === "verified";
	const captureObj = asObject(input.capture);
	const isComplex =
		typeof captureObj?.isComplex === "boolean" && captureObj.isComplex;
	const requiresVerification =
		typeof captureObj?.requiresVerification === "boolean" &&
		captureObj.requiresVerification;

	const evaluatorInput: EvaluatorInput = {
		context: {
			isComplex,
			requiresVerification,
		},
		hasAuthorityEvidence,
		jurisdiction: input.jurisdiction,
		policyPack: input.resolvedPack.pack,
		policyVersion: input.resolvedPack.version,
		requestType: resolveRequestType(input.capture),
		requestorType: resolveRequestorType(input.capture),
		timeline: {
			extensions,
			now: input.now,
			pauses,
			receivedAt: input.receivedAt,
		},
	};

	return evaluatePolicy(evaluatorInput).pipe(
		Effect.catch((error) =>
			Effect.logWarning(
				`Policy evaluation failed, applying restrictive fallback: ${String(error)}`
			).pipe(
				Effect.map(() =>
					buildRestrictiveFallback(input.resolvedPack, input.jurisdiction)
				)
			)
		)
	);
};

/**
 * Lightweight evaluation used at capture time when no timeline events exist yet.
 *
 * @param input - Capture-time evaluation context.
 * @param input.resolvedPack - Resolved policy pack and version to evaluate
 *   against.
 * @param input.jurisdiction - Jurisdiction code governing which rules apply.
 * @param input.receivedAt - ISO-8601 timestamp of when the request was
 *   received; also used as the current time for clock calculations.
 * @param input.capture - Raw capture payload inspected for request and
 *   requestor type derivation.
 * @returns An `Effect` yielding an {@link EvaluatorOutput} with the initial
 *   policy decision, legal-clock result, required actions, and required
 *   notices. Falls back to a restrictive default if the policy engine errors.
 */
export const runInitialPolicyEvaluation = (input: {
	readonly resolvedPack: PolicyPackVersionRecord;
	readonly jurisdiction: string;
	readonly receivedAt: string;
	readonly capture: unknown;
}): Effect.Effect<EvaluatorOutput, never> =>
	runPolicyEvaluation({
		...input,
		authority: null,
		now: input.receivedAt,
		timelineEvents: [],
	});

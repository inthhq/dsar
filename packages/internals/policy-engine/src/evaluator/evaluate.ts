import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { PolicyPackSchema } from "../schema/policy-pack";
import { resolvePolicyEngineErrorCatalogEntry } from "../types/error-codes";
import {
	InvalidPolicyPackError,
	UnsupportedJurisdictionError,
} from "../types/errors";
import type { PolicyEvaluatorError } from "../types/errors";
import type {
	EvaluatorInput,
	EvaluatorOutput,
	ExplainabilityTraceEntry,
} from "../types/evaluator";
import { matchAndResolveClockRules } from "./match-rules";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const POLICY_ENGINE_RUNTIME_ERROR = resolvePolicyEngineErrorCatalogEntry(
	"POLICY_ENGINE_RUNTIME_ERROR"
);

const toDate = (isoTimestamp: string) => new Date(isoTimestamp);

const addDaysIso = (isoTimestamp: string, days: number) => {
	const date = toDate(isoTimestamp);
	return new Date(date.getTime() + days * DAY_IN_MS).toISOString();
};

const addBusinessDaysIso = (isoTimestamp: string, days: number) => {
	let date = toDate(isoTimestamp);
	let added = 0;
	while (added < days) {
		date = new Date(date.getTime() + DAY_IN_MS);
		const dayOfWeek = date.getUTCDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			added += 1;
		}
	}
	return date.toISOString();
};

const pauseDurationMs = (from: string, to: string) => {
	const fromMs = toDate(from).getTime();
	const toMs = toDate(to).getTime();
	return Math.max(0, toMs - fromMs);
};

const asDays = (durationMs: number) => durationMs / DAY_IN_MS;

const resolveVerificationRequired = (
	requiredWhen:
		| "always"
		| "when_authority_missing"
		| "high_risk"
		| "policy_controlled",
	input: EvaluatorInput
) => {
	switch (requiredWhen) {
		case "always": {
			return true;
		}
		case "when_authority_missing": {
			return !input.hasAuthorityEvidence;
		}
		case "high_risk": {
			return input.context.isComplex;
		}
		case "policy_controlled": {
			return input.context.requiresVerification;
		}
		default: {
			return false;
		}
	}
};

const buildRequiredNotices = (
	input: EvaluatorInput,
	ackRequired: boolean,
	ackDeadlineBusinessDays?: number,
	extensionDaysApplied = 0
): readonly { readonly type: string; readonly dueAt: string }[] => {
	const notices: { readonly type: string; readonly dueAt: string }[] = [];

	if (ackRequired && ackDeadlineBusinessDays) {
		notices.push({
			dueAt: addBusinessDaysIso(
				input.timeline.receivedAt,
				ackDeadlineBusinessDays
			),
			type: "acknowledgement_required",
		});
	}

	if (extensionDaysApplied > 0) {
		notices.push({
			dueAt: input.timeline.now,
			type: "extension_notice_required",
		});
	}

	return notices;
};

/**
 * Evaluates a policy pack against request context and produces deadlines, decisions, and trace output.
 *
 * @param input - Request/policy context used to compute legal-clock and control outcomes.
 * @returns Effect that succeeds with evaluator output or fails with policy-evaluator errors.
 * @throws InvalidPolicyPackError when the provided policy pack fails schema validation.
 * @throws UnsupportedJurisdictionError when policy-pack jurisdiction does not match input.
 */
export const evaluatePolicy = (
	input: EvaluatorInput
): Effect.Effect<EvaluatorOutput, PolicyEvaluatorError> => {
	const decoded = Schema.decodeUnknownExit(PolicyPackSchema)(input.policyPack);

	if (Exit.isFailure(decoded)) {
		return Effect.fail(
			new InvalidPolicyPackError({
				code: POLICY_ENGINE_RUNTIME_ERROR.code,
				docsUrl: POLICY_ENGINE_RUNTIME_ERROR.docsUrl,
				id: POLICY_ENGINE_RUNTIME_ERROR.id,
				message: "Policy pack failed schema validation",
				parseIssue: Cause.pretty(decoded.cause),
			})
		);
	}

	const policyPack = decoded.value;

	if (policyPack.jurisdiction !== input.jurisdiction) {
		return Effect.fail(
			new UnsupportedJurisdictionError({
				actual: input.jurisdiction,
				code: POLICY_ENGINE_RUNTIME_ERROR.code,
				docsUrl: POLICY_ENGINE_RUNTIME_ERROR.docsUrl,
				expected: policyPack.jurisdiction,
				id: POLICY_ENGINE_RUNTIME_ERROR.id,
			})
		);
	}

	const matchResult = matchAndResolveClockRules(policyPack, input);
	const { effectiveClock } = matchResult;

	const baseDueAt = addDaysIso(
		input.timeline.receivedAt,
		effectiveClock.responseDeadlineDays
	);

	let pauseMsApplied = 0;
	const traceEntries: ExplainabilityTraceEntry[] = [
		{
			code: "clock.base",
			details: {
				baseDueAt,
				responseDeadlineDays: effectiveClock.responseDeadlineDays,
				start: effectiveClock.start,
			},
			message: "Computed base deadline from policy clock rules",
		},
		...matchResult.traceEntries,
	];

	for (const pause of input.timeline.pauses) {
		const pauseEnd = pause.to ?? input.timeline.now;
		const durationMs = pauseDurationMs(pause.from, pauseEnd);
		const shouldApply =
			(pause.reason === "verification" &&
				effectiveClock.verificationEffect === "stop_clock") ||
			(pause.reason === "clarification" &&
				effectiveClock.clarificationEffect === "stop_clock");

		if (shouldApply) {
			pauseMsApplied += durationMs;
			traceEntries.push({
				code: "clock.pause.applied",
				details: {
					days: asDays(durationMs),
					from: pause.from,
					reason: pause.reason,
					to: pauseEnd,
				},
				message: `Applied ${pause.reason} pause duration`,
			});
		}
	}

	const extensionDaysRequested = input.timeline.extensions.reduce(
		(total, extension) => total + extension.days,
		0
	);
	const extensionDaysApplied = effectiveClock.extension.enabled
		? Math.min(
				extensionDaysRequested,
				effectiveClock.extension.maxAdditionalDays
			)
		: 0;

	if (extensionDaysApplied > 0) {
		traceEntries.push({
			code: "clock.extension.applied",
			details: {
				daysApplied: extensionDaysApplied,
				daysRequested: extensionDaysRequested,
				maxAdditionalDays: effectiveClock.extension.maxAdditionalDays,
			},
			message: "Applied extension days to deadline",
		});
	}

	const finalDueAt = new Date(
		toDate(baseDueAt).getTime() +
			pauseMsApplied +
			extensionDaysApplied * DAY_IN_MS
	).toISOString();

	traceEntries.push({
		code: "clock.final",
		details: {
			finalDueAt,
			pauseDaysApplied: asDays(pauseMsApplied),
		},
		message: "Computed final deadline",
	});

	const authorityEvidenceRequired =
		policyPack.sections.representation.authorityEvidenceRequiredFor.includes(
			input.requestorType
		);
	const verificationRequired = resolveVerificationRequired(
		policyPack.sections.verification.requiredWhen,
		input
	);

	const requiredActions: string[] = [];
	if (authorityEvidenceRequired && !input.hasAuthorityEvidence) {
		requiredActions.push("collect_authority_evidence");
	}
	if (verificationRequired) {
		requiredActions.push("run_identity_verification");
	}
	if (policyPack.sections.response.requireManifest) {
		requiredActions.push("collect_artifact_manifest");
	}
	if (policyPack.sections.delivery.stepUpRequired) {
		requiredActions.push("issue_step_up_challenge");
	}

	const requiredNotices = buildRequiredNotices(
		input,
		effectiveClock.ackRequired,
		effectiveClock.ackDeadlineBusinessDays,
		extensionDaysApplied
	);

	return Effect.succeed({
		clock: {
			baseDueAt,
			extensionDaysApplied,
			finalDueAt,
			pauseDaysApplied: asDays(pauseMsApplied),
			policyVersion: input.policyVersion,
		},
		decision: {
			appealEligible: policyPack.sections.appeals.required,
			authorityEvidenceRequired,
			refusalEligible: true,
			requestAllowed: true,
			verificationRequired,
		},
		explainabilityTrace: traceEntries,
		matchedRuleIds: matchResult.matchedClockRules.map((rule) => rule.id),
		policyPackRef: {
			jurisdiction: policyPack.jurisdiction,
			packId: policyPack.packId,
			version: policyPack.version,
		},
		requiredActions,
		requiredNotices,
	});
};

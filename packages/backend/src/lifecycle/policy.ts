import { asObject } from "@dsar/guards";
import type { RequestRecord } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { RequestValidationError } from "../types/errors";
import type { JsonValue } from "./json";
import type { LifecycleAction } from "./state-machine";

/** Fallback tenant identifier used when payloads omit tenant context. */
export const DEFAULT_TENANT_ID = "tenant-default";

const DEFAULT_POLICY_VERSION = "policy-v1";
const DEFAULT_LOCALE = "en-GB";

/**
 * Resolves the tenant id from an arbitrary payload-like value.
 *
 * @param input - Payload or record that may expose a `tenantId`.
 * @returns The resolved tenant id, or the default tenant id when absent.
 */
export const getTenantId = (input?: unknown) => {
	const candidate = asObject(input)?.tenantId;
	return typeof candidate === "string" && candidate.length > 0
		? candidate
		: DEFAULT_TENANT_ID;
};

/**
 * Resolves the active policy version from a lifecycle payload.
 *
 * @param payload - Lifecycle payload that may include nested policy data.
 * @returns The resolved policy version string.
 */
export const getPolicyVersion = (payload: unknown) => {
	const policy = asObject(asObject(payload)?.policy);
	const version = policy?.policyVersion;
	return typeof version === "string" && version.length > 0
		? version
		: DEFAULT_POLICY_VERSION;
};

/**
 * Resolves the locale used for notification and audit rendering.
 *
 * @param payload - Lifecycle payload that may include a `locale`.
 * @returns The resolved locale string.
 */
export const getLocale = (payload: unknown) => {
	const locale = asObject(payload)?.locale;
	return typeof locale === "string" && locale.length > 0
		? locale
		: DEFAULT_LOCALE;
};

/**
 * Builds normalized audit metadata for AI-assisted lifecycle decisions.
 *
 * @param input - Payload and feature flag used to derive AI audit metadata.
 * @returns JSON-safe AI audit metadata for persistence and timelines.
 */
export const toAiAuditMetadata = (input: {
	readonly payload: unknown;
	readonly aiEnabled: boolean;
}): JsonValue => {
	const ai = asObject(asObject(input.payload)?.ai);
	if (!input.aiEnabled || ai === undefined) {
		return { enabled: false, fallbackMode: "deterministic" };
	}
	let confidence: number | undefined;
	if (typeof ai.confidence === "number" && Number.isFinite(ai.confidence)) {
		({ confidence } = ai);
	} else if (
		typeof ai.confidenceScore === "number" &&
		Number.isFinite(ai.confidenceScore)
	) {
		confidence = ai.confidenceScore;
	}
	const lowConfidence = typeof confidence === "number" && confidence < 0.7;
	return {
		capability: typeof ai.capability === "string" ? ai.capability : "unknown",
		confidence: confidence ?? null,
		enabled: true,
		fallbackMode: lowConfidence ? "manual_review" : "none",
		model: typeof ai.model === "string" ? ai.model : "unknown",
		modelVersion:
			typeof ai.modelVersion === "string" ? ai.modelVersion : "unknown",
		promptHash: typeof ai.promptHash === "string" ? ai.promptHash : "unknown",
	};
};

const readPolicyDecision = (
	request: RequestRecord
):
	| {
			readonly refusalEligible: boolean;
			readonly appealEligible: boolean;
	  }
	| undefined => {
	const capture = asObject(request.capture);
	const evaluation = asObject(capture?.policyEvaluation);
	const decision = asObject(evaluation?.decision);
	if (!decision) {
		return undefined;
	}
	return {
		appealEligible: decision.appealEligible === true,
		refusalEligible: decision.refusalEligible === true,
	};
};

/**
 * Enforces policy-derived guardrails for lifecycle transitions.
 *
 * @param request - Current request record whose policy evaluation is inspected.
 * @param action - Lifecycle action being attempted.
 * @returns An effect that fails when policy rules block the transition.
 */
export const enforcePolicyDecision = (
	request: RequestRecord,
	action: LifecycleAction
): Effect.Effect<void, RequestValidationError> => {
	const decision = readPolicyDecision(request);
	if (!decision) {
		return Effect.void;
	}
	if (action === "refuse" && !decision.refusalEligible) {
		return Effect.fail(
			new RequestValidationError({
				message:
					"Refusal is not permitted under the active policy for this request.",
				reasonCode: "POLICY_ENFORCEMENT_REFUSAL_BLOCKED",
			})
		);
	}
	return Effect.void;
};

import { asRecord } from "@dsar/guards";
import type {
	ClockSegmentRecord,
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import * as Effect from "effect/Effect";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const addDaysIso = (iso: string, days: number): string =>
	new Date(new Date(iso).getTime() + days * DAY_IN_MS).toISOString();

const readString = (
	value: Readonly<Record<string, JsonValue>> | undefined,
	key: string
): string | undefined => {
	const candidate = value?.[key];
	return typeof candidate === "string" ? candidate : undefined;
};

const readNumber = (
	value: Readonly<Record<string, JsonValue>> | undefined,
	key: string
): number | undefined => {
	const candidate = value?.[key];
	return typeof candidate === "number" ? candidate : undefined;
};

type PauseReason = "verification" | "clarification";

interface PauseWindow {
	readonly reason: PauseReason;
	readonly from: string;
	readonly to: string;
}

/**
 * Computed legal-clock segment derived from timeline and policy rules.
 */
export interface ComputedClockSegment {
	/** ISO-8601 segment start timestamp. */
	readonly from: string;
	/** ISO-8601 segment end timestamp. */
	readonly to: string;
	/** Plain label identifying the segment category at runtime (e.g. `"base"`,
	 *  `"verification"`, `"clarification"`, `"extension"`). */
	readonly reason: string;
	/** Whether elapsed time in this segment counts toward the statutory deadline. */
	readonly countsTowardDeadline: boolean;
	/** Semver policy version that governed this segment's behaviour. */
	readonly policyVersion: string;
	/** Identity of the actor (user or system) that triggered this segment. */
	readonly actor: string;
}

/**
 * Full legal-clock computation output for a request.
 */
export interface LegalClockComputation {
	/** ISO-8601 timestamp when the request was received (clock anchor). */
	readonly receivedAt: string;
	/** ISO-8601 due date computed from the policy deadline before adjustments. */
	readonly baseDueAt: string;
	/** ISO-8601 due date after pauses, extensions, and overrides are applied
	 *  (always >= `baseDueAt`). */
	readonly finalDueAt: string;
	/** Total extension days (whole or fractional) added by policy or manual
	 *  actions. */
	readonly extensionDaysApplied: number;
	/** Semver policy version used for deadline and pause rules. */
	readonly policyVersion: string;
	/** Policy pack identifier governing this computation. */
	readonly policyPack: string;
	/** Whether the clock anchors on receipt or verification completion. */
	readonly clockMode: "receipt" | "verification_complete";
	/** Pause windows parsed from timeline events. These may be present even
	 *  under a `"no_stop_clock"` policy; in that case they are informational
	 *  only and are **not** subtracted from the statutory deadline when
	 *  computing `finalDueAt`. */
	readonly pauses: readonly PauseWindow[];
	/** Derived clock segments produced during this evaluation (not yet
	 *  persisted). */
	readonly segments: readonly ComputedClockSegment[];
	/** Clock segments already persisted in the data store for this request. */
	readonly persistedSegments: readonly ClockSegmentRecord[];
}

const parsePauseWindows = (
	events: readonly RequestTimelineEventRecord[],
	now: string
): readonly PauseWindow[] => {
	const openPauseByReason: Partial<Record<PauseReason, string>> = {};
	const windows: PauseWindow[] = [];
	for (const event of events) {
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
	const orderedWindows = [...windows];
	orderedWindows.sort((left: PauseWindow, right: PauseWindow) =>
		left.from.localeCompare(right.from)
	);
	return orderedWindows;
};

const parseExtensionDays = (
	events: readonly RequestTimelineEventRecord[]
): number => {
	let total = 0;
	for (const event of events) {
		if (event.eventType !== "deadline_extended") {
			continue;
		}
		const payload = asRecord<JsonValue>(event.payload);
		const candidate = readNumber(payload, "additionalDays");
		total += candidate ?? 0;
	}
	return total;
};

const deriveClockPolicy = (
	request: RequestRecord
): {
	readonly responseDeadlineDays: number;
	readonly maxAdditionalDays: number;
	readonly verificationEffect: "stop_clock" | "no_stop_clock";
	readonly clarificationEffect: "stop_clock" | "no_stop_clock";
	readonly policyVersion: string;
	readonly policyPack: string;
} => {
	const capture = asRecord<JsonValue>(request.capture);
	const intakeSource = asRecord<JsonValue>(capture?.intakeSource);
	const policy = asRecord<JsonValue>(capture?.policy);
	const responseDeadlineDays = readNumber(policy, "responseDeadlineDays") ?? 30;
	const maxAdditionalDays = readNumber(policy, "maxAdditionalDays") ?? 60;
	const verificationEffect =
		readString(policy, "verificationEffect") === "no_stop_clock"
			? "no_stop_clock"
			: "stop_clock";
	const clarificationEffect =
		readString(policy, "clarificationEffect") === "no_stop_clock"
			? "no_stop_clock"
			: "stop_clock";
	return {
		clarificationEffect,
		maxAdditionalDays,
		policyPack: readString(policy, "policyPack") ?? "global-default",
		policyVersion:
			readString(policy, "policyVersion") ??
			readString(intakeSource, "policyVersion") ??
			"policy-v1",
		responseDeadlineDays,
		verificationEffect,
	};
};

const deriveReceivedAt = (request: RequestRecord): string => {
	const capture = asRecord<JsonValue>(request.capture);
	const intakeSource = asRecord<JsonValue>(capture?.intakeSource);
	return readString(intakeSource, "receivedAt") ?? request.receivedAt;
};

/**
 * Computes legal-clock deadlines and segment breakdowns for a request.
 *
 * Derives a base due date from the policy's `responseDeadlineDays`, then
 * adjusts it by adding time for stop-clock pauses (verification or
 * clarification, when the policy effect is `"stop_clock"`) and extensions
 * (capped at the policy's `maxAdditionalDays`). Pauses with a passthrough
 * effect do not alter the deadline. The result includes both derived segments
 * and any previously persisted segments for reconciliation.
 *
 * @param input - Computation context.
 * @param input.request - Persisted request record; its capture payload and
 *   policy fields are used to derive the clock policy and anchor timestamp.
 * @param input.timelineEvents - Chronological timeline events from which pause
 *   windows and extension days are extracted.
 * @param input.persistedSegments - Clock segments already stored for this
 *   request, passed through to the output for diff/reconciliation.
 * @param input.now - ISO-8601 current timestamp used as the close boundary for
 *   any open pause windows.
 * @param input.actor - Identity recorded on each derived segment.
 * @returns An `Effect` yielding a {@link LegalClockComputation} with
 *   `baseDueAt`, `finalDueAt`, pause intervals, derived segments, and
 *   persisted segments.
 */
export const computeLegalClock = (input: {
	readonly request: RequestRecord;
	readonly timelineEvents: readonly RequestTimelineEventRecord[];
	readonly persistedSegments: readonly ClockSegmentRecord[];
	readonly now: string;
	readonly actor: string;
}): Effect.Effect<LegalClockComputation> =>
	Effect.sync(() => {
		const policy = deriveClockPolicy(input.request);
		const receivedAt = deriveReceivedAt(input.request);
		const baseDueAt = addDaysIso(receivedAt, policy.responseDeadlineDays);
		const pauses = parsePauseWindows(input.timelineEvents, input.now);
		const extensionDaysApplied = Math.max(
			0,
			Math.min(
				parseExtensionDays(input.timelineEvents),
				policy.maxAdditionalDays
			)
		);
		let pauseMsApplied = 0;
		for (const pause of pauses) {
			if (
				(pause.reason === "verification" &&
					policy.verificationEffect === "stop_clock") ||
				(pause.reason === "clarification" &&
					policy.clarificationEffect === "stop_clock")
			) {
				const duration =
					new Date(pause.to).getTime() - new Date(pause.from).getTime();
				pauseMsApplied += Math.max(0, duration);
			}
		}
		const computedDueAt = new Date(
			new Date(baseDueAt).getTime() +
				pauseMsApplied +
				extensionDaysApplied * DAY_IN_MS
		);
		const baseDueAtMs = new Date(baseDueAt).getTime();
		const finalDueAt = new Date(
			Math.max(baseDueAtMs, computedDueAt.getTime())
		).toISOString();

		const segments: ComputedClockSegment[] = [
			{
				actor: input.actor,
				countsTowardDeadline: true,
				from: receivedAt,
				policyVersion: policy.policyVersion,
				reason: "base",
				to: baseDueAt,
			},
		];

		for (const pause of pauses) {
			const shouldStop =
				(pause.reason === "verification" &&
					policy.verificationEffect === "stop_clock") ||
				(pause.reason === "clarification" &&
					policy.clarificationEffect === "stop_clock");
			if (shouldStop) {
				segments.push({
					actor: input.actor,
					countsTowardDeadline: false,
					from: pause.from,
					policyVersion: policy.policyVersion,
					reason: pause.reason,
					to: pause.to,
				});
			}
		}

		if (extensionDaysApplied > 0) {
			segments.push({
				actor: input.actor,
				countsTowardDeadline: true,
				from: baseDueAt,
				policyVersion: policy.policyVersion,
				reason: "extension",
				to: finalDueAt,
			});
		}

		return {
			baseDueAt,
			clockMode: "receipt",
			extensionDaysApplied,
			finalDueAt,
			pauses,
			persistedSegments: input.persistedSegments,
			policyPack: policy.policyPack,
			policyVersion: policy.policyVersion,
			receivedAt,
			segments,
		} satisfies LegalClockComputation;
	});

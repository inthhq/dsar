import { createHash } from "node:crypto";

import type {
	ClockSegmentRecord,
	CreateClockSegmentInput,
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import type { Effect } from "effect/Effect";

import { computeLegalClock } from "../services/legal-clock/engine";
import type { LegalClockComputation } from "../services/legal-clock/engine";
import { RequestValidationError } from "../types/errors";
import type { LifecycleAction } from "./state-machine";

/** Number of milliseconds in a UTC day. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Adds whole days to an ISO timestamp.
 *
 * @param iso - ISO-8601 timestamp to shift.
 * @param days - Number of days to add.
 * @returns The shifted ISO-8601 timestamp.
 */
export const addDays = (iso: string, days: number) => {
	const parsed = new Date(iso);
	if (Number.isNaN(parsed.getTime())) {
		throw new RequestValidationError({
			message: `Invalid ISO date string: "${iso}"`,
			reasonCode: "REQUEST_VALIDATION_FAILED",
		});
	}
	if (!Number.isFinite(days)) {
		throw new RequestValidationError({
			message: `Invalid days value: "${days}"`,
			reasonCode: "REQUEST_VALIDATION_FAILED",
		});
	}
	return new Date(parsed.getTime() + days * MS_PER_DAY).toISOString();
};

type LifecycleEventType =
	| "clarification_requested"
	| "clarification_received"
	| "deadline_extended"
	| "verification_requested"
	| "verification_resolved"
	| "fulfilled"
	| "refused"
	| "closed";

/**
 * Maps a lifecycle action to the corresponding timeline event type.
 *
 * @param action - Lifecycle action being recorded.
 * @returns The timeline event type associated with the action.
 */
export const toEventType = (action: LifecycleAction): LifecycleEventType => {
	switch (action) {
		case "clarification_request": {
			return "clarification_requested";
		}
		case "clarification_receive": {
			return "clarification_received";
		}
		case "extension": {
			return "deadline_extended";
		}
		case "verification_request": {
			return "verification_requested";
		}
		case "verification_approve":
		case "verification_reject": {
			return "verification_resolved";
		}
		case "fulfil": {
			return "fulfilled";
		}
		case "refuse": {
			return "refused";
		}
		case "close": {
			return "closed";
		}
		default: {
			const unreachableAction: never = action;
			throw new Error(
				`Invariant violation: unsupported lifecycle action "${unreachableAction}"`
			);
		}
	}
};

const segmentSignature = (
	segment: Pick<
		CreateClockSegmentInput,
		"from" | "to" | "reason" | "countsTowardDeadline" | "policyVersion"
	>
) =>
	`${segment.from}|${segment.to}|${segment.reason}|${segment.countsTowardDeadline}|${segment.policyVersion}`;

/**
 * Removes clock segments that are already persisted for the same request/event.
 *
 * @param computed - Freshly computed clock segments.
 * @param existing - Previously persisted clock segments.
 * @param requestId - Request owning the clock computation.
 * @param eventId - Timeline event driving the recomputation.
 * @returns New clock segments that still need to be persisted.
 */
export const dedupeClockSegments = (
	computed: readonly {
		readonly from: string;
		readonly to: string;
		readonly reason: string;
		readonly countsTowardDeadline: boolean;
		readonly policyVersion: string;
		readonly actor: string;
	}[],
	existing: readonly ClockSegmentRecord[],
	requestId: string,
	eventId: string
): readonly CreateClockSegmentInput[] => {
	const existingSignatures = new Set(
		existing.map((segment) =>
			segmentSignature({
				countsTowardDeadline: segment.countsTowardDeadline,
				from: segment.from,
				policyVersion: segment.policyVersion,
				reason: segment.reason,
				to: segment.to,
			})
		)
	);
	const pending: CreateClockSegmentInput[] = [];
	for (const segment of computed) {
		const key = segmentSignature(segment);
		if (existingSignatures.has(key)) {
			continue;
		}
		const hashInput = `${eventId}:${requestId}:${key}`;
		const hash = createHash("sha256")
			.update(hashInput)
			.digest("hex")
			.slice(0, 8);
		pending.push({
			actor: segment.actor,
			countsTowardDeadline: segment.countsTowardDeadline,
			from: segment.from,
			id: `${eventId}-seg-${hash}`,
			policyVersion: segment.policyVersion,
			reason: segment.reason,
			requestId,
			to: segment.to,
		});
		existingSignatures.add(key);
	}
	return pending;
};

/**
 * Recomputes the legal clock for a request from current state and timelines.
 *
 * @param input - Request, timeline, persisted segments, actor, and clock context.
 * @returns The recomputed legal-clock result effect.
 */
export const recomputeClock = (input: {
	readonly request: RequestRecord;
	readonly timelineEvents: readonly RequestTimelineEventRecord[];
	readonly persistedSegments: readonly ClockSegmentRecord[];
	readonly actor: string;
	readonly now: string;
}): Effect.Effect<LegalClockComputation> =>
	computeLegalClock({
		actor: input.actor,
		now: input.now,
		persistedSegments: input.persistedSegments,
		request: input.request,
		timelineEvents: input.timelineEvents,
	});

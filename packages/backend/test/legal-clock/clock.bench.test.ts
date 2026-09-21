import type {
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";

import { computeLegalClock } from "../../src/services/legal-clock/engine";

const runPerfBenches = process.env.PERF === "1";

const TIMELINE_EVENT_COUNT = 512;
const WARMUP_ITERATIONS = 5;
const SAMPLE_ITERATIONS = 40;
const P95_BOUND_MS = 50;
const HOUR_MS = 60 * 60 * 1000;
const RECEIVED_AT = "2026-01-01T00:00:00.000Z";
const NOW_MS = Date.parse("2026-03-01T00:00:00.000Z");

const percentile = (samples: readonly number[], p: number): number => {
	const ordered = [...samples].toSorted((left, right) => left - right);
	if (ordered.length === 0) {
		return Number.POSITIVE_INFINITY;
	}
	const index = Math.min(
		ordered.length - 1,
		Math.max(0, Math.ceil(p * ordered.length) - 1)
	);
	return ordered[index] ?? Number.POSITIVE_INFINITY;
};

const baseRequest = (): RequestRecord => ({
	appeals: [],
	authority: { status: "not_required" },
	capture: {
		intakeSource: {
			receivedAt: RECEIVED_AT,
			type: "api",
		},
		policy: {
			clarificationEffect: "stop_clock",
			maxAdditionalDays: 60,
			policyPack: "global-default",
			policyVersion: "v1",
			responseDeadlineDays: 30,
			verificationEffect: "stop_clock",
		},
	},
	clockMode: "receipt",
	createdAt: RECEIVED_AT,
	dueAt: "2026-01-31T00:00:00.000Z",
	id: "req-clock-bench",
	receivedAt: RECEIVED_AT,
	requestor: { type: "subject" },
	status: "captured",
	tenantId: "tenant-default",
	updatedAt: RECEIVED_AT,
});

const timelineEvent = (
	index: number,
	eventType: string,
	createdAt: string,
	payload: RequestTimelineEventRecord["payload"] = {}
): RequestTimelineEventRecord => ({
	createdAt,
	eventType,
	id: `ev-${index}`,
	payload,
	requestId: "req-clock-bench",
	tenantId: "tenant-default",
});

const eventTypeForIndex = (index: number): string => {
	const remainder = index % 5;
	if (remainder === 0) {
		return "verification_requested";
	}
	if (remainder === 1) {
		return "verification_resolved";
	}
	if (remainder === 2) {
		return "clarification_requested";
	}
	if (remainder === 3) {
		return "clarification_received";
	}
	return "deadline_extended";
};

const makeTimeline = (): readonly RequestTimelineEventRecord[] => {
	const receivedAtMs = Date.parse(RECEIVED_AT);
	return Array.from({ length: TIMELINE_EVENT_COUNT }, (_, index) => {
		const createdAt = new Date(
			receivedAtMs + (index + 1) * HOUR_MS
		).toISOString();
		const eventType = eventTypeForIndex(index);
		return timelineEvent(
			index,
			eventType,
			createdAt,
			eventType === "deadline_extended" ? { additionalDays: 1 } : {}
		);
	});
};

describe.skipIf(!runPerfBenches)("legal clock recompute bench", () => {
	it.effect(
		`p95 of computeLegalClock on ${TIMELINE_EVENT_COUNT} timeline events stays under ${P95_BOUND_MS}ms`,
		() =>
			Effect.gen(function* clockRecomputeBench() {
				yield* TestClock.setTime(NOW_MS);
				const now = yield* Clock.currentTimeMillis.pipe(
					Effect.map((ms) => new Date(ms).toISOString())
				);
				const request = baseRequest();
				const timelineEvents = makeTimeline();
				const samples: number[] = [];
				let lastPauseCount = 0;

				for (const iteration of Array.from(
					{ length: WARMUP_ITERATIONS + SAMPLE_ITERATIONS },
					(_, index) => index
				)) {
					const started = performance.now();
					const computed = yield* computeLegalClock({
						actor: "bench",
						now,
						persistedSegments: [],
						request,
						timelineEvents,
					});
					const elapsed = performance.now() - started;
					lastPauseCount = computed.pauses.length;
					if (iteration >= WARMUP_ITERATIONS) {
						samples.push(elapsed);
					}
				}

				const p95Ms = percentile(samples, 0.95);
				expect(lastPauseCount).toBeGreaterThan(0);
				expect(p95Ms).toBeLessThan(P95_BOUND_MS);
			}),
		15_000
	);
});

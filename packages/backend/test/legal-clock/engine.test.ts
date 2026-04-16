import type {
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { computeLegalClock } from "../../src/services/legal-clock/engine";

const baseRequest = (overrides?: Partial<RequestRecord>): RequestRecord => ({
	appeals: [],
	authority: { status: "not_required" },
	capture: {
		intakeSource: {
			receivedAt: "2026-01-01T00:00:00.000Z",
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
	createdAt: "2026-01-01T00:00:00.000Z",
	dueAt: "2026-01-31T00:00:00.000Z",
	id: "req-1",
	receivedAt: "2025-12-31T00:00:00.000Z",
	requestor: { type: "subject" },
	status: "captured",
	tenantId: "tenant-default",
	updatedAt: "2026-01-01T00:00:00.000Z",
	...overrides,
});

const event = (
	id: string,
	eventType: string,
	createdAt: string
): RequestTimelineEventRecord => ({
	createdAt,
	eventType,
	id,
	payload: {},
	requestId: "req-1",
	tenantId: "tenant-default",
});

describe("legal clock engine", () => {
	it.effect("starts clock from intake source receivedAt", () =>
		Effect.gen(function* _() {
			const computed = yield* computeLegalClock({
				actor: "tester",
				now: "2026-01-01T00:00:00.000Z",
				persistedSegments: [],
				request: baseRequest(),
				timelineEvents: [],
			});

			expect(computed.receivedAt).toBe("2026-01-01T00:00:00.000Z");
			expect(computed.baseDueAt).toBe("2026-01-31T00:00:00.000Z");
		})
	);

	it.effect("keeps california verification pending time on-clock", () =>
		Effect.gen(function* _() {
			const computed = yield* computeLegalClock({
				actor: "tester",
				now: "2026-01-04T00:00:00.000Z",
				persistedSegments: [],
				request: baseRequest({
					capture: {
						intakeSource: {
							receivedAt: "2026-01-01T00:00:00.000Z",
							type: "api",
						},
						policy: {
							policyVersion: "ca-v1",
							responseDeadlineDays: 45,
							verificationEffect: "no_stop_clock",
						},
					},
				}),
				timelineEvents: [
					event("ev-1", "verification_requested", "2026-01-02T00:00:00.000Z"),
					event("ev-2", "verification_resolved", "2026-01-04T00:00:00.000Z"),
				],
			});

			expect(computed.baseDueAt).toBe("2026-02-15T00:00:00.000Z");
			expect(computed.finalDueAt).toBe("2026-02-15T00:00:00.000Z");
		})
	);

	it.effect("supports deterministic open-pause timing", () =>
		Effect.gen(function* _() {
			const first = yield* computeLegalClock({
				actor: "tester",
				now: "2026-01-02T00:00:00.000Z",
				persistedSegments: [],
				request: baseRequest(),
				timelineEvents: [
					event(
						"ev-open",
						"verification_requested",
						"2026-01-02T00:00:00.000Z"
					),
				],
			});

			const second = yield* computeLegalClock({
				actor: "tester",
				now: "2026-01-04T00:00:00.000Z",
				persistedSegments: [],
				request: baseRequest(),
				timelineEvents: [
					event(
						"ev-open",
						"verification_requested",
						"2026-01-02T00:00:00.000Z"
					),
				],
			});

			expect(first.finalDueAt).toBe("2026-01-31T00:00:00.000Z");
			expect(second.finalDueAt).toBe("2026-02-02T00:00:00.000Z");
		})
	);
});

import type {
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	LegalClock,
	LegalClockLive,
} from "../../src/services/legal-clock/service";

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

describe("LegalClock service layer", () => {
	it.effect("resolves recompute through LegalClockLive layer", () =>
		Effect.gen(function* resolveRecompute() {
			const clock = yield* LegalClock;
			const computed = yield* clock.recompute({
				actor: "tester",
				now: "2026-01-01T00:00:00.000Z",
				persistedSegments: [],
				request: baseRequest(),
				timelineEvents: [],
			});

			expect(computed.receivedAt).toBe("2026-01-01T00:00:00.000Z");
			expect(computed.baseDueAt).toBe("2026-01-31T00:00:00.000Z");
		}).pipe(Effect.provide(LegalClockLive))
	);

	it.effect("handles verification pauses through the service", () =>
		Effect.gen(function* verificationPauses() {
			const clock = yield* LegalClock;
			const computed = yield* clock.recompute({
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

			expect(computed.finalDueAt).toBe("2026-02-02T00:00:00.000Z");
		}).pipe(Effect.provide(LegalClockLive))
	);

	it.effect(
		"produces consistent results between service and direct engine call",
		() =>
			Effect.gen(function* consistencyCheck() {
				const clock = yield* LegalClock;
				const input = {
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
				} as const;

				const computed = yield* clock.recompute(input);

				expect(computed.baseDueAt).toBe("2026-02-15T00:00:00.000Z");
				expect(computed.finalDueAt).toBe("2026-02-15T00:00:00.000Z");
			}).pipe(Effect.provide(LegalClockLive))
	);
});

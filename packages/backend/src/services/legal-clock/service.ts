import type {
	ClockSegmentRecord,
	RequestRecord,
	RequestTimelineEventRecord,
} from "@dsar/persistence";
import type { Effect } from "effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";

import { computeLegalClock } from "./engine";
import type { LegalClockComputation } from "./engine";

/**
 * Contract for the legal-clock computation service used to derive statutory
 * deadlines from request intake, timeline events, and persisted clock segments.
 */
export interface LegalClockService {
	/**
	 * Recomputes the full legal-clock state for a request by replaying timeline
	 * events against persisted segments and the active policy pack.
	 *
	 * @param input.request - Persisted request record supplying intake date and policy context.
	 * @param input.timelineEvents - Ordered lifecycle events (pauses, extensions, etc.) affecting the clock.
	 * @param input.persistedSegments - Previously stored clock segments used as a computation baseline.
	 * @param input.now - Current ISO-8601 timestamp used for open-interval calculations.
	 * @param input.actor - Actor identity recorded on any resulting audit entries.
	 * @returns Effect yielding a {@link LegalClockComputation} with base/final due dates,
	 *   extension days, pause windows, and the governing policy version.
	 */
	readonly recompute: (input: {
		readonly request: RequestRecord;
		readonly timelineEvents: readonly RequestTimelineEventRecord[];
		readonly persistedSegments: readonly ClockSegmentRecord[];
		readonly now: string;
		readonly actor: string;
	}) => Effect.Effect<LegalClockComputation>;
}

/**
 * Effect service tag for {@link LegalClockService}, used for dependency injection
 * via the Effect service map.
 */
export class LegalClock extends ServiceMap.Service<
	LegalClock,
	LegalClockService
>()("LegalClock") {}

/**
 * Live layer providing {@link LegalClock} backed by {@link computeLegalClock}.
 */
export const LegalClockLive = Layer.succeed(LegalClock)({
	recompute: computeLegalClock,
} satisfies LegalClockService);

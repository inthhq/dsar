import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { applyLifecycleTransition } from "../../src/lifecycle/state-machine";
import {
	InvalidLifecycleTransitionError,
	MissingLifecycleRationaleError,
} from "../../src/types/errors";

describe("lifecycle state machine", () => {
	it.effect("allows valid transitions", () =>
		Effect.gen(function* _() {
			const result = yield* applyLifecycleTransition({
				action: "verification_request",
				currentStatus: "captured",
				requestId: "req-1",
			});
			expect(result.from).toBe("captured");
			expect(result.to).toBe("verification_pending");
		})
	);

	it.effect("rejects invalid transitions with deterministic reason code", () =>
		Effect.gen(function* _() {
			const result = yield* Effect.result(
				applyLifecycleTransition({
					action: "close",
					currentStatus: "in_progress",
					requestId: "req-2",
				})
			);
			expect(result._tag).toBe("Failure");
			const { failure } = result as { readonly failure: unknown };
			expect(failure).toBeInstanceOf(InvalidLifecycleTransitionError);
			expect((failure as { readonly reasonCode: string }).reasonCode).toBe(
				"LIFECYCLE_TRANSITION_DISALLOWED"
			);
		})
	);

	it.effect("enforces rationale for guarded transitions", () =>
		Effect.gen(function* _() {
			const result = yield* Effect.result(
				applyLifecycleTransition({
					action: "extension",
					currentStatus: "in_progress",
					requestId: "req-3",
				})
			);
			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				MissingLifecycleRationaleError
			);
			const { failure } = result as {
				readonly failure: { readonly reasonCode: string };
			};
			expect(failure.reasonCode).toBe("LIFECYCLE_RATIONALE_MISSING");
		})
	);
});

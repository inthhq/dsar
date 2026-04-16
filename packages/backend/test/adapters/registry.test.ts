import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeAdapterRegistry } from "../../src/adapters";
import {
	makeInboundFixture,
	makeNotificationFixture,
	makeStorageFixture,
} from "./conformance/fixtures";

describe("adapter registry", () => {
	it.effect("resolves registered adapters by capability", () =>
		Effect.gen(function* _() {
			const registry = makeAdapterRegistry([
				makeNotificationFixture(),
				makeStorageFixture({ key: "vercel-blob" }),
				makeInboundFixture({ key: "c15t" }),
			]);

			expect([
				registry.resolveNotification()?.capability,
				registry.resolveStorage()?.capability,
				registry.resolveStorage("vercel-blob")?.key,
				registry.resolveInbound()?.capability,
				registry.resolveInbound("c15t")?.key,
			]).toStrictEqual([
				"notifications",
				"storage",
				"vercel-blob",
				"inbound",
				"c15t",
			]);

			const summary = yield* registry.healthSummary();
			expect(summary.map((entry) => entry.health.ok)).toStrictEqual([
				true,
				true,
				true,
			]);
		})
	);

	it.effect("supports no-adapter mode without failures", () =>
		Effect.gen(function* _() {
			const registry = makeAdapterRegistry();
			expect(registry.resolveNotification()).toBeUndefined();
			expect(registry.resolveStorage()).toBeUndefined();
			expect(registry.resolveInbound()).toBeUndefined();
			const summary = yield* registry.healthSummary();
			expect(summary).toStrictEqual([]);
		})
	);
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
	CoreClientFactory,
	CoreClientFactoryCached,
	CoreClientFactoryLive,
} from "#src/service";

const CachedLayer = Layer.provide(
	CoreClientFactoryCached,
	CoreClientFactoryLive
);

describe("@dsar/core CoreClientFactory", () => {
	it("coreClientFactoryLive creates a fresh client each call", async () => {
		const program = Effect.gen(function* _() {
			const factory = yield* Effect.service(CoreClientFactory);
			const first = yield* factory.create({ mode: "offline" });
			const second = yield* factory.create({ mode: "offline" });
			return { first, second };
		}).pipe(Effect.provide(CoreClientFactoryLive));

		const { first, second } = await Effect.runPromise(program);
		expect(first).not.toBe(second);
	});

	it("coreClientFactoryCached returns same instance for equivalent config", async () => {
		const program = Effect.gen(function* _() {
			const factory = yield* Effect.service(CoreClientFactory);
			const first = yield* factory.create({
				fixtures: { status: { service: "offline-service", status: "ok" } },
				mode: "offline",
			});
			const second = yield* factory.create({
				fixtures: { status: { service: "offline-service", status: "ok" } },
				mode: "offline",
			});
			return { first, second };
		}).pipe(Effect.provide(CachedLayer));

		const { first, second } = await Effect.runPromise(program);
		expect(first).toBe(second);
	});

	it("coreClientFactoryCached creates different instances for different configs", async () => {
		const program = Effect.gen(function* _() {
			const factory = yield* Effect.service(CoreClientFactory);
			const offline = yield* factory.create({ mode: "offline" });
			const custom = yield* factory.create({
				handler: () => ({ status: "stubbed" }),
				mode: "custom",
			});
			return { custom, offline };
		}).pipe(Effect.provide(CachedLayer));

		const { custom, offline } = await Effect.runPromise(program);
		expect(offline).not.toBe(custom);
	});

	it("coreClientFactoryCached isolates state per layer instance", async () => {
		const makeProgram = () =>
			Effect.gen(function* _() {
				const factory = yield* Effect.service(CoreClientFactory);
				return yield* factory.create({ mode: "offline" });
			}).pipe(Effect.provide(CachedLayer));

		const first = await Effect.runPromise(makeProgram());
		const second = await Effect.runPromise(makeProgram());
		expect(first).not.toBe(second);
	});
});

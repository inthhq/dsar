import { describe, expect, it } from "@effect/vitest";

import { makeRedisRateLimitStore } from "#src";
import type { RedisRateLimitClient } from "#src";

const makeClient = (
	result: unknown,
	calls: unknown[] = []
): RedisRateLimitClient => ({
	eval: (script, numberOfKeys, ...args) => {
		calls.push({ args, numberOfKeys, script });
		return result;
	},
});

describe("redis rate-limit store", () => {
	it("maps allowed fixed-window results to the backend store contract", async () => {
		const calls: unknown[] = [];
		const store = makeRedisRateLimitStore({
			client: makeClient([1, 7, 6, 1000], calls),
			keyPrefix: "tenant-a",
		});

		const result = await store.consume({
			key: "intake:ip:POST:/webhooks/inbound/slack:198.51.100.5",
			limit: 7,
			nowMs: 500,
			windowMs: 1000,
		});

		expect(result).toStrictEqual({
			allowed: true,
			limit: 7,
			remaining: 6,
			resetAtMs: 1000,
		});
		expect(calls).toMatchObject([
			{
				args: [
					"tenant-a:intake:ip:POST:/webhooks/inbound/slack:198.51.100.5",
					7,
					1000,
					500,
				],
				numberOfKeys: 1,
			},
		]);
	});

	it("maps blocked fixed-window results to the backend store contract", async () => {
		const store = makeRedisRateLimitStore({
			client: makeClient(["0", "3", "0", "9000"]),
		});

		const result = await store.consume({
			key: "intake:tenant:POST:/webhooks/inbound/resend:tenant-1",
			limit: 3,
			nowMs: 8000,
			windowMs: 1000,
		});

		expect(result).toStrictEqual({
			allowed: false,
			limit: 3,
			remaining: 0,
			resetAtMs: 9000,
		});
	});
});

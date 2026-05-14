import { describe, expect, it } from "@effect/vitest";

import { makeUpstashRateLimitStore } from "#src";
import type { UpstashRateLimitClient } from "#src";

const makeClient = (
	result: unknown,
	calls: unknown[] = []
): UpstashRateLimitClient => ({
	eval: (script, keys, args) => {
		calls.push({ args, keys, script });
		return result;
	},
});

describe("upstash rate-limit store", () => {
	it("maps allowed fixed-window results to the backend store contract", async () => {
		const calls: unknown[] = [];
		const store = makeUpstashRateLimitStore({
			client: makeClient([1, 9, 8, 1500], calls),
			keyPrefix: "edge",
		});

		const result = await store.consume({
			key: "intake:ip:POST:/webhooks/inbound/slack:198.51.100.5",
			limit: 9,
			nowMs: 500,
			windowMs: 1000,
		});

		expect(result).toStrictEqual({
			allowed: true,
			limit: 9,
			remaining: 8,
			resetAtMs: 1500,
		});
		expect(calls).toMatchObject([
			{
				args: [9, 1000, 500],
				keys: ["edge:intake:ip:POST:/webhooks/inbound/slack:198.51.100.5"],
			},
		]);
	});

	it("maps blocked fixed-window results to the backend store contract", async () => {
		const store = makeUpstashRateLimitStore({
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

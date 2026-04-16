import { describe, expect, it } from "@effect/vitest";

import { buildCoreClient } from "#src/client";
const okStatusFetch = (() =>
	Response.json({
		data: { service: "@dsar/backend", status: "ok" },
		ok: true,
	})) as unknown as typeof fetch;

describe("@dsar/core mode validation", () => {
	it("rejects missing baseUrl for managed mode", () => {
		expect(() =>
			buildCoreClient(
				{
					mode: "managed",
				},
				{}
			)
		).toThrow(/requires baseUrl or DSAR_API_URL/);
	});

	it("accepts DSAR_API_URL from environment for self-hosted mode", async () => {
		const client = buildCoreClient(
			{
				fetch: okStatusFetch,
				mode: "self-hosted",
			},
			{
				DSAR_API_URL: "https://env-hosted.test/api/v1",
			}
		);
		const status = await client.sdk.status();
		expect(status.unwrap().status).toBe("ok");
	});

	it("returns deterministic fallback payloads for offline mode", async () => {
		const client = buildCoreClient({
			mode: "offline",
		});
		const unknownOperation = await client.sdk.requests.clockExplain("req-1");
		expect(unknownOperation.unwrap()).toStrictEqual({
			mode: "offline",
			operation: "requests.clockExplain",
			status: "stubbed",
		});
	});
});

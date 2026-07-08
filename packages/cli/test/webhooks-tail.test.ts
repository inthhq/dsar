/* oxlint-disable jest/no-conditional-in-test, max-statements -- test helpers branch on stub state. */
import { describe, expect, it } from "@effect/vitest";

import { runWebhookTailLoop } from "#src/commands/webhooks-tail";
import type {
	ApiClient,
	ApiRequest,
	CommandExecutionContext,
	GlobalCliConfig,
} from "#src/types";

const makeGlobal = (
	override: Partial<GlobalCliConfig> = {}
): GlobalCliConfig => ({
	apiUrl: "https://example.test",
	fetch,
	output: "json",
	...override,
});

const makeContext = (input: {
	readonly flags: Readonly<Record<string, string>>;
	readonly invoke: (request: ApiRequest) => Promise<unknown>;
	readonly writeLine: (line: string) => void;
	readonly globalOverride?: Partial<GlobalCliConfig>;
}): CommandExecutionContext => ({
	api: { invoke: input.invoke } as ApiClient,
	input: {
		commandTokens: ["webhooks", "tail"],
		flags: input.flags,
		global: makeGlobal(input.globalOverride),
	},
	params: {},
	writeLine: input.writeLine,
});

const makeDispatch = (index: number) => ({
	createdAt: `2026-01-01T00:00:0${index}.000Z`,
	dispatchId: `dispatch-${index}`,
	eventId: `evt-${index}`,
	requestId: `req-${index}`,
	status: "failed",
});

describe("webhooks tail polling loop", () => {
	it("streams dispatches and advances the created_after cursor", async () => {
		const calls: ApiRequest[] = [];
		const lines: string[] = [];
		const pages: readonly (readonly {
			readonly createdAt: string;
			readonly dispatchId: string;
			readonly eventId: string;
			readonly requestId: string;
			readonly status: string;
		}[])[] = [
			[
				{
					createdAt: "2026-01-01T00:00:00.000Z",
					dispatchId: "dispatch-1",
					eventId: "evt-1",
					requestId: "req-1",
					status: "failed",
				},
			],
			[
				{
					createdAt: "2026-01-02T00:00:00.000Z",
					dispatchId: "dispatch-2",
					eventId: "evt-2",
					requestId: "req-2",
					status: "delivered",
				},
			],
		];
		let pollIndex = 0;
		const ctx = makeContext({
			flags: {
				interval: "1",
				"max-polls": "2",
				status: "failed",
			},
			invoke: (request) => {
				calls.push(request);
				const items = pages[pollIndex] ?? [];
				pollIndex += 1;
				return Promise.resolve({ data: { items } });
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runWebhookTailLoop(ctx, new AbortController().signal);
		expect(result.polls).toBe(2);
		expect(result.emitted).toBe(2);
		expect(lines.map((line) => JSON.parse(line).dispatchId)).toStrictEqual([
			"dispatch-1",
			"dispatch-2",
		]);
		expect(calls[0]?.query?.status).toBe("failed");
		expect(calls[1]?.query?.created_after).toBe("2026-01-01T00:00:00.000Z");
	});

	it("drains every page when a burst exceeds the poll limit", async () => {
		const lines: string[] = [];
		const calls: ApiRequest[] = [];
		const pagesByOffset: Readonly<Record<string, readonly unknown[]>> = {
			// Newest-first pages, mirroring the DESC ordering of the endpoint.
			"0": [makeDispatch(3), makeDispatch(2)],
			"2": [makeDispatch(1)],
		};
		const ctx = makeContext({
			flags: {
				interval: "1",
				limit: "2",
				"max-polls": "1",
			},
			invoke: (request) => {
				calls.push(request);
				const offset = request.query?.offset ?? "0";
				return Promise.resolve({
					data: { items: pagesByOffset[offset] ?? [] },
				});
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runWebhookTailLoop(ctx, new AbortController().signal);
		expect(result.polls).toBe(1);
		expect(result.emitted).toBe(3);
		expect(lines.map((line) => JSON.parse(line).dispatchId)).toStrictEqual([
			"dispatch-1",
			"dispatch-2",
			"dispatch-3",
		]);
		expect(calls.map((call) => call.query?.offset)).toStrictEqual(["0", "2"]);
	});

	it("deduplicates dispatches seen across overlapping polls", async () => {
		const lines: string[] = [];
		let polls = 0;
		const duplicate = {
			createdAt: "2026-01-01T00:00:00.000Z",
			dispatchId: "dispatch-1",
			eventId: "evt-1",
			requestId: "req-1",
			status: "failed",
		};
		const ctx = makeContext({
			flags: {
				interval: "1",
				"max-polls": "2",
			},
			invoke: () => {
				polls += 1;
				return Promise.resolve({ data: { items: [duplicate] } });
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runWebhookTailLoop(ctx, new AbortController().signal);
		expect(polls).toBe(2);
		expect(result.emitted).toBe(1);
		expect(lines).toHaveLength(1);
	});

	it("runs exactly one poll in once mode and forwards filters", async () => {
		const calls: ApiRequest[] = [];
		const ctx = makeContext({
			flags: {
				"created-after": "2026-01-01T00:00:00.000Z",
				"endpoint-id": "default",
				limit: "25",
				once: "true",
				status: "failed",
			},
			invoke: (request) => {
				calls.push(request);
				return Promise.resolve({ data: { items: [] } });
			},
			writeLine: () => {
				// no-op
			},
		});
		const result = await runWebhookTailLoop(ctx, new AbortController().signal);
		expect(result.polls).toBe(1);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.query).toMatchObject({
			created_after: "2026-01-01T00:00:00.000Z",
			endpoint_id: "default",
			limit: "25",
			status: "failed",
		});
	});

	it("formats dispatches in text mode", async () => {
		const lines: string[] = [];
		const ctx = makeContext({
			flags: { once: "true" },
			globalOverride: { output: "text" },
			invoke: () =>
				Promise.resolve({
					data: {
						items: [
							{
								createdAt: "2026-01-01T00:00:00.000Z",
								dispatchId: "dispatch-1",
								endpointId: "default",
								error: "500",
								eventId: "evt-1",
								requestId: "req-1",
								status: "failed",
							},
						],
					},
				}),
			writeLine: (line) => lines.push(line),
		});
		await runWebhookTailLoop(ctx, new AbortController().signal);
		expect(lines[0]).toBe(
			"[2026-01-01T00:00:00.000Z] failed dispatch=dispatch-1 event=evt-1 endpoint=default request=req-1 error=500"
		);
	});

	it("rejects invalid interval and propagates API errors", async () => {
		const invalidCtx = makeContext({
			flags: { interval: "0" },
			invoke: () => Promise.resolve({ data: { items: [] } }),
			writeLine: () => {
				// no-op
			},
		});
		await expect(
			runWebhookTailLoop(invalidCtx, new AbortController().signal)
		).rejects.toThrow(/--interval/);

		const failingCtx = makeContext({
			flags: { once: "true" },
			invoke: () => Promise.reject(new Error("api unavailable")),
			writeLine: () => {
				// no-op
			},
		});
		await expect(
			runWebhookTailLoop(failingCtx, new AbortController().signal)
		).rejects.toThrow(/api unavailable/);
	});
});

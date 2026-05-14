/* oxlint-disable jest/no-conditional-in-test -- test helpers branch on stub state. */
import { describe, expect, it } from "@effect/vitest";

import { runAuditTailLoop } from "#src/commands/audit-tail";
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
		commandTokens: ["audit", "tail"],
		flags: input.flags,
		global: makeGlobal(input.globalOverride),
	},
	params: {},
	writeLine: input.writeLine,
});

describe("audit tail polling loop", () => {
	it("streams events from successive pages and tracks last seen timestamp", async () => {
		const calls: ApiRequest[] = [];
		const lines: string[] = [];
		const pages: readonly (readonly {
			readonly id: string;
			readonly action: string;
			readonly actor: string;
			readonly createdAt: string;
			readonly object: string;
			readonly sequence: number;
		}[])[] = [
			[
				{
					action: "capture",
					actor: "operator-1",
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "evt-1",
					object: "request",
					sequence: 1,
				},
			],
			[
				{
					action: "verify",
					actor: "operator-2",
					createdAt: "2026-01-02T00:00:00.000Z",
					id: "evt-2",
					object: "request",
					sequence: 2,
				},
			],
		];
		let pollIndex = 0;
		const ctx = makeContext({
			flags: {
				interval: "1",
				"max-polls": "2",
				request: "req-1",
			},
			invoke: (request) => {
				calls.push(request);
				const items = pages[pollIndex] ?? [];
				pollIndex += 1;
				return Promise.resolve({
					data: {
						items,
						pagination: { limit: 200 },
					},
				});
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runAuditTailLoop(ctx, new AbortController().signal);
		expect(result.polls).toBe(2);
		expect(result.emitted).toBe(2);
		expect(lines.map((line) => JSON.parse(line).id)).toStrictEqual([
			"evt-1",
			"evt-2",
		]);
		expect(calls[1]?.query?.created_after).toBe("2026-01-01T00:00:00.000Z");
	});

	it("deduplicates events seen across overlapping polls", async () => {
		const lines: string[] = [];
		let pollIndex = 0;
		const ctx = makeContext({
			flags: {
				interval: "1",
				"max-polls": "2",
				request: "req-1",
			},
			invoke: () => {
				const duplicate = {
					action: "capture",
					actor: "operator-1",
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "evt-1",
					object: "request",
					sequence: 1,
				};
				pollIndex += 1;
				return Promise.resolve({
					data: {
						items: [duplicate],
						pagination: { limit: 200 },
					},
				});
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runAuditTailLoop(ctx, new AbortController().signal);
		expect(pollIndex).toBe(2);
		expect(result.emitted).toBe(1);
	});

	it("aborts when the signal fires before the next poll", async () => {
		const lines: string[] = [];
		const controller = new AbortController();
		const ctx = makeContext({
			flags: {
				interval: "10000",
				"max-polls": "5",
				request: "req-1",
			},
			invoke: () => {
				controller.abort();
				return Promise.resolve({
					data: { items: [], pagination: { limit: 200 } },
				});
			},
			writeLine: (line) => lines.push(line),
		});
		const result = await runAuditTailLoop(ctx, controller.signal);
		expect(result.polls).toBe(1);
	});

	it("formats events as `[ts] actor action object` in text mode", async () => {
		const lines: string[] = [];
		const ctx = makeContext({
			flags: {
				"max-polls": "1",
				request: "req-1",
			},
			globalOverride: { output: "text" },
			invoke: () =>
				Promise.resolve({
					data: {
						items: [
							{
								action: "verify",
								actor: "operator-1",
								createdAt: "2026-01-01T00:00:00.000Z",
								id: "evt-1",
								object: "request",
								requestId: "req-1",
								sequence: 1,
							},
						],
						pagination: { limit: 200 },
					},
				}),
			writeLine: (line) => lines.push(line),
		});
		await runAuditTailLoop(ctx, new AbortController().signal);
		expect(lines[0]).toBe(
			"[2026-01-01T00:00:00.000Z] operator-1 verify request request=req-1"
		);
	});

	it("requires --request", async () => {
		const ctx = makeContext({
			flags: {},
			invoke: () => Promise.resolve({ data: { items: [] } }),
			writeLine: () => {
				// no-op
			},
		});
		await expect(
			runAuditTailLoop(ctx, new AbortController().signal)
		).rejects.toThrow(/--request/);
	});
});

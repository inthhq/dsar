import { describe, expect, it } from "@effect/vitest";

import { runCli } from "#src/runtime";

describe(runCli, () => {
	it("prints help when requested", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: ["--help"],
			stdout: (line) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(stdout[0]).toContain("DSAR CLI");
	});

	it("returns non-zero for unknown command", async () => {
		const stderr: string[] = [];
		const exitCode = await runCli({
			argv: ["unknown", "--api-url", "https://example.test"],
			stderr: (line) => stderr.push(line),
		});
		expect(exitCode).toBe(1);
		expect(stderr[0]).toContain("Unknown command");
	});

	it("invokes status endpoint and emits json output", async () => {
		const stdout: string[] = [];
		const calls: RequestInit[] = [];
		const exitCode = await runCli({
			argv: ["status", "--api-url", "https://example.test", "--output", "json"],
			fetch: (_input, init) => {
				calls.push(init as RequestInit);
				return Promise.resolve(
					Response.json({
						data: {
							service: "@dsar/backend",
							status: "ok",
						},
						ok: true,
					})
				);
			},
			stdout: (line) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: "GET" });
		expect(stdout[0]).toContain('"ok":true');
	});
});

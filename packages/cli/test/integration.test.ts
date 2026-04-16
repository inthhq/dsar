import { describe, expect, it } from "@effect/vitest";
/* oxlint-disable max-statements */

import { runCli } from "#src/runtime";

import { E2E_API_TOKEN, E2E_API_URL, makeRuntimeFetch } from "./e2e/harness";

describe("cLI integration", () => {
	it("calls status endpoint against backend runtime", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: ["status", "--api-url", E2E_API_URL, "--output", "json"],
			fetch: makeRuntimeFetch(),
			stdout: (line) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(stdout[0]).toContain("@dsar/backend");
	});

	it("supports requests clock explain command", async () => {
		const fetch = makeRuntimeFetch();
		const createStdout: string[] = [];
		const createExitCode = await runCli({
			argv: [
				"requests",
				"create",
				"--json",
				JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				"--api-url",
				E2E_API_URL,
				"--output",
				"json",
				"--token",
				E2E_API_TOKEN,
			],
			fetch,
			stdout: (line) => createStdout.push(line),
		});
		expect(createExitCode).toBe(0);
		const parsed = JSON.parse(createStdout[0]) as {
			data: { data: { id: string } };
		};
		const created = parsed.data.data;
		expect(created.id).toBeDefined();
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: [
				"requests",
				"clock",
				"explain",
				created.id,
				"--api-url",
				E2E_API_URL,
				"--output",
				"json",
				"--token",
				E2E_API_TOKEN,
			],
			fetch,
			stdout: (line) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(stdout[0]).toContain("finalDueAt");
	});
});

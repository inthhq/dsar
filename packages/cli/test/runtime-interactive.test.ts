/* oxlint-disable @typescript-eslint/consistent-type-imports */
import { describe, expect, it } from "@effect/vitest";

import { runCli } from "#src/runtime";

const { runInteractiveWizard } = vi.hoisted(() => ({
	runInteractiveWizard:
		vi.fn<
			(
				env: NodeJS.ProcessEnv,
				skipGlobalPrompts?: boolean
			) => Promise<readonly string[] | null>
		>(),
}));

vi.mock<typeof import("#src/interactive/wizard")>(
	import("#src/interactive/wizard"),
	() => ({
		runInteractiveWizard,
	})
);

describe("runCli interactive mode", () => {
	it("launches wizard for empty argv and executes selected command", async () => {
		runInteractiveWizard.mockReset();
		runInteractiveWizard.mockResolvedValue([
			"status",
			"--api-url",
			"https://example.test",
			"--output",
			"json",
		]);
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: [],
			fetch: () =>
				Promise.resolve(
					Response.json({
						data: {
							service: "@dsar/backend",
							status: "ok",
						},
						ok: true,
					})
				),
			stdout: (line: string) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(runInteractiveWizard).toHaveBeenCalledTimes(1);
		expect(runInteractiveWizard).toHaveBeenCalledWith(
			expect.any(Object),
			false
		);
		expect(stdout[0]).toContain('"ok":true');
	});

	it("returns zero when interactive wizard is cancelled", async () => {
		runInteractiveWizard.mockReset();
		runInteractiveWizard.mockResolvedValue(null);
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: [],
			stdout: (line: string) => stdout.push(line),
		});
		expect(exitCode).toBe(0);
		expect(stdout[0]).toContain("Interactive session cancelled");
	});
});

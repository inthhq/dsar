import { describe, expect, it } from "@effect/vitest";

import { allCommands } from "#src/commands/registry";
import { runCli } from "#src/runtime";

const renderHelp = async (argv: readonly string[]): Promise<string> => {
	const stdout: string[] = [];
	const exitCode = await runCli({
		argv,
		stdout: (line) => stdout.push(line),
	});
	expect(exitCode).toBe(0);
	return stdout.join("\n");
};

describe("CLI help output", () => {
	it("matches the global help snapshot", async () => {
		await expect(renderHelp(["--help"])).resolves.toMatchSnapshot();
	});

	it.each(allCommands)(
		"matches command help snapshot for $id",
		async (command) => {
			await expect(
				renderHelp([...command.usage, "--help"])
			).resolves.toMatchSnapshot();
		}
	);

	it("lists command groups for partial command help", async () => {
		await expect(renderHelp(["requests", "--help"])).resolves.toMatchSnapshot();
	});

	it("matches global help when using short help flag", async () => {
		await expect(renderHelp(["-h"])).resolves.toBe(
			await renderHelp(["--help"])
		);
	});

	it("matches command help when using short help flag", async () => {
		await expect(renderHelp(["requests", "get", "req-1", "-h"])).resolves.toBe(
			await renderHelp(["requests", "get", "req-1", "--help"])
		);
	});

	it("matches grouped help when using short help flag", async () => {
		await expect(renderHelp(["requests", "-h"])).resolves.toBe(
			await renderHelp(["requests", "--help"])
		);
	});
});

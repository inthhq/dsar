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
	return stdout[0] ?? "";
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
});

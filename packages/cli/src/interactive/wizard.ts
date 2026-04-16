/* oxlint-disable max-statements */
import { Prompt } from "effect/unstable/cli";

import {
	collectFormFlags,
	collectGlobalFlags,
	selectCommandAndParams,
} from "./wizard/collectors";
import {
	domainChoices,
	materializeUsage,
	renderCommandPreview,
	resolvePromptSelectionValue,
	runPrompt,
} from "./wizard/shared";

export { resolvePromptSelectionValue };

const promptForDomain = () =>
	runPrompt(
		Prompt.select({
			choices: domainChoices,
			message: "Choose a command domain:",
		})
	);

const promptForAction = (preview: string) =>
	runPrompt(
		Prompt.select({
			choices: [
				{ title: "Execute", value: "execute" },
				{ title: "Edit", value: "edit" },
				{ title: "Cancel", value: "cancel" },
			],
			message: `Ready to run:\n${preview}`,
		})
	);

const buildArgv = (input: {
	readonly commandTokens: readonly string[];
	readonly allFlags: Readonly<Record<string, string>>;
}) => {
	const argv = [...input.commandTokens];
	for (const [key, value] of Object.entries(input.allFlags)) {
		argv.push(`--${key}`, value);
	}
	return argv;
};

const selectWizardInvocation = async (
	env: NodeJS.ProcessEnv,
	skipGlobalPrompts: boolean
): Promise<{
	readonly allFlags: Readonly<Record<string, string>>;
	readonly commandTokens: readonly string[];
} | null> => {
	const globalFlags = await collectGlobalFlags(env, skipGlobalPrompts);
	if (globalFlags === null) {
		return null;
	}
	const domain = await promptForDomain();
	if (domain === null) {
		return null;
	}
	const commandSelection = await selectCommandAndParams(domain);
	if (!commandSelection) {
		return null;
	}
	const { command, params } = commandSelection;
	const commandTokens = materializeUsage(command.usage, params);
	const commandFlags = await collectFormFlags(command);
	if (!commandFlags) {
		return null;
	}
	return {
		allFlags: {
			...globalFlags,
			...commandFlags,
		},
		commandTokens,
	};
};

const runWizardCycle = async (
	env: NodeJS.ProcessEnv,
	skipGlobalPrompts: boolean
): Promise<readonly string[] | "edit" | null> => {
	const invocation = await selectWizardInvocation(env, skipGlobalPrompts);
	if (invocation === null) {
		return null;
	}
	const { allFlags, commandTokens } = invocation;
	const preview = renderCommandPreview(commandTokens, allFlags);
	const action = await promptForAction(preview);
	if (action === null || action === "cancel") {
		return null;
	}
	if (action === "edit") {
		return "edit";
	}
	return buildArgv({ allFlags, commandTokens });
};

/**
 * Runs the interactive CLI wizard, prompting for domain, command,
 * parameters, and flags, then returns the fully assembled argv tokens.
 *
 * @param env - Process environment used for config defaults (`DSAR_API_URL`,
 *   `DSAR_API_TOKEN`, `DSAR_OUTPUT`).
 * @param skipGlobalPrompts - When `true`, resolves global flags from
 *   environment variables without interactive prompts (default `false`).
 * @returns Assembled argv tokens ready for command execution, or `null`
 *   when the user cancels at any step.
 */
export const runInteractiveWizard = async (
	env: NodeJS.ProcessEnv,
	skipGlobalPrompts = false
): Promise<readonly string[] | null> => {
	while (true) {
		const argv = await runWizardCycle(env, skipGlobalPrompts);
		if (argv === null) {
			return null;
		}
		if (argv === "edit") {
			continue;
		}
		return argv;
	}
};

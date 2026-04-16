/* oxlint-disable max-statements */
import { Prompt } from "effect/unstable/cli";

import { allCommands } from "../../commands/registry";
import type { CommandDefinition } from "../../types";
import { getWizardForm } from "../forms";
import {
	commandById,
	commandDomain,
	optionalText,
	requiredText,
	resolvePromptSelectionValue,
	routeById,
	runPrompt,
} from "./shared";
import type { WizardDomain } from "./shared";

const collectParamsPrompt = (
	usage: readonly string[]
): Prompt.Prompt<Readonly<Record<string, string>>> => {
	const paramPrompts: Record<string, Prompt.Prompt<string>> = {};
	for (const token of usage) {
		if (token.startsWith(":")) {
			const key = token.slice(1);
			paramPrompts[key] = requiredText(`Enter ${key}:`);
		}
	}
	const keys = Object.keys(paramPrompts);
	if (keys.length === 0) {
		return Prompt.succeed({});
	}
	return Prompt.all(paramPrompts).pipe(
		Prompt.map((values) => {
			const params: Record<string, string> = {};
			for (const [key, value] of Object.entries(values)) {
				params[key] = value.trim();
			}
			return params;
		})
	);
};

/**
 * Lets the user choose a command within a domain and collect path parameters.
 *
 * @param domain - Wizard domain to filter commands by.
 * @returns Selected command and collected params, or `null` on cancellation.
 */
export const selectCommandAndParams = async (
	domain: WizardDomain
): Promise<{
	readonly command: CommandDefinition;
	readonly params: Readonly<Record<string, string>>;
} | null> => {
	const commands = allCommands
		.filter((command) => commandDomain(command) === domain)
		.map((command) => ({
			description: command.description,
			title: command.usage.join(" "),
			value: command.id,
		}));
	if (commands.length === 0) {
		return null;
	}
	const result = await runPrompt(
		Prompt.select({
			choices: commands,
			message: "Select a command:",
		}).pipe(
			Prompt.flatMap((choice) => {
				const selection = resolvePromptSelectionValue(choice);
				const command = selection ? commandById.get(selection) : undefined;
				if (!command) {
					return Prompt.succeed({
						commandId: "",
						params: {} as Readonly<Record<string, string>>,
					});
				}
				return collectParamsPrompt(command.usage).pipe(
					Prompt.map((params) => ({
						commandId: command.id,
						params,
					}))
				);
			})
		)
	);
	if (result === null || result.commandId.length === 0) {
		return null;
	}
	const command = commandById.get(result.commandId);
	if (!command) {
		return null;
	}
	return {
		command,
		params: result.params,
	};
};

/**
 * Collects form-derived flags for a selected command.
 *
 * @param command - Command definition whose form should be rendered.
 * @returns Flag map derived from the form, or `null` on cancellation.
 */
export const collectFormFlags = async (
	command: CommandDefinition
): Promise<Readonly<Record<string, string>> | null> => {
	const route = command.routeId ? routeById.get(command.routeId) : undefined;
	const form = getWizardForm(command.routeId, route?.method ?? "GET");
	if (!form) {
		return {};
	}
	const values: Record<string, string> = {};
	for (const field of form.fields) {
		if (field.kind === "confirm") {
			const confirmed = await runPrompt(
				Prompt.confirm({
					initial: field.defaultValue === "true",
					message: field.label,
				})
			);
			if (confirmed === null) {
				return null;
			}
			values[field.key] = confirmed ? "true" : "false";
			continue;
		}
		if (field.kind === "select") {
			const options = field.options ?? [];
			if (options.length === 0) {
				continue;
			}
			const selection = await runPrompt(
				Prompt.select({
					choices: options.map((option) => ({
						title: option.label,
						value: option.value,
					})),
					message: field.label,
				})
			);
			if (selection === null) {
				return null;
			}
			values[field.key] = selection;
			continue;
		}
		const value = await runPrompt(
			field.required
				? requiredText(field.label, field.defaultValue)
				: optionalText(field.label, field.defaultValue)
		);
		if (value === null) {
			return null;
		}
		const parsed = field.parse ? field.parse(value) : value.trim();
		if (!field.required && parsed.trim().length === 0) {
			continue;
		}
		values[field.key] = parsed;
	}
	return form.toFlagMap(values);
};

/**
 * Collects global CLI flags such as API URL, output mode, and token.
 *
 * @param env - Process environment used for defaults.
 * @param skipPrompts - Whether to derive values from the environment without prompting.
 * @returns Global flag map, or `null` on cancellation.
 */
export const collectGlobalFlags = async (
	env: NodeJS.ProcessEnv,
	skipPrompts: boolean
): Promise<Readonly<Record<string, string>> | null> => {
	if (skipPrompts) {
		const outputFromEnv = env.DSAR_OUTPUT;
		const output =
			outputFromEnv === "json" || outputFromEnv === "text"
				? outputFromEnv
				: "text";
		return {
			"api-url": env.DSAR_API_URL ?? "http://localhost:8787",
			output,
			...(env.DSAR_API_TOKEN ? { token: env.DSAR_API_TOKEN } : {}),
		};
	}

	const apiUrl = await runPrompt(
		requiredText("API URL:", env.DSAR_API_URL ?? "http://localhost:8787")
	);
	if (apiUrl === null) {
		return null;
	}
	const output = await runPrompt(
		Prompt.select({
			choices: [
				{ title: "Text", value: "text" },
				{ title: "JSON", value: "json" },
			],
			message: "Output mode:",
		})
	);
	if (output === null) {
		return null;
	}
	const token = await runPrompt(
		optionalText("API token (optional):", env.DSAR_API_TOKEN ?? "")
	);
	if (token === null) {
		return null;
	}
	return {
		"api-url": apiUrl.trim(),
		output,
		...(token.trim().length > 0 ? { token: token.trim() } : {}),
	};
};

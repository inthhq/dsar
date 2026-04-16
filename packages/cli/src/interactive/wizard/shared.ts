/* oxlint-disable max-statements */
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { Prompt } from "effect/unstable/cli";

import { allCommands } from "../../commands/registry";
import { routeParityMap } from "../../parity/route-map";
import type { CommandDefinition } from "../../types";

/** Top-level command domains presented by the interactive CLI wizard. */
export type WizardDomain =
	| "audit"
	| "notifications"
	| "policies"
	| "requests"
	| "retention"
	| "subjects"
	| "system";

/** Route definitions keyed by route id for quick wizard lookup. */
export const routeById = new Map(
	routeParityMap.map((route) => [route.id, route])
);

/** Command definitions keyed by command id for quick wizard lookup. */
export const commandById = new Map(
	allCommands.map((command) => [command.id, command])
);

/**
 * Resolves the high-level wizard domain for a command definition.
 *
 * @param command - Command definition selected by the user.
 * @returns Wizard domain used for grouping the command in prompts.
 */
export const commandDomain = (command: CommandDefinition): WizardDomain => {
	const routeId = command.routeId ?? command.id;
	if (routeId === "requests_audit" || routeId.startsWith("requests_audit_")) {
		return "audit";
	}
	if (routeId === "notifications" || routeId.startsWith("notifications_")) {
		return "notifications";
	}
	if (routeId === "policies" || routeId.startsWith("policies_")) {
		return "policies";
	}
	if (
		routeId === "tenants_retention" ||
		routeId.startsWith("tenants_retention_")
	) {
		return "retention";
	}
	if (routeId === "subjects" || routeId.startsWith("subjects_")) {
		return "subjects";
	}
	if (
		routeId === "init" ||
		routeId === "status" ||
		routeId.startsWith("init_") ||
		routeId.startsWith("status_")
	) {
		return "system";
	}
	return "requests";
};

/** Domain choices shown in the first wizard prompt. */
export const domainChoices: readonly {
	readonly description: string;
	readonly title: string;
	readonly value: WizardDomain;
}[] = [
	{
		description:
			"Request lifecycle actions, verification, delivery, and appeals.",
		title: "Requests",
		value: "requests",
	},
	{
		description: "Read subject profile surfaces.",
		title: "Subjects",
		value: "subjects",
	},
	{
		description: "List and manage policy upgrades.",
		title: "Policies",
		value: "policies",
	},
	{
		description: "Initialize service and check status.",
		title: "System",
		value: "system",
	},
	{
		description: "Get or update tenant retention settings.",
		title: "Retention",
		value: "retention",
	},
	{
		description: "Export and verify audit trails.",
		title: "Audit",
		value: "audit",
	},
	{
		description: "Notification flows (replay currently deferred).",
		title: "Notifications",
		value: "notifications",
	},
] as const;

/**
 * Runs an Effect CLI prompt and converts cancellations into `null`.
 *
 * @param prompt - Prompt instance to run.
 * @typeParam T - Prompt result type.
 * @returns Prompt result, or `null` when the prompt is cancelled.
 */
export const runPrompt = async <T>(
	prompt: Prompt.Prompt<T>
): Promise<T | null> => {
	try {
		return await Effect.runPromise(
			Prompt.run(prompt).pipe(Effect.provide(NodeServices.layer))
		);
	} catch {
		return null;
	}
};

/**
 * Builds a required text prompt that rejects empty input.
 *
 * @param message - Prompt label shown to the user.
 * @param defaultValue - Optional default text value.
 * @returns Prompt configured to require non-empty text.
 */
export const requiredText = (
	message: string,
	defaultValue?: string
): Prompt.Prompt<string> =>
	Prompt.text({
		default: defaultValue,
		message,
		validate: (value) =>
			Effect.try({
				catch: (error) =>
					error instanceof Error ? error.message : "Value cannot be empty.",
				try: () => {
					if (value.trim().length === 0) {
						throw new Error("Value cannot be empty.");
					}
					return value;
				},
			}),
	});

/**
 * Builds an optional text prompt.
 *
 * @param message - Prompt label shown to the user.
 * @param defaultValue - Optional default text value.
 * @returns Prompt configured to accept empty text.
 */
export const optionalText = (
	message: string,
	defaultValue?: string
): Prompt.Prompt<string> =>
	Prompt.text({
		default: defaultValue,
		message,
	});

const shellEscape = (value: string): string => {
	if (/^[a-zA-Z0-9_\-./]+$/u.test(value)) {
		return value;
	}
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$").replaceAll("`", "\\`")}"`;
};

/**
 * Renders a shell preview for the command and flag selections.
 *
 * @param commandTokens - Command tokens that make up the CLI route.
 * @param flags - Flag map collected by the wizard.
 * @returns Command preview string ready to display to the user.
 */
export const renderCommandPreview = (
	commandTokens: readonly string[],
	flags: Readonly<Record<string, string>>
) => {
	const parts = ["dsar", ...commandTokens];
	for (const [key, value] of Object.entries(flags)) {
		parts.push(`--${key}`);
		parts.push(shellEscape(value));
	}
	return parts.join(" ");
};

/**
 * Replaces usage tokens like `:id` with collected parameter values.
 *
 * @param usage - Command usage tokens from the definition.
 * @param params - Collected parameter values keyed by token name.
 * @returns Usage tokens with parameter placeholders materialized.
 */
export const materializeUsage = (
	usage: readonly string[],
	params: Readonly<Record<string, string>>
): readonly string[] =>
	usage.map((token) =>
		token.startsWith(":") ? (params[token.slice(1)] ?? token) : token
	);

/**
 * Extracts a string value from prompt selection output.
 *
 * @param choice - Raw value returned by the prompt runtime.
 * @returns Selected string value, or `null` when no string can be resolved.
 */
export const resolvePromptSelectionValue = (choice: unknown): string | null => {
	if (typeof choice === "string") {
		return choice;
	}
	if (
		typeof choice === "object" &&
		choice !== null &&
		"value" in choice &&
		typeof choice.value === "string"
	) {
		return choice.value;
	}
	return null;
};

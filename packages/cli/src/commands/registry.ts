import { auditCommands } from "../commands/audit";
import { matchCommand } from "../commands/helpers";
import { notificationCommands } from "../commands/notifications";
import { policiesCommands } from "../commands/policies";
import { requestsCommands } from "../commands/requests";
import { retentionCommands } from "../commands/retention";
import { subjectsCommands } from "../commands/subjects";
import { systemCommands } from "../commands/system";
import { webhooksCommands } from "../commands/webhooks";
import type { CommandDefinition } from "../types";

const commandGroups: readonly CommandDefinition[] = [
	...systemCommands,
	...requestsCommands,
	...subjectsCommands,
	...policiesCommands,
	...webhooksCommands,
	...retentionCommands,
	...auditCommands,
	...notificationCommands,
];

const dedupeById = (
	commands: readonly CommandDefinition[]
): readonly CommandDefinition[] => {
	const seen = new Set<string>();
	const deduped: CommandDefinition[] = [];
	for (const command of commands) {
		if (seen.has(command.id)) {
			continue;
		}
		seen.add(command.id);
		deduped.push(command);
	}
	return deduped;
};

/**
 * Flat, deduplicated list of every registered CLI command. When multiple
 * command groups contribute an entry with the same `id`, only the first
 * occurrence is retained.
 */
export const allCommands: readonly CommandDefinition[] =
	dedupeById(commandGroups);

/**
 * Scans {@link allCommands} for the first entry whose usage pattern matches
 * the given CLI tokens (via {@link matchCommand}) and returns it along with
 * any extracted path parameters. Returns `null` when no command matches.
 *
 * @param commandTokens - Positional tokens from the user's CLI input to
 *   match against each command's usage pattern.
 * @returns | null} The first matching `{ command, params }` pair, or `null` when no
 *   registered command matches the tokens.
 */
export const resolveCommand = (
	commandTokens: readonly string[]
): {
	readonly command: CommandDefinition;
	readonly params: Readonly<Record<string, string>>;
} | null => {
	for (const command of allCommands) {
		const params = matchCommand(commandTokens, command.usage);
		if (params) {
			return { command, params };
		}
	}
	return null;
};

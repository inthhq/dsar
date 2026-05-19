import dotenv from "dotenv";
/* oxlint-disable max-statements */
import * as Effect from "effect/Effect";

import { makeApiClient } from "./client";
import { allCommands, resolveCommand } from "./commands/registry";
import { parseCliArguments, parseCliInput } from "./config";
import { runInteractiveWizard } from "./interactive/wizard";
import type { CliRunOptions, OutputMode } from "./types";
import { resolveCliErrorCatalogEntry } from "./types/error-codes";

const CLI_RUNTIME_ERROR_ENTRY =
	resolveCliErrorCatalogEntry("CLI_RUNTIME_ERROR");

const asEnvelope = (
	mode: OutputMode,
	input:
		| {
				readonly ok: true;
				readonly data: unknown;
				readonly command: readonly string[];
		  }
		| {
				readonly ok: false;
				readonly data: unknown;
				readonly command: readonly string[];
		  }
		| {
				readonly ok: false;
				readonly message: string;
				readonly command?: readonly string[];
		  },
	formatTextResult?: (result: unknown) => string
): string => {
	if (mode === "json") {
		if (input.ok) {
			return JSON.stringify({
				data: input.data,
				meta: {
					command: input.command.join(" "),
				},
				ok: true,
			});
		}
		if ("data" in input) {
			return JSON.stringify({
				data: input.data,
				meta: {
					command: input.command.join(" "),
				},
				ok: false,
			});
		}
		return JSON.stringify({
			error: {
				code: CLI_RUNTIME_ERROR_ENTRY.code,
				docsUrl: CLI_RUNTIME_ERROR_ENTRY.docsUrl,
				id: CLI_RUNTIME_ERROR_ENTRY.id,
				message: input.message,
				status: CLI_RUNTIME_ERROR_ENTRY.status,
			},
			meta: input.command
				? {
						command: input.command.join(" "),
					}
				: undefined,
			ok: false,
		});
	}
	if (input.ok) {
		return (
			formatTextResult?.(input.data) ?? JSON.stringify(input.data, null, 2)
		);
	}
	if ("data" in input) {
		return (
			formatTextResult?.(input.data) ?? JSON.stringify(input.data, null, 2)
		);
	}
	return input.message;
};

const renderGlobalFlagLines = (): string[] => [
	"  --api-url <url>          Override DSAR_API_URL",
	"  --token <token>          Override DSAR_API_TOKEN",
	"  --idempotency-key <key>  Set x-idempotency-key header",
	"  --output <mode>          text|json",
	"  --json '<payload>'       JSON body payload for POST/PUT commands",
];

const renderGlobalHelp = (): string => {
	const lines = [
		"DSAR CLI",
		"",
		"Usage:",
		"  dsar <command> [args] [--api-url URL] [--token TOKEN] [--output json|text]",
		"",
		"Global flags:",
		...renderGlobalFlagLines(),
		"",
		"Commands:",
	];
	for (const command of allCommands) {
		lines.push(`  ${command.usage.join(" ")}  - ${command.description}`);
	}
	return lines.join("\n");
};

const usageFor = (usage: readonly string[]): string => usage.join(" ");

const renderCommandHelp = (command: (typeof allCommands)[number]): string =>
	[
		"DSAR CLI",
		"",
		"Usage:",
		`  dsar ${usageFor(command.usage)} [global flags]`,
		"",
		"Description:",
		`  ${command.description}`,
		"",
		"Global flags:",
		...renderGlobalFlagLines(),
	].join("\n");

const startsWithTokens = (
	usage: readonly string[],
	tokens: readonly string[]
): boolean => {
	if (tokens.length > usage.length) {
		return false;
	}
	for (let index = 0; index < tokens.length; index += 1) {
		if (usage[index]?.toLowerCase() !== tokens[index]?.toLowerCase()) {
			return false;
		}
	}
	return true;
};

const withoutHelpFlags = (argv: readonly string[]): readonly string[] =>
	argv.filter((token) => token !== "--help" && token !== "-h");

const renderCommandGroupHelp = (tokens: readonly string[]): string => {
	const matches = allCommands.filter((command) =>
		startsWithTokens(command.usage, tokens)
	);
	if (matches.length === 1) {
		const [onlyMatch] = matches;
		if (onlyMatch) {
			return renderCommandHelp(onlyMatch);
		}
	}
	const label = tokens.length > 0 ? tokens.join(" ") : "all commands";
	const lines = ["DSAR CLI", "", `Commands matching '${label}':`];
	for (const command of matches) {
		lines.push(`  ${usageFor(command.usage)}  - ${command.description}`);
	}
	if (matches.length === 0) {
		lines.push("  No commands matched.");
	}
	return lines.join("\n");
};

const renderHelp = (argv: readonly string[]): string => {
	const { commandTokens } = parseCliArguments(withoutHelpFlags(argv));
	if (commandTokens.length === 0) {
		return renderGlobalHelp();
	}
	const matched = resolveCommand(commandTokens);
	if (matched) {
		return renderCommandHelp(matched.command);
	}
	return renderCommandGroupHelp(commandTokens);
};

const isHelpRequest = (argv: readonly string[]): boolean =>
	argv.includes("--help") || argv.includes("-h");

const hasCommandTokens = (argv: readonly string[]): boolean => {
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token) {
			continue;
		}
		if (!token.startsWith("--")) {
			return true;
		}
		const next = argv[index + 1];
		if (next && !next.startsWith("--")) {
			index += 1;
		}
	}
	return false;
};

let didLoadDotEnv = false;

const loadDotEnvIfNeeded = (): boolean => {
	if (didLoadDotEnv) {
		return false;
	}
	didLoadDotEnv = true;
	const result = dotenv.config({ quiet: true });
	return result.error === undefined;
};

/**
 * Runs a CLI invocation and writes formatted output to the configured streams.
 *
 * @param options - Runtime arguments, environment overrides, and output/fetch hooks.
 * @returns Process-style exit code (`0` for success, `1` for failure).
 */
export const runCli = async (options: CliRunOptions): Promise<number> => {
	const stdout = options.stdout ?? ((line: string) => console.log(line));
	const stderr = options.stderr ?? ((line: string) => console.error(line));
	if (isHelpRequest(options.argv)) {
		stdout(renderHelp(options.argv));
		return 0;
	}
	try {
		const dotEnvLoaded = loadDotEnvIfNeeded();
		const defaultEnv = options.env ?? process.env;
		let argvToRun: readonly string[] = options.argv;
		if (!hasCommandTokens(argvToRun)) {
			const wizardArgv = await runInteractiveWizard(defaultEnv, dotEnvLoaded);
			if (!wizardArgv) {
				stdout("Interactive session cancelled.");
				return 0;
			}
			argvToRun = wizardArgv;
		}
		const { commandTokens } = parseCliArguments(argvToRun);
		const matched = resolveCommand(commandTokens);
		const input = parseCliInput({
			allowMissingApiUrl: matched?.command.allowMissingApiUrl === true,
			argv: argvToRun,
			env: defaultEnv,
			fetchImpl: options.fetch ?? fetch,
		});
		if (!matched) {
			stderr(
				asEnvelope(input.global.output, {
					message: `Unknown command: ${input.commandTokens.join(" ")}`,
					ok: false,
				})
			);
			return 1;
		}
		const api = makeApiClient(input.global);
		const data = await Effect.runPromise(
			Effect.tryPromise({
				catch: (error) =>
					error instanceof Error
						? error
						: new Error("Command execution failed."),
				try: () =>
					matched.command.execute({
						api,
						input,
						params: matched.params,
						writeLine: stdout,
					}),
			})
		);
		const commandOk = matched.command.isSuccessfulResult?.(data) ?? true;
		if (!commandOk) {
			stdout(
				asEnvelope(
					input.global.output,
					{
						command: matched.command.usage,
						data,
						ok: false,
					},
					matched.command.formatTextResult
				)
			);
			return 1;
		}
		stdout(
			asEnvelope(
				input.global.output,
				{
					command: matched.command.usage,
					data,
					ok: true,
				},
				matched.command.formatTextResult
			)
		);
		return 0;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown CLI failure.";
		stderr(
			asEnvelope("json", {
				message,
				ok: false,
			})
		);
		return 1;
	}
};

import dotenv from "dotenv";
/* oxlint-disable max-statements */
import * as Effect from "effect/Effect";

import { makeApiClient } from "./client";
import { allCommands, resolveCommand } from "./commands/registry";
import { parseCliInput } from "./config";
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
				readonly message: string;
				readonly command?: readonly string[];
		  }
): string => {
	if (mode === "json") {
		return JSON.stringify(
			input.ok
				? {
						data: input.data,
						meta: {
							command: input.command.join(" "),
						},
						ok: true,
					}
				: {
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
					}
		);
	}
	if (input.ok) {
		return JSON.stringify(input.data, null, 2);
	}
	return input.message;
};

const renderHelp = (): string => {
	const lines = [
		"DSAR CLI",
		"",
		"Usage:",
		"  dsar <command> [args] [--api-url URL] [--token TOKEN] [--output json|text]",
		"",
		"Global flags:",
		"  --api-url <url>          Override DSAR_API_URL",
		"  --token <token>          Override DSAR_API_TOKEN",
		"  --idempotency-key <key>  Set x-idempotency-key header",
		"  --output <mode>          text|json",
		"  --json '<payload>'       JSON body payload for POST/PUT commands",
		"",
		"Commands:",
	];
	for (const command of allCommands) {
		lines.push(`  ${command.usage.join(" ")}  - ${command.description}`);
	}
	return lines.join("\n");
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
		stdout(renderHelp());
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
		const input = parseCliInput({
			argv: argvToRun,
			env: defaultEnv,
			fetchImpl: options.fetch ?? fetch,
		});
		const matched = resolveCommand(input.commandTokens);
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
		stdout(
			asEnvelope(input.global.output, {
				command: matched.command.usage,
				data,
				ok: true,
			})
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

/* oxlint-disable max-statements */
import type { GlobalCliConfig, ParsedCliInput } from "./types";

const GLOBAL_FLAG_KEYS = new Set([
	"api-url",
	"token",
	"idempotency-key",
	"output",
]);

const stripLeadingDashes = (value: string): string => value.replace(/^-+/, "");

const parseFlags = (
	argv: readonly string[]
): {
	readonly commandTokens: readonly string[];
	readonly flags: Readonly<Record<string, string>>;
} => {
	const commandTokens: string[] = [];
	const flags: Record<string, string> = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith("--")) {
			commandTokens.push(token ?? "");
			continue;
		}
		const key = stripLeadingDashes(token);
		const next = argv[index + 1];
		if (!next || next.startsWith("--")) {
			flags[key] = "true";
			continue;
		}
		flags[key] = next;
		index += 1;
	}
	return { commandTokens, flags };
};

const toOutputMode = (value: string | undefined): "json" | "text" => {
	if (!value || value === "text") {
		return "text";
	}
	if (value === "json") {
		return "json";
	}
	throw new Error(`Unsupported output mode '${value}'. Use 'text' or 'json'.`);
};

const resolveApiUrl = (
	flags: Readonly<Record<string, string>>,
	env: NodeJS.ProcessEnv
): string => {
	const value = flags["api-url"] ?? env.DSAR_API_URL;
	if (!value) {
		throw new Error(
			"Missing DSAR API URL. Set --api-url or DSAR_API_URL environment variable."
		);
	}
	return value;
};

const buildGlobalConfig = (input: {
	readonly env: NodeJS.ProcessEnv;
	readonly flags: Readonly<Record<string, string>>;
	readonly fetchImpl: typeof fetch;
}): GlobalCliConfig => ({
	apiUrl: resolveApiUrl(input.flags, input.env),
	fetch: input.fetchImpl,
	idempotencyKey: input.flags["idempotency-key"],
	output: toOutputMode(input.flags.output),
	token: input.flags.token ?? input.env.DSAR_API_TOKEN,
});

/**
 * Parses raw CLI argv into positional command tokens, a flag map, and the
 * resolved global configuration.
 *
 * @param input - Raw CLI context.
 * @param input.argv - Full argument vector (flags like `--api-url`, `--token`,
 *   `--idempotency-key`, `--output` are extracted;
 *   remaining tokens become positional commands).
 * @param input.env - Process environment used for fallback values (e.g.
 *   `DSAR_API_TOKEN`, `DSAR_API_URL`).
 * @param input.fetchImpl - Fetch implementation injected into the global
 *   config for HTTP calls.
 * @returns A {@link ParsedCliInput} containing `commandTokens`, `flags`, and
 *   the fully-resolved `global` configuration.
 */
export const parseCliInput = (input: {
	readonly argv: readonly string[];
	readonly env: NodeJS.ProcessEnv;
	readonly fetchImpl: typeof fetch;
}): ParsedCliInput => {
	const { commandTokens, flags } = parseFlags(input.argv);
	const globalFlagsOnly: Record<string, string> = {};
	for (const [key, value] of Object.entries(flags)) {
		if (GLOBAL_FLAG_KEYS.has(key)) {
			globalFlagsOnly[key] = value;
		}
	}
	return {
		commandTokens,
		flags,
		global: buildGlobalConfig({
			env: input.env,
			fetchImpl: input.fetchImpl,
			flags: globalFlagsOnly,
		}),
	};
};

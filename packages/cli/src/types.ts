/**
 * Supported HTTP methods used by route-parity command handlers.
 */
export type HttpMethod = "GET" | "POST" | "PUT";

/**
 * CLI output rendering mode.
 */
export type OutputMode = "json" | "text";

/**
 * Entry options for running the DSAR CLI runtime.
 */
export interface CliRunOptions {
	/** Raw command-line tokens, excluding runtime binary name. */
	readonly argv: readonly string[];
	/** Environment map used for config fallbacks in non-default runtimes. */
	readonly env?: NodeJS.ProcessEnv;
	/** Output sink for user-facing successful command messages. */
	readonly stdout?: (line: string) => void;
	/** Output sink for warnings/errors and diagnostics. */
	readonly stderr?: (line: string) => void;
	/** Optional fetch override for tests/custom runtimes. */
	readonly fetch?: typeof fetch;
}

/**
 * Resolved global configuration shared across command execution.
 */
export interface GlobalCliConfig {
	/** DSAR API base URL all CLI calls target. */
	readonly apiUrl: string;
	/** Optional auth token used for protected endpoints. */
	readonly token?: string;
	/** Optional idempotency key for safe retried writes. */
	readonly idempotencyKey?: string;
	/** Output format mode controlling human vs machine-friendly responses. */
	readonly output: OutputMode;
	/** Fetch implementation used by CLI API client. */
	readonly fetch: typeof fetch;
}

/**
 * Parsed command-line input after global option resolution.
 */
export interface ParsedCliInput {
	/** Positional command tokens after global parsing. */
	readonly commandTokens: readonly string[];
	/** Parsed flag map from CLI invocation. */
	readonly flags: Readonly<Record<string, string>>;
	/** Resolved global CLI configuration context. */
	readonly global: GlobalCliConfig;
}

/**
 * Normalized API request envelope built by CLI command handlers.
 */
export interface ApiRequest {
	/** HTTP method used for route parity invocation. */
	readonly method: HttpMethod;
	/** API path invoked by this command. */
	readonly path: string;
	/** Optional request payload for mutating operations. */
	readonly body?: unknown;
	/** Optional query parameters for list/filter operations. */
	readonly query?: Readonly<Record<string, string | undefined>>;
	/** Optional explicit headers merged into request defaults. */
	readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Minimal API client abstraction consumed by command executors.
 */
export interface ApiClient {
	/** Executes a normalized API request for command handlers. */
	readonly invoke: (request: ApiRequest) => Promise<unknown>;
}

/**
 * Context object passed to every command execution function.
 */
export interface CommandExecutionContext {
	/** Parsed CLI input driving command execution. */
	readonly input: ParsedCliInput;
	/** API client abstraction used by command logic. */
	readonly api: ApiClient;
	/** Route/path params extracted from command syntax. */
	readonly params: Readonly<Record<string, string>>;
	/** Direct stdout sink for streaming commands (e.g. `audit tail`). */
	readonly writeLine: (line: string) => void;
}

/**
 * Registry definition for a CLI command.
 */
export interface CommandDefinition {
	/**
	 * Preformatted command-specific flag lines rendered by `--help`, e.g.
	 * `"--request <id>          Request id to tail (required)"`.
	 */
	readonly flagHelp?: readonly string[];
	/** Stable command identifier used in registry/help tooling. */
	readonly id: string;
	/** Optional route parity id linking command to HTTP surface. */
	readonly routeId?: string;
	/** Usage examples for help and discoverability. */
	readonly usage: readonly string[];
	/** Human-readable command purpose description. */
	readonly description: string;
	/** Command execution entry point. */
	readonly execute: (ctx: CommandExecutionContext) => Promise<unknown>;
}

/**
 * Mapping between CLI commands and backend route parity entries.
 */
export interface RouteParityDefinition {
	/** Stable parity entry identifier. */
	readonly id: string;
	/** HTTP method represented by this parity mapping. */
	readonly method: HttpMethod;
	/** Backend route path this command maps to. */
	readonly path: string;
	/** CLI command tokens corresponding to the route. */
	readonly command: readonly string[];
	/** Human-readable parity mapping description. */
	readonly description: string;
	/**
	 * Preformatted command-specific flag lines rendered by `--help`, e.g.
	 * `"--status <status>        Filter by delivery status"`.
	 */
	readonly flagHelp?: readonly string[];
}

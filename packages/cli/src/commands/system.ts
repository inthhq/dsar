import { makeRouteCommands } from "../commands/factory";

/**
 * CLI command definitions for system-level operations (runtime init, health).
 */
export const systemCommands = makeRouteCommands([
	"init_runtime",
	"status_health",
] as const);

import { makeRouteCommands } from "../commands/factory";
import { doctorCommand } from "./doctor";

/**
 * CLI command definitions for system-level operations (runtime init, health).
 */
export const systemCommands = [
	...makeRouteCommands(["init_runtime", "status_health"] as const),
	doctorCommand,
] as const;

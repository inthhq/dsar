import { makeRouteCommands } from "../commands/factory";

/**
 * CLI command definitions for subject-profile operations.
 */
export const subjectsCommands = makeRouteCommands([
	"subjects_get_profile",
] as const);

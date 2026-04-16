import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for policy-pack management: listing packs, proposing
 * and approving upgrades, and registering/activating custom packs.
 */
export const policiesCommands = makeRouteCommands([
	"policies_list",
	"policies_upgrades_propose",
	"policies_upgrades_approve",
	"policies_upgrades_apply",
	"policies_custom_register",
	"policies_custom_activate",
	"policies_custom_deactivate",
] as const);

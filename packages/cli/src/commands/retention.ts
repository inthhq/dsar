import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for tenant-level data-retention policy management:
 * reading and updating retention day bounds and purge settings.
 */
export const retentionCommands = makeRouteCommands([
	"tenants_retention_get",
	"tenants_retention_put",
] as const);

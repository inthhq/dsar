import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for triggering inbound webhook endpoints
 * (e.g. Resend email intake) from the command line.
 */
export const webhooksCommands = makeRouteCommands([
	"webhooks_inbound_resend",
	"webhooks_inbound_slack",
	"webhooks_endpoint_rotate_key",
] as const);

import { makeRouteCommands } from "../commands/factory";
import { webhooksTailCommand } from "../commands/webhooks-tail";

/**
 * CLI commands for triggering inbound webhook endpoints
 * (e.g. Resend email intake) from the command line.
 */
export const webhooksCommands = [
	...makeRouteCommands([
		"webhooks_inbound_resend",
		"webhooks_inbound_slack",
		"webhooks_endpoint_rotate_key",
		"webhooks_dispatches_list",
		"webhooks_dispatches_replay",
		"webhooks_dispatches_replay_bulk",
	] as const),
	webhooksTailCommand,
] as const;

import { makeRouteCommands } from "../commands/factory";

/**
 * CLI commands for notification operations (e.g. replaying failed
 * delivery attempts for a request).
 */
export const notificationCommands = makeRouteCommands([
	"requests_notifications_replay",
] as const);

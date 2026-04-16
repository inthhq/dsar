import type { RouteDefinition } from "./types";
import { resendWebhookRoute } from "./webhooks/resend";
import { slackWebhookRoute } from "./webhooks/slack";

/**
 * Route definitions for inbound webhook endpoints that receive
 * provider payloads (e.g. Resend) and feed them into DSAR intake.
 */
export const webhookRoutes: readonly RouteDefinition[] = [
	resendWebhookRoute,
	slackWebhookRoute,
];

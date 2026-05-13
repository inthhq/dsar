import type { RouteDefinition } from "./types";
import { resendWebhookRoute } from "./webhooks/resend";
import { rotateWebhookKeyRoute } from "./webhooks/rotate-key";
import { slackWebhookRoute } from "./webhooks/slack";
import { listWebhooksDispatchesRoute } from "./webhooks/dispatches";

/**
 * Route definitions for inbound webhook endpoints that receive
 * provider payloads (e.g. Resend) and feed them into DSAR intake.
 */
export const webhookRoutes: readonly RouteDefinition[] = [
	resendWebhookRoute,
	slackWebhookRoute,
	rotateWebhookKeyRoute,
	listWebhooksDispatchesRoute,
];

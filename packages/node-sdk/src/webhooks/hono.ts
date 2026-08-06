import type { Context } from "hono";

import { createWebhookReceiver } from "./receiver";
import type { WebhookReceiver, WebhookReceiverOptions } from "./receiver";

const resolveReceiver = (
	receiverOrOptions: WebhookReceiver | WebhookReceiverOptions
): WebhookReceiver =>
	"handle" in receiverOrOptions && typeof receiverOrOptions.handle === "function"
		? receiverOrOptions
		: createWebhookReceiver(receiverOrOptions as WebhookReceiverOptions);

/**
 * Creates a Hono-compatible DSAR webhook request handler.
 *
 * @param receiverOrOptions - Webhook receiver instance or configuration options.
 * @returns Hono handler that returns the receiver result as a JSON response.
 */
export const honoWebhookHandler =
	(receiverOrOptions: WebhookReceiver | WebhookReceiverOptions) =>
	async (context: Context): Promise<Response> => {
		const receiver = resolveReceiver(receiverOrOptions);
		const result = await receiver.handle({
			rawBody: await context.req.text(),
			signature: context.req.header("x-dsar-signature"),
		});

		return Response.json(result.body, { status: result.status });
	};

/** Alias for {@link honoWebhookHandler}. */
export const honoWebhookMiddleware = honoWebhookHandler;

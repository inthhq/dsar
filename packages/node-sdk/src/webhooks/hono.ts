import type { Context } from "hono";

import { resolveReceiver } from "./receiver";
import type { WebhookReceiver, WebhookReceiverOptions } from "./receiver";

/**
 * Creates a Hono-compatible DSAR webhook request handler.
 *
 * @param receiverOrOptions - Webhook receiver instance or configuration options.
 * @returns Hono handler that returns the receiver result as a JSON response.
 */
export const honoWebhookHandler = (
	receiverOrOptions: WebhookReceiver | WebhookReceiverOptions
) => {
	const receiver = resolveReceiver(receiverOrOptions);
	return async (context: Context): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await context.req.text(),
			signature: context.req.header("x-dsar-signature"),
		});

		return Response.json(result.body, { status: result.status });
	};
};

/** Alias for {@link honoWebhookHandler}. */
export const honoWebhookMiddleware = honoWebhookHandler;

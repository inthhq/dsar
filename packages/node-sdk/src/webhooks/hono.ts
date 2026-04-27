import type { Context } from "hono";

import type { WebhookReceiver } from "./receiver";

/**
 * Creates a Hono-compatible DSAR webhook request handler.
 *
 * @param receiver - Framework-neutral receiver used to verify and dispatch events.
 * @returns Hono handler that returns the receiver result as a JSON response.
 */
export const honoWebhookHandler =
	(receiver: WebhookReceiver) =>
	async (context: Context): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await context.req.text(),
			signature: context.req.header("x-dsar-signature"),
		});

		return Response.json(result.body, { status: result.status });
	};

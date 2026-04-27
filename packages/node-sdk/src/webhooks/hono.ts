import type { Context } from "hono";

import type { WebhookReceiver } from "./receiver";

export const honoWebhookHandler =
	(receiver: WebhookReceiver) =>
	async (context: Context): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await context.req.text(),
			signature: context.req.header("x-dsar-signature"),
		});

		return Response.json(result.body, { status: result.status });
	};

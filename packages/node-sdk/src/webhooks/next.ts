import type { NextRequest } from "next/server";

import type { WebhookReceiver } from "./receiver";

export type NextWebhookRequest = Request | NextRequest;

export const nextWebhookHandler =
	(receiver: WebhookReceiver) =>
	async (request: NextWebhookRequest): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await request.text(),
			signature: request.headers.get("x-dsar-signature") ?? undefined,
		});

		return Response.json(result.body, { status: result.status });
	};

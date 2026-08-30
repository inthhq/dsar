import type { NextRequest } from "next/server";

import { resolveReceiver } from "./receiver";
import type { WebhookReceiver, WebhookReceiverOptions } from "./receiver";

/**
 * Next.js App Router request type accepted by the DSAR webhook adapter.
 */
export type NextWebhookRequest = Request | NextRequest;

/**
 * Creates a Next.js App Router compatible DSAR webhook POST handler.
 *
 * @param receiverOrOptions - Webhook receiver instance or configuration options.
 * @returns Next.js route handler that returns a standard JSON `Response`.
 */
export const nextWebhookHandler = (
	receiverOrOptions: WebhookReceiver | WebhookReceiverOptions
) => {
	const receiver = resolveReceiver(receiverOrOptions);
	return async (request: NextWebhookRequest): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await request.text(),
			signature: request.headers.get("x-dsar-signature") ?? undefined,
		});

		return Response.json(result.body, { status: result.status });
	};
};

/** Alias for {@link nextWebhookHandler}. */
export const nextWebhookMiddleware = nextWebhookHandler;

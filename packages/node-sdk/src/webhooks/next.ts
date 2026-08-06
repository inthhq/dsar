import type { NextRequest } from "next/server";

import { createWebhookReceiver } from "./receiver";
import type { WebhookReceiver, WebhookReceiverOptions } from "./receiver";

/**
 * Next.js App Router request type accepted by the DSAR webhook adapter.
 */
export type NextWebhookRequest = Request | NextRequest;

const resolveReceiver = (
	receiverOrOptions: WebhookReceiver | WebhookReceiverOptions
): WebhookReceiver =>
	"handle" in receiverOrOptions && typeof receiverOrOptions.handle === "function"
		? receiverOrOptions
		: createWebhookReceiver(receiverOrOptions as WebhookReceiverOptions);

/**
 * Creates a Next.js App Router compatible DSAR webhook POST handler.
 *
 * @param receiverOrOptions - Webhook receiver instance or configuration options.
 * @returns Next.js route handler that returns a standard JSON `Response`.
 */
export const nextWebhookHandler =
	(receiverOrOptions: WebhookReceiver | WebhookReceiverOptions) =>
	async (request: NextWebhookRequest): Promise<Response> => {
		const receiver = resolveReceiver(receiverOrOptions);
		const result = await receiver.handle({
			rawBody: await request.text(),
			signature: request.headers.get("x-dsar-signature") ?? undefined,
		});

		return Response.json(result.body, { status: result.status });
	};

/** Alias for {@link nextWebhookHandler}. */
export const nextWebhookMiddleware = nextWebhookHandler;

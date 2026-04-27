import type { NextRequest } from "next/server";

import type { WebhookReceiver } from "./receiver";

/**
 * Next.js App Router request type accepted by the DSAR webhook adapter.
 */
export type NextWebhookRequest = Request | NextRequest;

/**
 * Creates a Next.js App Router compatible DSAR webhook POST handler.
 *
 * @param receiver - Framework-neutral receiver used to verify and dispatch events.
 * @returns Next.js route handler that returns a standard JSON `Response`.
 */
export const nextWebhookHandler =
	(receiver: WebhookReceiver) =>
	async (request: NextWebhookRequest): Promise<Response> => {
		const result = await receiver.handle({
			rawBody: await request.text(),
			signature: request.headers.get("x-dsar-signature") ?? undefined,
		});

		return Response.json(result.body, { status: result.status });
	};

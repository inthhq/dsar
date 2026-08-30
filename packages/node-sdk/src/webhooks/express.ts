import type { Request, Response } from "express";

import { resolveReceiver } from "./receiver";
import type { WebhookReceiver, WebhookReceiverOptions } from "./receiver";

/**
 * Express request shape expected by the DSAR webhook adapter.
 */
export type ExpressWebhookRequest = Request & {
	/** Raw body populated by `express.raw({ type: "application/json" })`. */
	readonly body?: unknown;
};

const headerValue = (
	value: string | readonly string[] | undefined
): string | undefined => (typeof value === "string" ? value : value?.[0]);

const rawBodyFromRequest = (request: ExpressWebhookRequest): string => {
	if (Buffer.isBuffer(request.body)) {
		return request.body.toString("utf8");
	}
	if (typeof request.body === "string") {
		return request.body;
	}
	return "";
};

/**
 * Creates an Express-compatible DSAR webhook request handler.
 *
 * @param receiverOrOptions - Webhook receiver instance or configuration options.
 * @returns Express handler that writes the receiver result as JSON.
 */
export const expressWebhookHandler = (
	receiverOrOptions: WebhookReceiver | WebhookReceiverOptions
) => {
	const receiver = resolveReceiver(receiverOrOptions);
	return async (
		request: ExpressWebhookRequest,
		response: Response
	): Promise<void> => {
		const result = await receiver.handle({
			rawBody: rawBodyFromRequest(request),
			signature: headerValue(request.headers["x-dsar-signature"]),
		});

		response.status(result.status).json(result.body);
	};
};

/** Alias for {@link expressWebhookHandler}. */
export const expressWebhookMiddleware = expressWebhookHandler;

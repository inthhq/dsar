import type { Request, Response } from "express";

import type { WebhookReceiver } from "./receiver";

export type ExpressWebhookRequest = Request & {
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

export const expressWebhookHandler =
	(receiver: WebhookReceiver) =>
	async (request: ExpressWebhookRequest, response: Response): Promise<void> => {
		const result = await receiver.handle({
			rawBody: rawBodyFromRequest(request),
			signature: headerValue(request.headers["x-dsar-signature"]),
		});

		response.status(result.status).json(result.body);
	};

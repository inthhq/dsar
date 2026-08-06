import { describe, expect, it, vi } from "@effect/vitest";
import type { Response } from "express";

import { expressWebhookHandler, expressWebhookMiddleware } from "#src/webhooks/express";
import type { ExpressWebhookRequest } from "#src/webhooks/express";
import type { WebhookReceiver } from "#src/webhooks/receiver";

const makeReceiver = (status: 200 | 400 | 401 | 500): WebhookReceiver => ({
	handle: vi.fn().mockResolvedValue({ body: { ok: status === 200 }, status }),
	on: vi.fn(),
});

const makeResponse = (): {
	readonly json: ReturnType<typeof vi.fn>;
	readonly response: Response;
	readonly status: ReturnType<typeof vi.fn>;
} => {
	const response = {
		json: vi.fn(),
		status: vi.fn(),
	};
	response.status.mockReturnValue(response);
	return {
		json: response.json,
		response: response as unknown as Response,
		status: response.status,
	};
};

describe("expressWebhookHandler", () => {
	it("passes a string body and signature to the receiver", async () => {
		const receiver = makeReceiver(200);
		const handler = expressWebhookHandler(receiver);
		const { json, response, status } = makeResponse();

		await handler(
			{
				body: '{"ok":true}',
				headers: { "x-dsar-signature": "sig_123" },
			} as ExpressWebhookRequest,
			response
		);

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: '{"ok":true}',
			signature: "sig_123",
		});
		expect(status).toHaveBeenCalledWith(200);
		expect(json).toHaveBeenCalledWith({ ok: true });
	});

	it("passes the raw Buffer body and signature to the receiver", async () => {
		const receiver = makeReceiver(200);
		const handler = expressWebhookHandler(receiver);
		const { json, response, status } = makeResponse();

		await handler(
			{
				body: Buffer.from('{"ok":true}'),
				headers: { "x-dsar-signature": "sig_123" },
			} as ExpressWebhookRequest,
			response
		);

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: '{"ok":true}',
			signature: "sig_123",
		});
		expect(status).toHaveBeenCalledWith(200);
		expect(json).toHaveBeenCalledWith({ ok: true });
	});

	it("passes an undefined signature through for receiver-level 401 handling", async () => {
		const receiver = makeReceiver(401);
		const handler = expressWebhookHandler(receiver);
		const { response, status } = makeResponse();

		await handler(
			{
				body: Buffer.from("{}"),
				headers: {},
			} as ExpressWebhookRequest,
			response
		);

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: "{}",
			signature: undefined,
		});
		expect(status).toHaveBeenCalledWith(401);
	});

	it("accepts WebhookReceiverOptions directly and handles expressWebhookMiddleware alias", async () => {
		const verify = vi.fn().mockResolvedValue(undefined);
		const middleware = expressWebhookMiddleware({
			signingSecret: "test-secret",
			verify,
		});
		const { response, status } = makeResponse();

		await middleware(
			{
				body: JSON.stringify({
					correlationId: "corr_1",
					eventId: "evt_1",
					eventType: "request_captured",
					idempotencyKey: "idem_1",
					locale: "en-US",
					payload: {},
					policyVersion: "2026.1",
					requestId: "req_1",
				}),
				headers: { "x-dsar-signature": "valid-sig" },
			} as ExpressWebhookRequest,
			response
		);

		expect(verify).toHaveBeenCalled();
		expect(status).toHaveBeenCalledWith(200);
	});
});

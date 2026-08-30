import { describe, expect, it, vi } from "@effect/vitest";
import type { Context } from "hono";

import { honoWebhookHandler, honoWebhookMiddleware } from "#src/webhooks/hono";
import type { WebhookReceiver } from "#src/webhooks/receiver";

const makeReceiver = (status: 200 | 400 | 401 | 500): WebhookReceiver => ({
	handle: vi.fn().mockResolvedValue({ body: { ok: status === 200 }, status }),
	on: vi.fn(),
});

const makeContext = (signature?: string, body = '{"ok":true}'): Context =>
	({
		req: {
			header: vi.fn().mockReturnValue(signature),
			text: vi.fn().mockResolvedValue(body),
		},
	}) as unknown as Context;

describe("honoWebhookHandler", () => {
	it("passes raw text and signature to the receiver", async () => {
		const receiver = makeReceiver(200);
		const response = await honoWebhookHandler(receiver)(makeContext("sig_123"));

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: '{"ok":true}',
			signature: "sig_123",
		});
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(response.status).toBe(200);
	});

	it("passes missing signatures through for receiver-level 401 handling", async () => {
		const receiver = makeReceiver(401);
		const response = await honoWebhookHandler(receiver)(makeContext());

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: '{"ok":true}',
			signature: undefined,
		});
		expect(response.status).toBe(401);
	});

	it("accepts WebhookReceiverOptions directly, registers handlers, and persists across requests", async () => {
		const verify = vi.fn().mockResolvedValue();
		const capturedHandler = vi.fn();
		const middleware = honoWebhookMiddleware({
			handlers: {
				request_captured: capturedHandler,
			},
			signingSecret: "test-secret",
			verify,
		});

		const body = JSON.stringify({
			correlationId: "corr_1",
			eventId: "evt_1",
			eventType: "request_captured",
			idempotencyKey: "idem_1",
			locale: "en-US",
			payload: { sample: true },
			policyVersion: "2026.1",
			requestId: "req_1",
		});

		const res1 = await middleware(makeContext("valid-sig", body));
		expect(verify).toHaveBeenCalledTimes(1);
		expect(res1.status).toBe(200);
		expect(capturedHandler).toHaveBeenCalledTimes(1);
		expect(capturedHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				eventId: "evt_1",
				eventType: "request_captured",
				requestId: "req_1",
			})
		);

		const res2 = await middleware(makeContext("valid-sig", body));
		expect(res2.status).toBe(200);
		expect(capturedHandler).toHaveBeenCalledTimes(2);
	});
});

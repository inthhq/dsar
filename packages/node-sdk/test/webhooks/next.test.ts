import { describe, expect, it, vi } from "@effect/vitest";

import { nextWebhookHandler, nextWebhookMiddleware } from "#src/webhooks/next";
import type { WebhookReceiver } from "#src/webhooks/receiver";

const makeReceiver = (status: 200 | 400 | 401 | 500): WebhookReceiver => ({
	handle: vi.fn().mockResolvedValue({ body: { ok: status === 200 }, status }),
	on: vi.fn(),
});

describe("nextWebhookHandler", () => {
	it("passes raw text and signature to the receiver", async () => {
		const receiver = makeReceiver(200);
		const request = new Request("https://example.test/webhook", {
			body: '{"ok":true}',
			headers: { "x-dsar-signature": "sig_123" },
			method: "POST",
		});

		const response = await nextWebhookHandler(receiver)(request);

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: '{"ok":true}',
			signature: "sig_123",
		});
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(response.status).toBe(200);
	});

	it("passes missing signatures through for receiver-level 401 handling", async () => {
		const receiver = makeReceiver(401);
		const request = new Request("https://example.test/webhook", {
			body: "{}",
			method: "POST",
		});

		const response = await nextWebhookHandler(receiver)(request);

		expect(receiver.handle).toHaveBeenCalledWith({
			rawBody: "{}",
			signature: undefined,
		});
		expect(response.status).toBe(401);
	});

	it("accepts WebhookReceiverOptions directly, registers handlers, and persists across requests", async () => {
		const verify = vi.fn().mockResolvedValue(undefined);
		const capturedHandler = vi.fn();
		const middleware = nextWebhookMiddleware({
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

		const makeReq = () =>
			new Request("https://example.test/webhook", {
				body,
				headers: { "x-dsar-signature": "valid-sig" },
				method: "POST",
			});

		const res1 = await middleware(makeReq());
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

		const res2 = await middleware(makeReq());
		expect(res2.status).toBe(200);
		expect(capturedHandler).toHaveBeenCalledTimes(2);
	});
});

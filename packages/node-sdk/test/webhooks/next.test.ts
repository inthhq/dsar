import { describe, expect, it, vi } from "@effect/vitest";

import type { WebhookReceiver } from "#src/webhooks";
import { nextWebhookHandler } from "#src/webhooks/next";

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
});

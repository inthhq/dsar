import { describe, expect, it, vi } from "@effect/vitest";
import type { Context } from "hono";

import { honoWebhookHandler } from "#src/webhooks/hono";
import type { WebhookReceiver } from "#src/webhooks/receiver";

const makeReceiver = (status: 200 | 400 | 401 | 500): WebhookReceiver => ({
	handle: vi.fn().mockResolvedValue({ body: { ok: status === 200 }, status }),
	on: vi.fn(),
});

const makeContext = (signature?: string): Context =>
	({
		req: {
			header: vi.fn().mockReturnValue(signature),
			text: vi.fn().mockResolvedValue('{"ok":true}'),
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
});

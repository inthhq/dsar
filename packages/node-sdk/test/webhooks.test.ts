import { describe, expect, it, vi } from "@effect/vitest";

import type {
	EndpointContext,
	WebhookInboundResendPayload,
} from "#src/endpoints/types";
import { makeWebhooksApi } from "#src/endpoints/webhooks";

const DEFAULT_RETURN: unknown = { ok: true };

const mockCtx = (returnValue: unknown = DEFAULT_RETURN): EndpointContext => ({
	call: vi.fn().mockResolvedValue(returnValue),
});

const samplePayload: WebhookInboundResendPayload = {
	created_at: "2026-01-15T10:00:00.000Z",
	data: { messageId: "msg-123", subject: "Data request" },
	type: "email.received",
};

describe("webhooks api", () => {
	it("calls ctx.call with correct method, path, and body", async () => {
		const ctx = mockCtx();
		const api = makeWebhooksApi(ctx);

		await api.inboundResend(samplePayload);

		expect(ctx.call).toHaveBeenCalledWith({
			body: samplePayload,
			method: "POST",
			options: undefined,
			path: "/webhooks/inbound/resend",
		});
	});

	it("forwards options to ctx.call", async () => {
		const ctx = mockCtx();
		const api = makeWebhooksApi(ctx);
		const options = { headers: { "x-custom": "value" } };

		await api.inboundResend(samplePayload, options);

		expect(ctx.call).toHaveBeenCalledWith(expect.objectContaining({ options }));
	});

	it("propagates ctx.call rejection", async () => {
		const ctx: EndpointContext = {
			call: vi.fn().mockRejectedValue(new Error("network failure")),
		};
		const api = makeWebhooksApi(ctx);

		await expect(api.inboundResend(samplePayload)).rejects.toThrow(
			"network failure"
		);
	});
});

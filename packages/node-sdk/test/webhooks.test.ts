import { makeWebhooksApi, verifyWebhook } from "@dsar/node-sdk/webhooks";
import { describe, expect, it, vi } from "@effect/vitest";

import type {
	EndpointContext,
	WebhookInboundResendPayload,
} from "#src/endpoints/types";

const DEFAULT_RETURN: unknown = { ok: true };

const mockCtx = (returnValue: unknown = DEFAULT_RETURN): EndpointContext => ({
	call: vi.fn().mockResolvedValue(returnValue),
});

const samplePayload: WebhookInboundResendPayload = {
	created_at: "2026-01-15T10:00:00.000Z",
	data: { messageId: "msg-123", subject: "Data request" },
	type: "email.received",
};

const verifyWebhookTestSignature = async (
	body: string,
	secret: string
): Promise<string> => {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(body)
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
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

	it("calls rotate-key endpoint with endpoint id and payload", async () => {
		const ctx = mockCtx();
		const api = makeWebhooksApi(ctx);

		await api.rotateKey("endpoint 1", { gracePeriodDays: 3 });

		expect(ctx.call).toHaveBeenCalledWith({
			body: { gracePeriodDays: 3 },
			method: "POST",
			options: undefined,
			path: "/webhooks/endpoints/endpoint%201/rotate-key",
		});
	});

	it("verifies webhook signatures with multiple secrets", async () => {
		const body = JSON.stringify({ eventType: "request_captured" });
		const signature = await verifyWebhookTestSignature(body, "new-secret");

		const result = await verifyWebhook({
			body,
			keyId: "key-new",
			secrets: ["old-secret", "new-secret"],
			signature,
		});

		expect(result).toStrictEqual({ keyId: "key-new", verified: true });
	});

	it("verifies webhook signatures with lookup metadata", async () => {
		const body = JSON.stringify({ eventType: "clock_due_changed" });
		const signature = await verifyWebhookTestSignature(
			body,
			"looked-up-secret"
		);

		const result = await verifyWebhook({
			body,
			endpointId: "default",
			keyId: "key-lookup",
			lookupSecrets: ({ endpointId, keyId }) => {
				expect([endpointId, keyId]).toStrictEqual(["default", "key-lookup"]);
				return [{ id: "key-lookup", secret: "looked-up-secret" }];
			},
			signature,
		});

		expect(result).toStrictEqual({ keyId: "key-lookup", verified: true });
	});

	it("rejects invalid webhook signatures", async () => {
		const result = await verifyWebhook({
			body: "{}",
			secrets: ["secret"],
			signature: "not-valid",
		});

		expect(result).toStrictEqual({ verified: false });
	});
});

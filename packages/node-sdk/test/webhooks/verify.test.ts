import { describe, expect, it } from "@effect/vitest";

import { verifyWebhook, WebhookVerificationError } from "#src/webhooks";

const payload =
	'{"eventId":"evt_123","eventType":"request_captured","requestId":"req_123","correlationId":"corr_123","idempotencyKey":"idem_123","policyVersion":"2026-01","locale":"en-US","payload":{"source":"test"}}';
const signingSecret = "whsec_test";
const signature =
	"34c181d0ca6196a1adf09621c59808ecb77a39d04a12fa8ee8e73af403df72d6";

describe("verifyWebhook", () => {
	it("accepts a valid HMAC-SHA256 signature", async () => {
		await expect(
			verifyWebhook({ payload, signature, signingSecret })
		).resolves.toBeUndefined();
	});

	it("rejects a tampered body", async () => {
		await expect(
			verifyWebhook({
				payload: payload.replace("test", "tampered"),
				signature,
				signingSecret,
			})
		).rejects.toMatchObject({ code: "invalid_signature" });
	});

	it("rejects the wrong secret", async () => {
		await expect(
			verifyWebhook({
				payload,
				signature,
				signingSecret: "whsec_wrong",
			})
		).rejects.toMatchObject({ code: "invalid_signature" });
	});

	it("rejects a missing signature with a specific error code", async () => {
		await expect(
			verifyWebhook({ payload, signature: " ", signingSecret })
		).rejects.toBeInstanceOf(WebhookVerificationError);
		await expect(
			verifyWebhook({ payload, signature: " ", signingSecret })
		).rejects.toMatchObject({ code: "missing_signature" });
	});

	it("rejects non-matching signature lengths safely", async () => {
		await expect(
			verifyWebhook({
				payload,
				signature: signature.slice(0, -2),
				signingSecret,
			})
		).rejects.toMatchObject({ code: "invalid_signature" });
	});
});

import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "@effect/vitest";

import type { WebhookEvent } from "#src/webhooks";
import { createWebhookReceiver } from "#src/webhooks";

const signingSecret = "whsec_test";

const sampleEvent = {
	correlationId: "corr_123",
	eventId: "evt_123",
	eventType: "request_captured",
	idempotencyKey: "idem_123",
	locale: "en-US",
	payload: { source: "test" },
	policyVersion: "2026-01",
	requestId: "req_123",
} as const;

const signBody = (body: string): string =>
	createHmac("sha256", signingSecret).update(body).digest("hex");

describe("createWebhookReceiver", () => {
	it("dispatches a valid signed event to the matching handler", async () => {
		const rawBody = JSON.stringify(sampleEvent);
		let handledEvent: WebhookEvent<"request_captured"> | undefined;
		const receiver = createWebhookReceiver({ signingSecret }).on(
			"request_captured",
			(event) => {
				handledEvent = event;
			}
		);

		const result = await receiver.handle({
			rawBody,
			signature: signBody(rawBody),
		});

		expect(result).toEqual({ body: { ok: true }, status: 200 });
		expect(handledEvent).toEqual(sampleEvent);
	});

	it("returns 400 for malformed JSON after signature verification", async () => {
		const rawBody = "{";
		const receiver = createWebhookReceiver({ signingSecret });

		await expect(
			receiver.handle({ rawBody, signature: signBody(rawBody) })
		).resolves.toEqual({
			body: { error: "malformed_body", ok: false },
			status: 400,
		});
	});

	it("returns 401 for a missing signature", async () => {
		const receiver = createWebhookReceiver({ signingSecret });

		await expect(
			receiver.handle({
				rawBody: JSON.stringify(sampleEvent),
				signature: undefined,
			})
		).resolves.toEqual({
			body: { error: "missing_signature", ok: false },
			status: 401,
		});
	});

	it("returns 401 for an invalid signature", async () => {
		const receiver = createWebhookReceiver({ signingSecret });

		await expect(
			receiver.handle({
				rawBody: JSON.stringify(sampleEvent),
				signature: "invalid",
			})
		).resolves.toEqual({
			body: { error: "invalid_signature", ok: false },
			status: 401,
		});
	});

	it("acknowledges a known event with no registered handler", async () => {
		const rawBody = JSON.stringify(sampleEvent);
		const receiver = createWebhookReceiver({ signingSecret });

		await expect(
			receiver.handle({ rawBody, signature: signBody(rawBody) })
		).resolves.toEqual({ body: { ok: true }, status: 200 });
	});

	it("returns 500 when a handler fails", async () => {
		const rawBody = JSON.stringify(sampleEvent);
		const receiver = createWebhookReceiver({ signingSecret }).on(
			"request_captured",
			() => {
				throw new Error("boom");
			}
		);

		await expect(
			receiver.handle({ rawBody, signature: signBody(rawBody) })
		).resolves.toEqual({
			body: { error: "handler_failed", ok: false },
			status: 500,
		});
	});

	it("returns 400 for invalid event shape", async () => {
		const rawBody = JSON.stringify({ ...sampleEvent, eventId: "" });
		const receiver = createWebhookReceiver({ signingSecret });

		await expect(
			receiver.handle({ rawBody, signature: signBody(rawBody) })
		).resolves.toEqual({
			body: { error: "invalid_event", ok: false },
			status: 400,
		});
	});

	it("supports a verify override for tests", async () => {
		const rawBody = JSON.stringify(sampleEvent);
		const verify = vi.fn().mockResolvedValue();
		const receiver = createWebhookReceiver({ signingSecret, verify });

		await receiver.handle({ rawBody, signature: "test-signature" });

		expect(verify).toHaveBeenCalledWith({
			payload: rawBody,
			signature: "test-signature",
			signingSecret,
		});
	});
});

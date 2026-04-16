import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	makeOutboundResendAdapter,
	normalizeOutboundResendProviderError,
} from "#src";

describe("outbound-resend adapter", () => {
	it.effect("validates config and exposes diagnostics", () =>
		Effect.gen(function* _() {
			const adapter = makeOutboundResendAdapter(
				{
					apiKey: "re_test",
					from: "DSAR <no-reply@example.com>",
				},
				{
					sendEmail: () =>
						Promise.resolve({
							data: { id: "email_1" },
							error: null,
						}),
				}
			);
			const result = yield* adapter.validateConfig({
				apiKey: "re_test",
				from: "DSAR <no-reply@example.com>",
			});
			expect(result).toBeUndefined();
			const diagnostics = yield* adapter.diagnostics();
			expect(diagnostics.key).toBe("outbound-resend");
			expect(diagnostics.capability).toBe("notifications");
		})
	);

	it.effect(
		"returns the standard invocation error shape for invalid config",
		() =>
			Effect.gen(function* _() {
				const adapter = makeOutboundResendAdapter(
					{
						apiKey: "re_test",
						from: "DSAR <no-reply@example.com>",
					},
					{
						sendEmail: () =>
							Promise.resolve({
								data: { id: "email_1" },
								error: null,
							}),
					}
				);
				const result = yield* Effect.result(adapter.validateConfig({}));
				expect(result._tag).toBe("Failure");
				expect(
					(result as { readonly failure: { readonly _tag: string } }).failure
						._tag
				).toBe("AdapterInvocationError");
				expect(
					(
						result as {
							readonly failure: {
								readonly adapterKey: string;
								readonly capability: string;
								readonly category: string;
							};
						}
					).failure
				).toMatchObject({
					adapterKey: "outbound-resend",
					capability: "notifications",
					category: "config",
				});
			})
	);

	it.effect("returns skipped when recipient is missing", () =>
		Effect.gen(function* _() {
			const sendEmail = vi.fn(() =>
				Promise.resolve({
					data: null,
					error: null,
				})
			);
			const adapter = makeOutboundResendAdapter(
				{
					apiKey: "re_test",
					from: "DSAR <no-reply@example.com>",
				},
				{ sendEmail }
			);
			const result = yield* adapter.send({
				correlationId: "corr_1",
				eventId: "evt_1",
				eventType: "request_captured",
				idempotencyKey: "idem_1",
				locale: "en-GB",
				payload: {},
				policyVersion: "uk-v1",
				requestId: "req_1",
			});
			expect(result.status).toBe("skipped");
			expect(sendEmail).not.toHaveBeenCalled();
		})
	);

	it.effect("passes idempotency key and reports delivered", () =>
		Effect.gen(function* _() {
			const sendEmail = vi.fn(() =>
				Promise.resolve({
					data: { id: "email_1" },
					error: null,
					headers: { "x-test": "ok" },
				})
			);
			const adapter = makeOutboundResendAdapter(
				{
					apiKey: "re_test",
					from: "DSAR <no-reply@example.com>",
					subjectPrefix: "[DSAR]",
				},
				{ sendEmail }
			);
			const result = yield* adapter.send({
				correlationId: "corr_1",
				eventId: "evt_1",
				eventType: "request_captured",
				idempotencyKey: "idem_1",
				locale: "en-GB",
				payload: {
					_outboundResend: { recipient: "subject@example.com" },
				},
				policyVersion: "uk-v1",
				requestId: "req_1",
			});
			expect(result.status).toBe("delivered");
			expect(sendEmail).toHaveBeenCalledOnce();
			expect(sendEmail.mock.calls[0]?.[0].options.idempotencyKey).toBe(
				"idem_1"
			);
		})
	);

	it.effect("supports opt-in Chat SDK-backed delivery", () =>
		Effect.gen(function* _() {
			const sendEmail = vi.fn(() =>
				Promise.resolve({
					data: null,
					error: null,
				})
			);
			const sendChatMessage = vi.fn(() =>
				Promise.resolve({ id: "chat-msg-1" })
			);
			const adapter = makeOutboundResendAdapter(
				{
					apiKey: "re_test",
					from: "DSAR <no-reply@example.com>",
					subjectPrefix: "[DSAR]",
				},
				{
					sendChatMessage,
					sendEmail,
				}
			);
			const result = yield* adapter.send({
				correlationId: "corr_1",
				eventId: "evt_1",
				eventType: "request_captured",
				idempotencyKey: "idem_1",
				locale: "en-GB",
				payload: {
					_outboundResend: { recipient: "subject@example.com" },
				},
				policyVersion: "uk-v1",
				requestId: "req_1",
			});
			expect(result.status).toBe("delivered");
			expect(result.responseCode).toBe(202);
			expect(sendChatMessage).toHaveBeenCalledOnce();
			expect(sendChatMessage.mock.calls[0]?.[0]).toMatchObject({
				recipient: "subject@example.com",
				subject: "[DSAR] DSAR update: request captured",
				text: expect.stringContaining("Request ID: req_1"),
			});
			expect(sendEmail).not.toHaveBeenCalled();
		})
	);

	it.effect("fails when Chat SDK delivery does not return an id", () =>
		Effect.gen(function* _() {
			const adapter = makeOutboundResendAdapter(
				{
					apiKey: "re_test",
					from: "DSAR <no-reply@example.com>",
				},
				{
					sendChatMessage: () => Promise.resolve({ id: "" }),
					sendEmail: vi.fn(() =>
						Promise.resolve({
							data: { id: "email_1" },
							error: null,
						})
					),
				}
			);
			const result = yield* adapter.send({
				correlationId: "corr_1",
				eventId: "evt_1",
				eventType: "request_captured",
				idempotencyKey: "idem_1",
				locale: "en-GB",
				payload: {
					_outboundResend: { recipient: "subject@example.com" },
				},
				policyVersion: "uk-v1",
				requestId: "req_1",
			});

			expect(result).toMatchObject({
				error: "Chat SDK delivery did not return a message id.",
				status: "failed",
			});
		})
	);

	it("normalizes provider failures with retriable metadata", () => {
		const normalized = normalizeOutboundResendProviderError(
			new Error("network timeout while calling resend")
		);
		expect(normalized.adapterKey).toBe("outbound-resend");
		expect(normalized.retriable).toBeTruthy();
		expect(["network", "timeout"]).toContain(normalized.category);
	});
});

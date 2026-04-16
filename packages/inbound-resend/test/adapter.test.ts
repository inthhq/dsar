import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeResendInboundAdapter } from "#src";

const validEvent = {
	created_at: "2026-02-20T12:00:01.000Z",
	data: {
		attachments: [],
		bcc: [],
		cc: [],
		created_at: "2026-02-20T12:00:00.000Z",
		email_id: "email-1",
		from: "Jane Subject <jane@example.com>",
		message_id: "<msg-1>",
		subject: "Subject access request for my personal data",
		to: ["privacy@tenant-one.example"],
	},
	type: "email.received",
};

describe("resend inbound adapter", () => {
	it.effect("validates config and exposes diagnostics", () =>
		Effect.gen(function* _() {
			const adapter = makeResendInboundAdapter(
				{
					defaultRoute: {
						jurisdiction: "uk",
						tenantId: "tenant-1",
					},
					webhookSecret: "whsec_test",
				},
				{
					verifyWebhook: () => validEvent,
				}
			);

			yield* adapter.validateConfig({ webhookSecret: "whsec_test" });
			const diagnostics = yield* adapter.diagnostics();
			expect(diagnostics.key).toBe("resend");
			expect(diagnostics.capability).toBe("inbound");
		})
	);

	it.effect("normalizes received payload and resolves recipient route", () =>
		Effect.gen(function* _() {
			const adapter = makeResendInboundAdapter(
				{
					routeMap: {
						"privacy@tenant-one.example": {
							jurisdiction: "eu",
							tenantId: "tenant-1",
							workspaceId: "workspace-1",
						},
					},
					webhookSecret: "whsec_test",
				},
				{
					verifyWebhook: () => validEvent,
				}
			);

			const result = yield* adapter.receive({
				payload: {
					headers: {
						id: "id-1",
						signature: "sig-1",
						timestamp: "ts-1",
					},
					rawBody: "{}",
				},
				source: "resend:webhook",
			});
			expect(result.sourceId).toBe("email-1");
			expect(result.receivedAt).toBe("2026-02-20T12:00:00.000Z");
			expect(result.payload.route).toStrictEqual({
				jurisdiction: "eu",
				tenantId: "tenant-1",
				workspaceId: "workspace-1",
			});
			expect(result.payload.intent).toStrictEqual({
				isDsar: true,
				reason: expect.stringContaining("Matched token"),
			});
			expect(result.payload.chat?.id).toBe("email-1");
			expect(typeof result.payload.chat?.threadId).toBe("string");
		})
	);

	it.effect("forwards fetched content into the injected chat parser", () =>
		Effect.gen(function* _() {
			const parseChatMessage = vi.fn(() => ({
				attachments: [],
				author: {
					fullName: "Jane Subject",
					id: "jane@example.com",
					userName: "jane",
				},
				id: "chat-msg-1",
				metadata: {},
				text: "Please send me my data.",
				threadId: "resend:privacy@tenant-one.example:abc123",
			}));
			const adapter = makeResendInboundAdapter(
				{
					apiKey: "re_test",
					defaultRoute: {
						jurisdiction: "uk",
						tenantId: "tenant-1",
					},
					fetchEmailContent: true,
					webhookSecret: "whsec_test",
				},
				{
					getEmailContent: () => ({
						headers: {
							"x-provider-number": 42,
						},
						html: "<p>Please send me my data.</p>",
						text: "Please send me my data.",
					}),
					parseChatMessage,
					verifyWebhook: () => ({
						...validEvent,
						data: {
							...validEvent.data,
							attachments: [
								{
									content_type: "text/plain",
									filename: "proof.txt",
									id: "attachment-1",
								},
							],
						},
					}),
				}
			);

			const result = yield* adapter.receive({
				payload: {
					headers: {
						id: "id-1",
						signature: "sig-1",
						timestamp: "ts-1",
					},
					rawBody: "{}",
				},
				source: "resend:webhook",
			});

			expect(parseChatMessage).toHaveBeenCalledOnce();
			expect(parseChatMessage.mock.calls[0]?.[0]).toStrictEqual({
				attachments: [
					{
						contentType: "text/plain",
						filename: "proof.txt",
						url: "resend:attachment:attachment-1",
					},
				],
				cc: [],
				createdAt: "2026-02-20T12:00:00.000Z",
				from: "Jane Subject <jane@example.com>",
				headers: {
					"x-provider-number": "42",
				},
				html: "<p>Please send me my data.</p>",
				id: "email-1",
				messageId: "<msg-1>",
				subject: "Subject access request for my personal data",
				text: "Please send me my data.",
				to: ["privacy@tenant-one.example"],
			});
			expect(result.payload.chat?.threadId).toBe(
				"resend:privacy@tenant-one.example:abc123"
			);
		})
	);

	it.effect("returns non-dsar intent when subject/body do not match", () =>
		Effect.gen(function* _() {
			const adapter = makeResendInboundAdapter(
				{
					defaultRoute: {
						jurisdiction: "uk",
						tenantId: "tenant-1",
					},
					webhookSecret: "whsec_test",
				},
				{
					verifyWebhook: () => ({
						...validEvent,
						data: {
							...validEvent.data,
							subject: "Weekly newsletter",
						},
					}),
				}
			);

			const result = yield* adapter.receive({
				payload: {
					headers: {
						id: "id-1",
						signature: "sig-1",
						timestamp: "ts-1",
					},
					rawBody: "{}",
				},
				source: "resend:webhook",
			});
			expect(result.payload.intent).toStrictEqual({
				isDsar: false,
				reason: "No DSAR-intent token matched in subject/body.",
			});
		})
	);

	it.effect(
		"normalizes verification failures into AdapterInvocationError",
		() =>
			Effect.gen(function* _() {
				const adapter = makeResendInboundAdapter(
					{
						defaultRoute: {
							jurisdiction: "uk",
							tenantId: "tenant-1",
						},
						webhookSecret: "whsec_test",
					},
					{
						verifyWebhook: () => {
							throw new Error("signature verification failed");
						},
					}
				);

				const result = yield* Effect.result(
					adapter.receive({
						payload: {
							headers: {
								id: "id-1",
								signature: "sig-1",
								timestamp: "ts-1",
							},
							rawBody: "{}",
						},
						source: "resend:webhook",
					})
				);
				expect(result._tag).toBe("Failure");
				expect(
					(result as { readonly failure: { readonly _tag: string } }).failure
						._tag
				).toBe("AdapterInvocationError");
			})
	);
});

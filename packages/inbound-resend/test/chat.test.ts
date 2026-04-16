import { createMemoryState } from "@dsar/core/test-fixtures/chat-memory-state";
import { describe, expect, it } from "@effect/vitest";

import {
	makeResendChatRuntime,
	makeResendMessageParser,
	toResendParsedMessageSnapshot,
} from "#src";

describe("resend chat helpers", () => {
	it("creates resend runtimes and opens DM threads using resend thread ids", async () => {
		const runtime = makeResendChatRuntime({
			resend: {
				apiKey: "re_test",
				fromAddress: "bot@example.com",
				fromName: "DSAR Bot",
				webhookSecret: "whsec_test",
			},
			state: createMemoryState(),
			userName: "dsar-bot",
		});

		const dmThreadId = await runtime.openDM("subject@example.com");
		expect(dmThreadId.startsWith("resend:subject@example.com:")).toBeTruthy();
	});

	it("parses resend raw messages into serializable snapshots", () => {
		const parser = makeResendMessageParser({
			apiKey: "re_test",
			fromAddress: "bot@example.com",
			fromName: "DSAR Bot",
			webhookSecret: "whsec_test",
		});

		const snapshot = toResendParsedMessageSnapshot(parser, {
			attachments: [],
			createdAt: "2026-02-20T12:00:00.000Z",
			from: "Jane Subject <jane@example.com>",
			id: "email-1",
			messageId: "<msg-1>",
			subject: "Subject access request",
			text: "Please send me my data.",
			to: ["privacy@example.com"],
		});

		expect(snapshot.id).toBe("email-1");
		expect(snapshot.author).toBeTruthy();
		expect(snapshot.text).toContain("Please send me my data");
	});

	it("projects parse results without leaking Chat SDK classes", () => {
		const snapshot = toResendParsedMessageSnapshot(
			{
				parseMessage: () =>
					({
						toJSON: () => ({
							attachments: [],
							author: {
								fullName: "Jane Subject",
								id: "subject@example.com",
								userName: "jane",
							},
							id: "msg-1",
							metadata: {
								createdAt: "2026-02-20T12:00:00.000Z",
							},
							text: "hello",
							threadId: "resend:thread-1",
						}),
					}) as never,
			},
			{
				createdAt: "2026-02-20T12:00:00.000Z",
				from: "ignored@example.com",
				id: "ignored",
				messageId: "<ignored>",
				subject: "ignored",
				to: ["ignored@example.com"],
			} as never
		);

		expect(snapshot).toStrictEqual({
			attachments: [],
			author: {
				fullName: "Jane Subject",
				id: "subject@example.com",
				userName: "jane",
			},
			id: "msg-1",
			metadata: {
				createdAt: "2026-02-20T12:00:00.000Z",
			},
			text: "hello",
			threadId: "resend:thread-1",
		});
	});
});

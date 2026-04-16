import { createMemoryState } from "@dsar/core/test-fixtures/chat-memory-state";
import { describe, expect, it } from "@effect/vitest";

import {
	makeSlackChatRuntime,
	makeSlackMessageParser,
	toSlackParsedMessageSnapshot,
} from "#src/chat";

describe("slack chat helpers", () => {
	it("creates slack runtimes with the Slack adapter wired in", () => {
		const runtime = makeSlackChatRuntime({
			slack: {
				botToken: "xoxb-test",
				signingSecret: "signing-secret",
			},
			state: createMemoryState(),
			userName: "dsar-bot",
		});

		expect(runtime.adapter.name).toBe("slack");
		expect(runtime.chat).toBeTruthy();
	});

	it("parses slack raw message events into serializable snapshots", () => {
		const parser = makeSlackMessageParser({
			botToken: "xoxb-test",
			signingSecret: "signing-secret",
			userName: "dsar-bot",
		});

		const snapshot = toSlackParsedMessageSnapshot(parser, {
			channel: "C123",
			channel_type: "channel",
			text: "<@U_BOT> I need a copy of my data",
			thread_ts: "1766458026.240809",
			ts: "1766458026.240809",
			type: "app_mention",
			user: "U123",
		});

		expect(snapshot.id).toBe("1766458026.240809");
		expect(snapshot.threadId).toContain("slack:C123");
		expect(snapshot.text).toContain("I need a copy of my data");
	});
});

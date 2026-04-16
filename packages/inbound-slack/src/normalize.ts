import { asNonEmptyString } from "@dsar/guards";

import { makeSlackMessageParser, toSlackParsedMessageSnapshot } from "./chat";
import type { defaultSlackInboundConfig } from "./config";
import type { SlackEventBody } from "./parse";
import { resolveRequestor } from "./requestor";
import { classifyIntent, resolveRoute } from "./routing";
import type {
	SlackAdapterInvocationPayload,
	SlackInboundAdapterDependencies,
	SlackNormalizedInboundPayload,
} from "./types";

const buildRawContextRef = (input: SlackEventBody): string =>
	[
		"slack",
		input.teamId,
		input.channelId ?? "no-channel",
		input.threadTs ?? input.eventId,
	].join(":");

const buildChannelName = (input: SlackEventBody): string => {
	if (input.channelName) {
		return `slack:${input.channelName}`;
	}
	if (input.channelId) {
		return `slack:${input.channelId}`;
	}
	return `slack:${input.surface}`;
};

const createMessageSnapshot = (
	input: SlackEventBody,
	config: ReturnType<typeof defaultSlackInboundConfig>,
	dependencies: SlackInboundAdapterDependencies
): SlackNormalizedInboundPayload["chat"] => {
	if (!input.rawEvent) {
		return undefined;
	}
	if (
		input.surface !== "app_mention" &&
		input.surface !== "direct_message" &&
		input.surface !== "message"
	) {
		return undefined;
	}
	if (dependencies.parseChatMessage) {
		return dependencies.parseChatMessage({ rawEvent: input.rawEvent });
	}
	const parser = makeSlackMessageParser({
		botToken: config.botToken,
		signingSecret: config.signingSecret,
		userName: config.userName,
	});
	return toSlackParsedMessageSnapshot(
		parser,
		input.rawEvent as Readonly<Record<string, unknown>>
	);
};

const shouldIgnoreEvent = (input: SlackEventBody): boolean => {
	const subtype = asNonEmptyString(input.rawEvent?.subtype);
	return (
		(input.surface === "message" || input.surface === "direct_message") &&
		(subtype === "bot_message" ||
			asNonEmptyString(input.rawEvent?.bot_id) !== undefined)
	);
};

/**
 * Converts a parsed Slack event into the adapter payload consumed by the backend.
 *
 * @param input - Parsed Slack event body extracted from the webhook payload.
 * @param config - Resolved Slack inbound adapter configuration.
 * @param dependencies - Optional dependency overrides used during normalization.
 * @returns A normalized Slack adapter invocation payload ready for intake capture.
 */
export const toNormalizedPayload = async (
	input: SlackEventBody,
	config: ReturnType<typeof defaultSlackInboundConfig>,
	dependencies: SlackInboundAdapterDependencies
): Promise<SlackAdapterInvocationPayload> => {
	const route = resolveRoute(input, config.teamRoutes, config.defaultRoute);
	const intent = shouldIgnoreEvent(input)
		? {
				isDsar: false,
				reason: "Slack bot/system events are ignored.",
			}
		: classifyIntent(input);
	return {
		callbackId: input.callbackId,
		channelId: input.channelId,
		channelName: input.channelName,
		chat: createMessageSnapshot(input, config, dependencies),
		command: input.command,
		eventType: input.eventType,
		intakeSourceChannel: buildChannelName(input),
		intent,
		kind: "request_capture",
		provider: "slack",
		rawContextRef: buildRawContextRef(input),
		requestor: await resolveRequestor(input, config, dependencies),
		responseUrl: input.responseUrl,
		route,
		surface: input.surface,
		teamId: input.teamId,
		text: input.text,
		threadId: input.threadTs,
	};
};

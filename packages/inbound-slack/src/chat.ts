import { createSlackAdapter } from "@chat-adapter/slack";
import type {
	SlackAdapter,
	SlackAdapterConfig,
	SlackEvent,
} from "@chat-adapter/slack";
import { Chat } from "chat";
import type {
	AdapterPostableMessage,
	Logger,
	LogLevel,
	Message,
	StateAdapter,
} from "chat";

/**
 * Configuration for the Slack Chat SDK runtime helper.
 */
export interface SlackChatRuntimeConfig {
	/** Slack Chat SDK adapter configuration. */
	readonly slack: SlackAdapterConfig;
	/** Chat SDK state adapter used for locks, subscriptions, and cache entries. */
	readonly state: StateAdapter;
	/** Chat SDK user name for authored bot messages. */
	readonly userName: string;
	/** Optional dedupe window for incoming Slack events. */
	readonly dedupeTtlMs?: number;
	/** Optional Chat SDK logger or log level override. */
	readonly logger?: Logger | LogLevel;
	/** Optional placeholder text used while streaming responses. */
	readonly fallbackStreamingPlaceholderText?: string | null;
	/** Optional interval for streaming message updates. */
	readonly streamingUpdateIntervalMs?: number;
}

/**
 * Slack-specific Chat SDK runtime wrapper used by plugin harnesses.
 *
 * @typeParam TState - Application-defined thread state managed by Chat SDK.
 */
export interface SlackChatRuntime<TState = Record<string, unknown>> {
	/** Underlying Slack Chat SDK adapter instance. */
	readonly adapter: SlackAdapter;
	/** Chat SDK runtime configured with the Slack adapter. */
	readonly chat: Chat<{ slack: SlackAdapter }, TState>;
	/** Opens a DM thread for the supplied Slack user id. */
	readonly openDM: (userId: string) => Promise<string>;
	/** Parses a raw Slack event into a Chat SDK message. */
	readonly parseMessage: (message: SlackEvent) => Message<unknown>;
	/** Posts a message to an existing Slack thread. */
	readonly postMessage: (
		threadId: string,
		message: AdapterPostableMessage
	) => Promise<{
		readonly id: string;
		readonly raw: SlackEvent;
		readonly threadId: string;
	}>;
}

/**
 * Serializable snapshot of a parsed Slack message.
 */
export interface SlackParsedMessageSnapshot {
	/** Serialized attachments from the parsed Slack message. */
	readonly attachments: ReturnType<Message<unknown>["toJSON"]>["attachments"];
	/** Serialized author information from the parsed Slack message. */
	readonly author: ReturnType<Message<unknown>["toJSON"]>["author"];
	/** Stable message identifier. */
	readonly id: string;
	/** Parsed message metadata emitted by the Chat SDK adapter. */
	readonly metadata: ReturnType<Message<unknown>["toJSON"]>["metadata"];
	/** Human-readable message text. */
	readonly text: string;
	/** Stable Slack thread identifier. */
	readonly threadId: string;
}

/**
 * Lightweight Slack message parser wrapper around the Chat SDK adapter.
 */
export interface SlackMessageParser {
	/** Underlying Slack Chat SDK adapter instance. */
	readonly adapter: SlackAdapter;
	/** Parses a raw Slack event into a Chat SDK message. */
	readonly parseMessage: (message: SlackEvent) => Message<unknown>;
}

/**
 * Creates a reusable Slack-backed Chat SDK runtime.
 *
 * @typeParam TState - Application-defined thread state managed by Chat SDK.
 * @param config - Slack adapter and Chat SDK runtime configuration.
 * @returns A Slack-backed runtime wrapper for Chat SDK operations.
 */
export const makeSlackChatRuntime = <TState = Record<string, unknown>>(
	config: SlackChatRuntimeConfig
): SlackChatRuntime<TState> => {
	const adapter = createSlackAdapter(config.slack);
	const chat = new Chat<{ slack: SlackAdapter }, TState>({
		adapters: { slack: adapter },
		dedupeTtlMs: config.dedupeTtlMs,
		fallbackStreamingPlaceholderText: config.fallbackStreamingPlaceholderText,
		logger: config.logger,
		state: config.state,
		streamingUpdateIntervalMs: config.streamingUpdateIntervalMs,
		userName: config.userName,
	});

	return {
		adapter,
		chat,
		openDM: (userId) => adapter.openDM(userId),
		parseMessage: (message) => adapter.parseMessage(message),
		postMessage: async (threadId, message) => {
			const sent = await adapter.postMessage(threadId, message);
			return {
				id: sent.id,
				raw: sent.raw as SlackEvent,
				threadId: sent.threadId,
			};
		},
	};
};

/**
 * Serializes a parsed Slack message into a plain JSON-friendly snapshot.
 *
 * @param runtime - Runtime or parser capable of parsing raw Slack events.
 * @param message - Raw Slack event to serialize.
 * @returns A plain snapshot of the parsed Slack message.
 */
export const toSlackParsedMessageSnapshot = (
	runtime: Pick<SlackChatRuntime, "parseMessage">,
	message: SlackEvent
): SlackParsedMessageSnapshot => {
	const parsed = runtime.parseMessage(message);
	const serialized = parsed.toJSON();
	return {
		attachments: serialized.attachments,
		author: serialized.author,
		id: serialized.id,
		metadata: serialized.metadata,
		text: serialized.text,
		threadId: serialized.threadId,
	};
};

/**
 * Creates a lightweight Slack parser without constructing a full Chat SDK runtime.
 *
 * @param config - Slack adapter configuration.
 * @returns A parser wrapper that exposes `parseMessage`.
 */
export const makeSlackMessageParser = (
	config: SlackAdapterConfig
): SlackMessageParser => {
	const adapter = createSlackAdapter(config);
	return {
		adapter,
		parseMessage: (message) => adapter.parseMessage(message),
	};
};

import { createResendAdapter } from "@resend/chat-sdk-adapter";
import type {
	ResendAdapter,
	ResendAdapterConfig,
	ResendRawMessage,
} from "@resend/chat-sdk-adapter";
import { Chat } from "chat";
import type {
	AdapterPostableMessage,
	Logger,
	LogLevel,
	Message,
	StateAdapter,
} from "chat";

/**
 * Configuration for the Resend Chat SDK runtime helper.
 */
export interface ResendChatRuntimeConfig {
	/** Resend Chat SDK adapter configuration. */
	readonly resend: ResendAdapterConfig;
	/** Chat SDK state adapter used for locks, subscriptions, and cache entries. */
	readonly state: StateAdapter;
	/** Chat SDK user name for authored bot messages. */
	readonly userName: string;
	/** Optional dedupe window for incoming Resend messages. */
	readonly dedupeTtlMs?: number;
	/** Optional Chat SDK logger or log level override. */
	readonly logger?: Logger | LogLevel;
	/** Optional placeholder text used while streaming responses. */
	readonly fallbackStreamingPlaceholderText?: string | null;
	/** Optional interval for streaming message updates. */
	readonly streamingUpdateIntervalMs?: number;
}

/**
 * Resend-specific Chat SDK runtime wrapper used by plugin harnesses.
 *
 * @typeParam TState - Application-defined thread state managed by Chat SDK.
 */
export interface ResendChatRuntime<TState = Record<string, unknown>> {
	/** Underlying Resend Chat SDK adapter instance. */
	readonly adapter: ResendAdapter;
	/** Chat SDK runtime configured with the Resend adapter. */
	readonly chat: Chat<{ resend: ResendAdapter }, TState>;
	/** Opens a DM thread for the supplied email address. */
	readonly openDM: (email: string) => Promise<string>;
	/** Parses a raw Resend message into a Chat SDK message. */
	readonly parseMessage: (
		message: ResendRawMessage
	) => Message<ResendRawMessage>;
	/** Posts a message to an existing Resend thread. */
	readonly postMessage: (
		threadId: string,
		message: AdapterPostableMessage
	) => Promise<{
		readonly id: string;
		readonly raw: ResendRawMessage;
		readonly threadId: string;
	}>;
}

/**
 * Serializable snapshot of a parsed Resend message.
 */
export interface ResendParsedMessageSnapshot {
	/** Serialized attachments from the parsed Resend message. */
	readonly attachments: ReturnType<
		Message<ResendRawMessage>["toJSON"]
	>["attachments"];
	/** Serialized author information from the parsed Resend message. */
	readonly author: ReturnType<Message<ResendRawMessage>["toJSON"]>["author"];
	/** Stable message identifier. */
	readonly id: string;
	/** Parsed message metadata emitted by the Chat SDK adapter. */
	readonly metadata: ReturnType<
		Message<ResendRawMessage>["toJSON"]
	>["metadata"];
	/** Human-readable message text. */
	readonly text: string;
	/** Stable Resend thread identifier. */
	readonly threadId: string;
}

/**
 * Lightweight Resend message parser wrapper around the Chat SDK adapter.
 */
export interface ResendMessageParser {
	/** Underlying Resend Chat SDK adapter instance. */
	readonly adapter: ResendAdapter;
	/** Parses a raw Resend message into a Chat SDK message. */
	readonly parseMessage: (
		message: ResendRawMessage
	) => Message<ResendRawMessage>;
}

/**
 * Creates a reusable Resend-backed Chat SDK runtime.
 *
 * @typeParam TState - Application-defined thread state managed by Chat SDK.
 * @param config - Resend adapter and Chat SDK runtime configuration.
 * @returns A Resend-backed runtime wrapper for Chat SDK operations.
 */
export const makeResendChatRuntime = <TState = Record<string, unknown>>(
	config: ResendChatRuntimeConfig
): ResendChatRuntime<TState> => {
	const adapter = createResendAdapter(config.resend);
	const chat = new Chat<{ resend: ResendAdapter }, TState>({
		adapters: { resend: adapter },
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
		openDM: (email) => adapter.openDM(email),
		parseMessage: (message) => adapter.parseMessage(message),
		postMessage: (threadId, message) => adapter.postMessage(threadId, message),
	};
};

/**
 * Serializes a parsed Resend message into a plain JSON-friendly snapshot.
 *
 * @param runtime - Runtime or parser capable of parsing raw Resend messages.
 * @param message - Raw Resend message to serialize.
 * @returns A plain snapshot of the parsed Resend message.
 */
export const toResendParsedMessageSnapshot = (
	runtime: Pick<ResendChatRuntime, "parseMessage">,
	message: ResendRawMessage
): ResendParsedMessageSnapshot => {
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
 * Creates a lightweight Resend parser without constructing a full Chat SDK runtime.
 *
 * @param config - Resend adapter configuration.
 * @returns A parser wrapper that exposes `parseMessage`.
 */
export const makeResendMessageParser = (
	config: ResendAdapterConfig
): ResendMessageParser => {
	const adapter = createResendAdapter(config);
	return {
		adapter,
		parseMessage: (message) => adapter.parseMessage(message),
	};
};

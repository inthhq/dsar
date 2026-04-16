import { createResendAdapter } from "@resend/chat-sdk-adapter";
import type { ResendAdapterConfig } from "@resend/chat-sdk-adapter";

/**
 * Minimal chat-delivery helper for sending outbound messages through Resend Chat.
 */
export interface ResendChatDelivery {
	/** Sends a Markdown-formatted message to a recipient and returns the message id. */
	readonly sendMessage: (input: {
		readonly recipient: string;
		readonly subject: string;
		readonly text: string;
	}) => Promise<{
		readonly id: string;
	}>;
}

/**
 * Creates a Resend Chat helper for outbound notification delivery.
 *
 * @param config - Resend Chat SDK adapter configuration.
 * @returns A helper that opens DM threads and posts notification messages.
 */
export const makeResendChatDelivery = (
	config: ResendAdapterConfig
): ResendChatDelivery => {
	const adapter = createResendAdapter(config);
	return {
		sendMessage: async ({ recipient, subject, text }) => {
			const threadId = await adapter.openDM(recipient);
			const sent = await adapter.postMessage(threadId, {
				markdown: `# ${subject}\n\n${text}`,
			});
			return { id: sent.id };
		},
	};
};

import type { NotificationAdapterContract } from "@dsar/backend";

/**
 * Runtime configuration for the Resend-backed outbound adapter.
 */
export interface OutboundResendAdapterConfig {
	/** Provider API key used to authorize outbound transactional email sends. */
	readonly apiKey: string;
	/** Sender identity shown to data-subject recipients. */
	readonly from: string;
	/** Optional reply mailbox for recipient follow-up workflows. */
	readonly replyTo?: string;
	/** Per-send timeout budget to avoid hanging lifecycle notifications. */
	readonly timeoutMs?: number;
	/** Optional brand/program prefix prepended to generated subjects. */
	readonly subjectPrefix?: string;
}

/**
 * Error categories used to normalize provider-specific failures.
 */
export type OutboundResendErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Structured error envelope emitted for outbound-resend adapter invocation failures.
 */
export interface OutboundResendAdapterInvocationError {
	/** Stable discriminator used to identify this tagged union member. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced the invocation failure. */
	readonly adapterKey: "outbound-resend";
	/** Adapter capability handled by this contract entry. */
	readonly capability: "notifications";
	/** Normalized category used by retry and incident routing logic. */
	readonly category: OutboundResendErrorCategory;
	/** Whether automatic retry should be attempted for this failure. */
	readonly retriable: boolean;
	/** Human-readable failure summary for delivery logs/audits. */
	readonly message: string;
	/** Optional raw provider error context retained for diagnostics. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Template rendering context passed to email subject/body generators.
 */
export interface OutboundResendSendContext {
	/** Final resolved recipient mailbox for this notification. */
	readonly recipient: string;
	/** DSAR request identifier this message references. */
	readonly requestId: string;
	/** Domain event driving message template selection. */
	readonly eventType: string;
	/** Locale used to render recipient-facing copy. */
	readonly locale: string;
	/** Policy version in effect when this event was emitted. */
	readonly policyVersion: string;
	/** Correlation id for tracing across lifecycle and delivery systems. */
	readonly correlationId: string;
	/** Idempotency key used to prevent duplicate sends. */
	readonly idempotencyKey: string;
	/** Event payload containing customer/compliance context for templates. */
	readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Renderer contract that converts a notification context into email content.
 */
export type OutboundResendTemplateRenderer = (
	input: OutboundResendSendContext
) => {
	readonly subject: string;
	readonly text: string;
};

/**
 * Injectable dependencies used by the adapter for outbound email delivery.
 */
export interface OutboundResendAdapterDependencies {
	/** Optional Chat SDK-backed delivery path for hosts that want thread-aware
	 *  email handling while keeping the DSAR adapter contract stable. */
	readonly sendChatMessage?: (input: {
		readonly recipient: string;
		readonly subject: string;
		readonly text: string;
		readonly correlationId: string;
		readonly eventId: string;
		readonly eventType: string;
		readonly idempotencyKey: string;
		readonly policyVersion: string;
		readonly requestId: string;
	}) => Promise<{
		readonly id: string;
	}>;
	/** Dispatches a transactional email via the Resend provider. Resolves
	 *  with `{ data: { id } }` on success or `{ error }` on provider failure. */
	readonly sendEmail: (input: {
		readonly body: {
			/** Sender identity visible to recipients. */
			readonly from: string;
			/** Recipient list for this provider call. */
			readonly to: string[];
			/** Subject line presented in recipient inbox. */
			readonly subject: string;
			/** Plain-text message body with DSAR context. */
			readonly text: string;
			/** Optional reply mailbox for recipient response handling. */
			readonly replyTo?: string;
			/** Diagnostic headers used for request/event traceability. */
			readonly headers: Readonly<Record<string, string>>;
			/** Provider tags used for analytics and filtering. */
			readonly tags: {
				readonly name: string;
				readonly value: string;
			}[];
		};
		readonly options: {
			/** Idempotency token used to dedupe provider-side send attempts. */
			readonly idempotencyKey: string;
		};
	}) => Promise<{
		readonly data: { readonly id: string } | null;
		readonly error: {
			readonly name?: string;
			readonly message?: string;
			readonly statusCode?: number | null;
		} | null;
		readonly headers?: Readonly<Record<string, string>> | null;
	}>;
}

/**
 * Public outbound-resend adapter contract alias.
 */
export type OutboundResendAdapterContract = NotificationAdapterContract;

export type {
	NotificationAdapterContract,
	NotificationDispatchInput,
	NotificationDispatchResult,
} from "@dsar/backend";

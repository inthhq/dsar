import type { ResendParsedMessageSnapshot } from "./chat";

/**
 * Tenant routing target derived from inbound recipient matching.
 */
export interface ResendInboundRoute {
	/** Tenant that should own and process this inbound message. */
	readonly tenantId: string;
	/** Jurisdiction used for policy selection during intake. */
	readonly jurisdiction: string;
	/** Optional workspace override for tenant-internal routing. */
	readonly workspaceId?: string;
}

/**
 * Configuration for the inbound Resend adapter webhook verification and routing.
 */
export interface ResendInboundAdapterConfig {
	/** Optional API key for fetching expanded email content. */
	readonly apiKey?: string;
	/** Default sender address for fallback Chat SDK parsing. */
	readonly defaultFromAddress?: string;
	/** Default sender display name for fallback Chat SDK parsing. */
	readonly defaultFromName?: string;
	/** Shared secret used to verify webhook authenticity. */
	readonly webhookSecret: string;
	/** Recipient-to-route mapping for deterministic tenant routing. */
	readonly routeMap?: Readonly<Record<string, ResendInboundRoute>>;
	/** Fallback route when no explicit recipient mapping matches. */
	readonly defaultRoute?: ResendInboundRoute;
	/** Enables secondary fetch for full email body/headers. */
	readonly fetchEmailContent?: boolean;
	/** Maximum retry attempts for provider/network operations. */
	readonly retryMaxAttempts?: number;
	/** Timeout budget for provider API calls. */
	readonly timeoutMs?: number;
}

/**
 * Canonical subset of headers used by Resend webhook verification.
 */
export interface ResendWebhookHeaders {
	/** Provider webhook event id header used for signature verification. */
	readonly id?: string;
	/** Provider webhook timestamp header used for replay protection. */
	readonly timestamp?: string;
	/** Provider signature header proving payload integrity/authenticity. */
	readonly signature?: string;
}

/**
 * Normalized webhook envelope containing the raw body and extracted verification headers.
 */
export interface ResendWebhookEnvelope {
	/** Raw webhook payload body used for signature verification. */
	readonly rawBody: string;
	/** Extracted verification headers from inbound webhook request. */
	readonly headers: ResendWebhookHeaders;
}

/**
 * Attachment metadata included in received-email webhook payloads.
 */
export interface ResendReceivedAttachment {
	/** Stable identifier for this record. */
	readonly id: string;
	/** Attachment filename for operator visibility/download UX. */
	readonly filename: string;
	/** MIME type used by downstream artifact handling. */
	readonly content_type: string;
	/** Optional content disposition metadata from provider. */
	readonly content_disposition?: string;
	/** Optional content-id for inline email references. */
	readonly content_id?: string;
}

/**
 * Resend inbound event payload shape used by parser/normalization logic.
 */
export interface ResendReceivedEvent {
	/** Provider or domain type discriminator for this payload. */
	readonly type: string;
	/** Provider timestamp for when the webhook event was created. */
	readonly created_at?: string;
	/** Raw provider event body delivered by the webhook. */
	readonly data?: {
		readonly email_id?: string;
		readonly created_at?: string;
		readonly from?: string;
		readonly to?: readonly string[];
		readonly cc?: readonly string[];
		readonly bcc?: readonly string[];
		readonly message_id?: string;
		readonly subject?: string;
		readonly attachments?: readonly ResendReceivedAttachment[];
	};
}

/**
 * Optional expanded email content fetched after webhook receipt.
 */
export interface ResendInboundContent {
	/** Optional HTML body captured from provider API. */
	readonly html?: string;
	/** Optional text body used for intent classification/fallback. */
	readonly text?: string;
	/** Optional raw headers for traceability or compliance diagnostics. */
	readonly headers?: Readonly<Record<string, unknown>>;
}

/**
 * DSAR intent signal derived from subject/body token matching.
 */
export interface ResendInboundIntent {
	/** Whether message content appears to represent a DSAR request. */
	readonly isDsar: boolean;
	/** Human-readable reason describing the intent classification outcome. */
	readonly reason: string;
}

/**
 * Normalized payload emitted by the inbound adapter contract for lifecycle intake.
 */
export interface ResendNormalizedInboundPayload {
	/** Inbound provider identifier for normalized multi-provider pipelines. */
	readonly provider: "resend";
	/** Canonical event type emitted by this adapter. */
	readonly eventType: "email.received";
	/** Stable provider email identifier used as intake source id. */
	readonly emailId: string;
	/** Optional provider message id for cross-system correlation. */
	readonly messageId?: string;
	/** Raw sender string from inbound payload. */
	readonly from: string;
	/** Parsed sender email when available. */
	readonly fromEmail?: string;
	/** Primary recipients used for route-map matching. */
	readonly to: readonly string[];
	/** CC recipients preserved for context/compliance review. */
	readonly cc: readonly string[];
	/** BCC recipients preserved when provided by provider payload. */
	readonly bcc: readonly string[];
	/** Email subject used for intent and case triage. */
	readonly subject: string;
	/** Attachment metadata for downstream evidence/artifact workflows. */
	readonly attachments: readonly ResendReceivedAttachment[];
	/** Resolved tenant/workspace route for processing ownership. */
	readonly route: ResendInboundRoute;
	/** Recipient address that matched route resolution. */
	readonly matchedRecipient: string;
	/** Intent classification outcome for DSAR intake handling. */
	readonly intent: ResendInboundIntent;
	/** Optional expanded content fetched via provider API. */
	readonly content?: ResendInboundContent;
	/** Optional Chat SDK-derived snapshot for future multi-source/thread-aware flows. */
	readonly chat?: ResendParsedMessageSnapshot;
}

/**
 * Error categories used to normalize webhook verification and provider failures.
 */
export type ResendErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Structured error payload produced for inbound adapter invocation failures.
 */
export interface ResendAdapterInvocationError {
	/** Stable discriminator used to identify this tagged union member. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced the invocation failure. */
	readonly adapterKey: "resend";
	/** Adapter capability handled by this contract entry. */
	readonly capability: "inbound";
	/** Normalized category used by retry and operations handling. */
	readonly category: ResendErrorCategory;
	/** Whether this failure should be retried automatically. */
	readonly retriable: boolean;
	/** Human-readable error summary for logs and audits. */
	readonly message: string;
	/** Optional raw provider/transport details for diagnostics. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Optional dependency overrides for time, signature verification, and content fetch.
 */
export interface ResendInboundAdapterDependencies {
	/** Clock source override for deterministic tests and replay tooling. */
	readonly now?: () => string;
	/**
	 * Validates the incoming webhook signature and returns the verified event
	 * payload. Failures must be signaled by throwing; the caller catches thrown
	 * errors and maps them to adapter-level failures. The returned value (sync
	 * or `Promise`) is forwarded to event parsing, so implementations should
	 * return the provider's verified event object.
	 */
	readonly verifyWebhook?: (input: {
		/** Raw request body used for signature computation. */
		readonly payload: string;
		readonly headers: {
			/** Provider event id used in verification calculation. */
			readonly id: string;
			/** Provider timestamp used in replay-window validation. */
			readonly timestamp: string;
			/** Provider HMAC signature to verify against the computed digest. */
			readonly signature: string;
		};
		/** Shared webhook secret used to compute the expected signature. */
		readonly webhookSecret: string;
	}) => unknown;
	/** Optional provider content fetch override for integration tests/custom clients. */
	readonly getEmailContent?: (
		emailId: string
	) => Promise<ResendInboundContent | undefined>;
	/** Optional Chat SDK-backed parser that derives thread and author metadata. */
	readonly parseChatMessage?: (input: {
		readonly attachments?: {
			readonly contentType: string;
			readonly filename: string;
			readonly url?: string;
		}[];
		readonly createdAt: string;
		readonly from: string;
		readonly headers?: Readonly<Record<string, unknown>>;
		readonly html?: string;
		readonly id: string;
		readonly messageId: string;
		readonly subject: string;
		readonly text?: string;
		readonly to: string[];
		readonly cc?: string[];
	}) => ResendParsedMessageSnapshot;
}

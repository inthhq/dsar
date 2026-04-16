import type { SlackParsedMessageSnapshot } from "./chat";

/**
 * Tenant/workspace route resolved for a Slack inbound event.
 */
export interface SlackInboundRoute {
	/** Tenant that owns the inbound request. */
	readonly tenantId: string;
	/** Jurisdiction used for policy selection. */
	readonly jurisdiction: string;
	/** Optional tenant-internal workspace routing target. */
	readonly workspaceId?: string;
}

/**
 * Team-level routing configuration with optional Slack surface overrides.
 */
export interface SlackTeamRouteConfig extends SlackInboundRoute {
	/** Optional per-channel routing overrides keyed by channel id. */
	readonly channels?: Readonly<Record<string, SlackInboundRoute>>;
	/** Optional slash-command routing overrides keyed by command name. */
	readonly commands?: Readonly<Record<string, SlackInboundRoute>>;
	/** Optional interactive callback routing overrides keyed by callback id. */
	readonly callbacks?: Readonly<Record<string, SlackInboundRoute>>;
}

/**
 * Configuration for the Slack inbound adapter.
 */
export interface SlackInboundAdapterConfig {
	/** Optional bot token used for profile lookup and Chat SDK parsing. */
	readonly botToken?: string;
	/** Optional dedupe window used by the Chat SDK Slack adapter. */
	readonly dedupeTtlMs?: number;
	/** Optional fallback route when no team/channel/command match is found. */
	readonly defaultRoute?: SlackInboundRoute;
	/** Maximum age for signed requests before they are rejected. */
	readonly replayToleranceSeconds?: number;
	/** Slack signing secret used to verify webhook authenticity. */
	readonly signingSecret: string;
	/** Team-native route configuration keyed by Slack team id. */
	readonly teamRoutes?: Readonly<Record<string, SlackTeamRouteConfig>>;
	/** Optional Chat SDK bot username used during parsing. */
	readonly userName?: string;
}

/**
 * Canonical Slack webhook headers extracted from the inbound request.
 */
export interface SlackWebhookHeaders {
	/** Request `content-type` header. */
	readonly contentType?: string;
	/** Slack signature header proving payload authenticity. */
	readonly signature?: string;
	/** Slack timestamp header used for replay protection. */
	readonly timestamp?: string;
}

/**
 * Normalized Slack webhook envelope.
 */
export interface SlackWebhookEnvelope {
	/** Extracted webhook headers. */
	readonly headers: SlackWebhookHeaders;
	/** Raw request body used for verification and parsing. */
	readonly rawBody: string;
}

/**
 * Minimal Slack user profile information used for requestor resolution.
 */
export interface SlackUserProfile {
	/** User email when Slack exposes it. */
	readonly email?: string;
	/** Display name or real name for the Slack user. */
	readonly name?: string;
}

/**
 * DSAR intent classification derived from a Slack inbound event.
 */
export interface SlackInboundIntent {
	/** Whether the event appears to represent a DSAR request. */
	readonly isDsar: boolean;
	/** Human-readable reason describing the classification. */
	readonly reason: string;
}

/**
 * Slack interaction surface that produced the inbound event.
 */
export type SlackInboundSurface =
	| "app_mention"
	| "block_actions"
	| "direct_message"
	| "message"
	| "shortcut"
	| "slash_command"
	| "view_submission";

/**
 * Normalized requestor details extracted from Slack context.
 */
export interface SlackRequestor {
	/** Stable Slack user id or fallback placeholder id. */
	readonly id: string;
	/** Resolved Slack email when available. */
	readonly email?: string;
	/** Display name resolved from Slack profile data. */
	readonly name?: string;
}

/**
 * Canonical payload emitted when a Slack event becomes a request capture.
 */
export interface SlackNormalizedInboundPayload {
	/** Stable payload discriminator for inbound capture events. */
	readonly kind: "request_capture";
	/** Provider identifier for the emitting adapter. */
	readonly provider: "slack";
	/** Slack event type such as `app_mention` or `view_submission`. */
	readonly eventType: string;
	/** Slack interaction surface that produced this payload. */
	readonly surface: SlackInboundSurface;
	/** Tenant/workspace route selected for this event. */
	readonly route: SlackInboundRoute;
	/** DSAR intent classification result. */
	readonly intent: SlackInboundIntent;
	/** Normalized intake source channel label for lifecycle capture. */
	readonly intakeSourceChannel: string;
	/** Stable provider-specific raw context reference. */
	readonly rawContextRef: string;
	/** Normalized requestor information for the inbound event. */
	readonly requestor: SlackRequestor;
	/** Slack team id associated with the event. */
	readonly teamId: string;
	/** Slack channel id when the surface is channel-scoped. */
	readonly channelId?: string;
	/** Slack channel name when provided by the payload. */
	readonly channelName?: string;
	/** Slack thread id when the event belongs to a thread. */
	readonly threadId?: string;
	/** Slack response URL when the surface supports deferred responses. */
	readonly responseUrl?: string;
	/** Slash command name when the payload originated from a command. */
	readonly command?: string;
	/** Interactive callback id when the payload originated from a callback-driven surface. */
	readonly callbackId?: string;
	/** Human-readable text extracted from the Slack payload. */
	readonly text: string;
	/** Optional serialized Chat SDK message snapshot for conversational events. */
	readonly chat?: SlackParsedMessageSnapshot;
}

/**
 * Payload emitted for Slack URL verification challenges.
 */
export interface SlackUrlVerificationPayload {
	/** Stable payload discriminator for Slack URL verification. */
	readonly kind: "url_verification";
	/** Provider identifier for the emitting adapter. */
	readonly provider: "slack";
	/** Raw Slack challenge string that must be echoed back. */
	readonly challenge: string;
}

/**
 * Union of payloads the Slack inbound adapter can emit.
 */
export type SlackAdapterInvocationPayload =
	| SlackNormalizedInboundPayload
	| SlackUrlVerificationPayload;

/**
 * Error categories used to normalize Slack adapter failures.
 */
export type SlackErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

/**
 * Structured error payload produced for Slack adapter invocation failures.
 */
export interface SlackAdapterInvocationError {
	/** Stable discriminator for adapter invocation errors. */
	readonly _tag: "AdapterInvocationError";
	/** Adapter key that produced the error. */
	readonly adapterKey: "slack";
	/** Adapter capability handled by this contract. */
	readonly capability: "inbound";
	/** Normalized error category used for retry and diagnostics decisions. */
	readonly category: SlackErrorCategory;
	/** Whether the failure should be retried automatically. */
	readonly retriable: boolean;
	/** Human-readable error summary. */
	readonly message: string;
	/** Optional raw details preserved for diagnostics. */
	readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Optional dependency overrides used by the Slack inbound adapter.
 */
export interface SlackInboundAdapterDependencies {
	/** Optional clock override for deterministic tests and replay handling. */
	readonly now?: () => string;
	/** Optional signature verifier override for tests or custom auth flows. */
	readonly verifySignature?: (input: {
		readonly payload: string;
		readonly headers: {
			readonly signature: string;
			readonly timestamp: string;
		};
		readonly replayToleranceSeconds: number;
		readonly signingSecret: string;
	}) => void;
	/** Optional Slack profile lookup override used for requestor resolution. */
	readonly getUserProfile?: (
		input: Readonly<{
			readonly userId: string;
		}>
	) => Promise<SlackUserProfile | undefined>;
	/** Optional Chat SDK message parser override for conversational events. */
	readonly parseChatMessage?: (input: {
		readonly rawEvent: unknown;
	}) => SlackParsedMessageSnapshot;
}

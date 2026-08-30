import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

import type { DsarResult, RequestOptions } from "../types";
import type {
	EndpointContext,
	WebhookInboundResendPayload,
	WebhookInboundResendResponse,
	WebhookInboundSlackPayload,
	WebhookInboundSlackResponse,
	WebhookRotateKeyPayload,
	WebhookRotateKeyResponse,
} from "./types";

const HEX_SHA256_SIGNATURE_PATTERN = /^[\da-f]{64}$/i;
const EMPTY_SHA256_SIGNATURE = Buffer.alloc(32);

/**
 * Active webhook signing secret plus optional key metadata.
 */
export interface WebhookVerificationSecret {
	/** Optional key id associated with this secret. */
	readonly id?: string;
	/** HMAC secret used to verify the signature. */
	readonly secret: string;
}

/**
 * Secrets returned directly or by a webhook signing-secret lookup function.
 */
export type WebhookSecretLookupResult =
	| readonly string[]
	| readonly WebhookVerificationSecret[];

/**
 * Resolves active webhook signing secrets for an endpoint and optional key id.
 */
export type WebhookSecretLookup = (input: {
	readonly endpointId?: string;
	readonly keyId?: string;
}) => Promise<WebhookSecretLookupResult> | WebhookSecretLookupResult;

/** Delivery states recorded for outbound webhook attempts. */
export type WebhookDispatchStatus =
	| "pending"
	| "delivered"
	| "failed"
	| "skipped";

/** Query filters accepted by outbound webhook dispatch listing. */
export interface WebhookDispatchListQuery {
	readonly [key: string]: string | number | boolean | undefined;
	/** Include attempts created strictly after this ISO timestamp. */
	readonly created_after?: string;
	/** Include attempts created strictly before this ISO timestamp. */
	readonly created_before?: string;
	/** Filter attempts to the configured webhook endpoint id. */
	readonly endpoint_id?: string;
	/** Maximum attempts to return, from 1 to 500. */
	readonly limit?: number;
	/** Zero-based result offset. */
	readonly offset?: number;
	/** Comma-separated delivery statuses. */
	readonly status?: string;
}

/** Persisted outbound webhook delivery attempt returned by the API. */
export interface WebhookDispatch {
	/** One-based attempt number for the notification event. */
	readonly attempt: number;
	/** ISO timestamp when the attempt was recorded. */
	readonly createdAt: string;
	/** Destination URL used by the attempt. */
	readonly destination: string;
	/** Stable delivery-attempt identifier. */
	readonly dispatchId: string;
	/** Configured endpoint id when the destination matches one. */
	readonly endpointId?: string;
	/** Delivery failure or skip reason when available. */
	readonly error?: string;
	/** Notification event associated with the attempt. */
	readonly eventId: string;
	/** Notification event type when its persisted event is available. */
	readonly eventType?: string;
	/** Whether this attempt is eligible for replay. */
	readonly replayable: boolean;
	/** DSAR request associated with the notification event. */
	readonly requestId: string;
	/** Provider response code when available. */
	readonly responseCode?: number;
	/** Recorded delivery state. */
	readonly status: WebhookDispatchStatus;
}

/** Paginated response returned by outbound webhook dispatch listing. */
export interface WebhookDispatchListResponse {
	/** Dispatch attempts in reverse chronological order. */
	readonly items: readonly WebhookDispatch[];
	/** Bounded page size used by the server. */
	readonly limit: number;
	/** Zero-based offset used by the server. */
	readonly offset: number;
	/** Number of attempts matching the filters before pagination. */
	readonly total: number;
}

/** Optional filters accepted by bulk webhook replay. */
export interface WebhookDispatchBulkReplayPayload {
	/** Replay attempts created strictly after this ISO timestamp. */
	readonly created_after?: string;
	/** Replay attempts created strictly before this ISO timestamp. */
	readonly created_before?: string;
	/** Replay attempts for this configured endpoint id. */
	readonly endpoint_id?: string;
	/** Maximum dispatches to replay, from 1 to 100. */
	readonly limit?: number;
	/** Must be `failed` when present. */
	readonly status?: "failed";
}

/** Result returned for one outbound webhook replay request. */
export interface WebhookDispatchReplayResponse {
	/** Dispatch attempt that was selected for replay. */
	readonly dispatchId: string;
	/** Delivery failure or skip reason when replay did not deliver. */
	readonly error?: string;
	/** Notification event associated with the dispatch. */
	readonly eventId: string;
	/** Replay outcome, including deduplicated and failed attempts. */
	readonly status: "replayed" | "already_replayed" | "failed";
}

/** Result returned by bulk outbound webhook replay. */
export interface WebhookDispatchBulkReplayResponse {
	/** Dispatches skipped because the replay key was already accepted. */
	readonly alreadyReplayed: number;
	/** Dispatches delivered successfully by this request. */
	readonly replayed: number;
	/** Per-dispatch replay outcomes. */
	readonly results: readonly WebhookDispatchReplayResponse[];
	/** Dispatches selected by the request filters. */
	readonly total: number;
}

/** Per-request options for webhook replay mutations. */
export interface WebhookReplayRequestOptions extends RequestOptions {
	/** Required deduplication key for safe replay retries. */
	readonly idempotencyKey: string;
}

/**
 * Input used to verify a DSAR outbound webhook signature.
 */
export interface VerifyWebhookInput {
	/** Raw request body exactly as signed by DSAR. */
	readonly body: string | Uint8Array;
	/** Hex-encoded HMAC-SHA256 signature from `x-dsar-signature`. */
	readonly signature: string;
	/** Optional endpoint id used by lookup functions. */
	readonly endpointId?: string;
	/** Optional key id from `x-dsar-signature-key-id`. */
	readonly keyId?: string;
	/** Active secrets or key/secret pairs to try. */
	readonly secrets?: WebhookSecretLookupResult;
	/** Lazy resolver for active secrets or key/secret pairs. */
	readonly lookupSecrets?: WebhookSecretLookup;
}

/**
 * Result returned after verifying a DSAR outbound webhook signature.
 */
export interface VerifyWebhookResult {
	/** Whether any supplied secret matched the signature. */
	readonly verified: boolean;
	/** Matched key id when available from the input or secret metadata. */
	readonly keyId?: string;
}

const toArrayBuffer = (body: string | Uint8Array): ArrayBuffer => {
	const bytes =
		typeof body === "string" ? new TextEncoder().encode(body) : body;
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
};

const normalizeSecrets = (
	secrets: WebhookSecretLookupResult
): readonly WebhookVerificationSecret[] =>
	secrets.map((entry) =>
		typeof entry === "string" ? { secret: entry } : entry
	);

const toHex = (bytes: ArrayBuffer): string =>
	[...new Uint8Array(bytes)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const signBody = async (
	body: string | Uint8Array,
	secret: string
): Promise<string> => {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, toArrayBuffer(body));
	return toHex(signature);
};

const constantTimeEqual = (
	expectedHex: string,
	suppliedHex: string
): boolean => {
	const expected = Buffer.from(expectedHex, "hex");
	const hasValidShape = HEX_SHA256_SIGNATURE_PATTERN.test(suppliedHex);
	const supplied = hasValidShape
		? Buffer.from(suppliedHex, "hex")
		: EMPTY_SHA256_SIGNATURE;
	const matched = timingSafeEqual(expected, supplied);
	return hasValidShape && matched;
};

/**
 * Verifies a DSAR outbound webhook HMAC signature against active secrets.
 *
 * @param input - Body, signature, optional key metadata, and either a direct
 *   secret list or a lookup function.
 * @returns Verification result with matched key id when available.
 */
export const verifyWebhook = async (
	input: VerifyWebhookInput
): Promise<VerifyWebhookResult> => {
	const suppliedSecrets =
		input.secrets ??
		(await input.lookupSecrets?.({
			endpointId: input.endpointId,
			keyId: input.keyId,
		})) ??
		[];
	for (const entry of normalizeSecrets(suppliedSecrets)) {
		const expected = await signBody(input.body, entry.secret);
		if (constantTimeEqual(expected, input.signature)) {
			return {
				keyId: entry.id ?? input.keyId,
				verified: true,
			};
		}
	}
	return { verified: false };
};

/**
 * Client interface for the Webhooks API namespace.
 */
export interface WebhooksApi {
	/** Lists persisted outbound webhook delivery attempts. */
	readonly listDispatches: (
		query?: WebhookDispatchListQuery,
		options?: RequestOptions
	) => Promise<DsarResult<WebhookDispatchListResponse>>;
	/** Replays one failed outbound webhook delivery attempt. */
	readonly replayDispatch: (
		dispatchId: string,
		options: WebhookReplayRequestOptions
	) => Promise<DsarResult<WebhookDispatchReplayResponse>>;
	/** Replays a filtered batch of failed outbound webhook delivery attempts. */
	readonly replayDispatches: (
		payload: WebhookDispatchBulkReplayPayload,
		options: WebhookReplayRequestOptions
	) => Promise<DsarResult<WebhookDispatchBulkReplayResponse>>;
	/**
	 * Replays a Resend inbound webhook payload into the DSAR ingestion
	 * pipeline. The call is synchronous — the server processes the event
	 * inline and returns the outcome immediately.
	 *
	 * @param payload - The raw {@link WebhookInboundResendPayload}
	 *   containing the provider event type, timestamp, and body.
	 * @param options - Optional per-request overrides such as idempotency key
	 *   and additional headers.
	 * @returns A {@link DsarResult} whose `data` is a
	 *   {@link WebhookInboundResendResponse} with `status` indicating
	 *   `"captured"` (DSAR created) or `"ignored_non_dsar"` (event was
	 *   not a DSAR request). Side effects: when captured, a new request
	 *   record and audit trail are persisted server-side.
	 */
	readonly inboundResend: (
		payload: WebhookInboundResendPayload,
		options?: RequestOptions
	) => Promise<DsarResult<WebhookInboundResendResponse>>;
	/**
	 * Replays a Slack inbound webhook payload into the DSAR ingestion pipeline.
	 *
	 * Slack may first perform a URL verification challenge; in that case the
	 * response payload contains `{ challenge }` instead of a normal DSAR intake
	 * result.
	 */
	readonly inboundSlack: (
		payload: WebhookInboundSlackPayload,
		options?: RequestOptions
	) => Promise<DsarResult<WebhookInboundSlackResponse>>;
	/**
	 * Rotates an outbound webhook endpoint signing key.
	 */
	readonly rotateKey: (
		endpointId: string,
		payload?: WebhookRotateKeyPayload,
		options?: RequestOptions
	) => Promise<DsarResult<WebhookRotateKeyResponse>>;
}

/**
 * Creates the {@link WebhooksApi} client bound to the given endpoint
 * context.
 *
 * @param ctx - Shared HTTP transport and configuration for SDK calls.
 * @returns A {@link WebhooksApi} instance whose methods issue HTTP requests
 *   through `ctx.call`.
 */
export const makeWebhooksApi = (ctx: EndpointContext): WebhooksApi => ({
	inboundResend: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/webhooks/inbound/resend",
		}),
	inboundSlack: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/webhooks/inbound/slack",
		}),
	listDispatches: (query, options) =>
		ctx.call({
			method: "GET",
			options,
			path: "/webhooks/dispatches",
			query,
		}),
	replayDispatch: (dispatchId, options) =>
		ctx.call({
			method: "POST",
			options,
			path: `/webhooks/dispatches/${encodeURIComponent(dispatchId)}/replay`,
		}),
	replayDispatches: (payload, options) =>
		ctx.call({
			body: payload,
			method: "POST",
			options,
			path: "/webhooks/dispatches/replay",
		}),
	rotateKey: (endpointId, payload, options) =>
		ctx.call({
			body: payload ?? {},
			method: "POST",
			options,
			path: `/webhooks/endpoints/${encodeURIComponent(endpointId)}/rotate-key`,
		}),
});

import type { DsarResult, RequestOptions } from "../types";
import type {
	EndpointContext,
	WebhookInboundResendPayload,
	WebhookInboundResendResponse,
	WebhookInboundSlackPayload,
	WebhookInboundSlackResponse,
} from "./types";

/**
 * Client interface for the Webhooks API namespace.
 */
export interface WebhooksApi {
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
});

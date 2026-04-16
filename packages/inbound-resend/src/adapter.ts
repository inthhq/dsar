/* oxlint-disable complexity */
/* oxlint-disable max-statements */
import type { InboundAdapterContract } from "@dsar/backend";
import type { ResendRawMessage } from "@resend/chat-sdk-adapter";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { Resend } from "resend";

import { makeResendMessageParser, toResendParsedMessageSnapshot } from "./chat";
import {
	defaultResendInboundConfig,
	parseResendInboundAdapterConfig,
} from "./config";
import { defaultContentFetcher } from "./content";
import { normalizeResendError } from "./errors";
import {
	parseEnvelope,
	parseFromEmail,
	parseIntent,
	parseReceivedEvent,
	resolveRoute,
} from "./parse";
import type {
	ResendInboundAdapterConfig,
	ResendInboundAdapterDependencies,
} from "./types";

/**
 * Public inbound adapter contract alias for Resend integration.
 */
export type ResendInboundAdapterContract = InboundAdapterContract;

const toStringHeaders = (
	headers?: Readonly<Record<string, unknown>>
): Record<string, string> | undefined =>
	headers
		? Object.fromEntries(
				Object.entries(headers).map(([key, value]) => [key, String(value)])
			)
		: undefined;

const toResendRawMessage = (
	input: Parameters<
		NonNullable<ResendInboundAdapterDependencies["parseChatMessage"]>
	>[0]
): ResendRawMessage => ({
	...input,
	headers: toStringHeaders(input.headers),
});

/**
 * Creates a Resend inbound adapter that verifies webhook signatures and
 * normalizes intake payloads.
 *
 * @param config - Adapter configuration for webhook verification,
 *   routing, and optional content-fetch behaviour.
 * @param dependencies - Optional dependency overrides for clock,
 *   webhook verification, and content retrieval.
 * @returns An {@link InboundAdapterContract} implementation backed by
 *   the Resend API.
 */
export const makeResendInboundAdapter = (
	config: ResendInboundAdapterConfig,
	dependencies: ResendInboundAdapterDependencies = {}
): ResendInboundAdapterContract => {
	const resolved = defaultResendInboundConfig(config);
	const client = new Resend(resolved.apiKey ?? "re_placeholder");
	const now = dependencies.now ?? (() => new Date().toISOString());
	const messageParser = dependencies.parseChatMessage
		? {
				parse: dependencies.parseChatMessage,
			}
		: (() => {
				const parser = makeResendMessageParser({
					apiKey: resolved.apiKey,
					fromAddress: resolved.defaultFromAddress ?? "no-reply@example.com",
					fromName: resolved.defaultFromName ?? "DSAR",
					webhookSecret: resolved.webhookSecret,
				});
				return {
					parse: (
						input: Parameters<
							NonNullable<ResendInboundAdapterDependencies["parseChatMessage"]>
						>[0]
					) => toResendParsedMessageSnapshot(parser, toResendRawMessage(input)),
				};
			})();
	const verifyWebhook =
		dependencies.verifyWebhook ??
		((input: {
			readonly payload: string;
			readonly headers: {
				readonly id: string;
				readonly timestamp: string;
				readonly signature: string;
			};
			readonly webhookSecret: string;
		}) =>
			client.webhooks.verify({
				headers: input.headers,
				payload: input.payload,
				webhookSecret: input.webhookSecret,
			}));
	const getEmailContent =
		dependencies.getEmailContent ??
		((emailId: string) => defaultContentFetcher({ client, emailId }));

	return {
		capability: "inbound",
		diagnostics: () =>
			Effect.succeed({
				capability: "inbound",
				details: {
					fetchEmailContent: resolved.fetchEmailContent,
					routeMapSize: Object.keys(resolved.routeMap).length,
					timeoutMs: resolved.timeoutMs,
				},
				key: "resend",
				version: "0.0.0",
			}),
		healthCheck: () =>
			Effect.succeed({
				details: {
					configuredRoutes: Object.keys(resolved.routeMap).length,
				},
				ok: true,
				status: "healthy",
			}),
		init: (_config: Readonly<Record<string, unknown>>) => Effect.void,
		key: "resend",
		receive: (input: { readonly source: string; readonly payload: unknown }) =>
			Effect.tryPromise({
				catch: (error) => normalizeResendError(error),
				try: async () => {
					const envelope = parseEnvelope(input.payload);
					const { source } = input;
					const verified = verifyWebhook({
						headers: {
							id: envelope.headers.id ?? "",
							signature: envelope.headers.signature ?? "",
							timestamp: envelope.headers.timestamp ?? "",
						},
						payload: envelope.rawBody,
						webhookSecret: resolved.webhookSecret,
					});
					const verifiedEvent =
						verified instanceof Promise ? await verified : verified;
					const event = parseReceivedEvent(verifiedEvent);
					const data = event.data ?? {};
					const recipients = (data.to ?? []).map((entry) =>
						entry.toLowerCase()
					);
					const routeResult = resolveRoute(
						recipients,
						resolved.routeMap,
						resolved.defaultRoute
					);
					const emailId = data.email_id ?? data.message_id ?? `resend-${now()}`;
					const messageId = data.message_id;
					const subject = data.subject ?? "";
					const from = data.from ?? "";
					const fromEmail = parseFromEmail(from);
					const content =
						resolved.fetchEmailContent && resolved.apiKey && data.email_id
							? await getEmailContent(data.email_id)
							: undefined;
					const chat = messageParser.parse({
						attachments: [...(data.attachments ?? [])].map((attachment) => ({
							contentType: attachment.content_type,
							filename: attachment.filename,
							url: attachment.id
								? `resend:attachment:${attachment.id}`
								: undefined,
						})),
						cc: [...(data.cc ?? [])],
						createdAt: data.created_at ?? event.created_at ?? now(),
						from,
						headers: toStringHeaders(content?.headers),
						html: content?.html,
						id: emailId,
						messageId: messageId ?? emailId,
						subject,
						text: content?.text,
						to: [...(data.to ?? [])],
					});
					const intent = parseIntent({
						subject,
						text: content?.text,
					});

					return {
						payload: {
							attachments: data.attachments ?? [],
							bcc: data.bcc ?? [],
							cc: data.cc ?? [],
							chat,
							content,
							emailId,
							eventCreatedAt: event.created_at,
							eventType: "email.received",
							from,
							fromEmail,
							intent,
							matchedRecipient: routeResult.matchedRecipient,
							messageId,
							provider: "resend",
							route: routeResult.route,
							source,
							subject,
							to: data.to ?? [],
						},
						receivedAt: data.created_at ?? event.created_at ?? now(),
						sourceId: emailId,
					};
				},
			}),
		validateConfig: (input: Readonly<Record<string, unknown>>) =>
			Effect.suspend(() => {
				const parsed = parseResendInboundAdapterConfig(input);
				if (Exit.isFailure(parsed)) {
					return Effect.fail({
						category: "config",
						details: {
							parseError: Cause.pretty(parsed.cause),
						},
						message: "Invalid resend inbound adapter configuration.",
						retriable: false,
					});
				}
				return Effect.void;
			}),
	} satisfies InboundAdapterContract;
};

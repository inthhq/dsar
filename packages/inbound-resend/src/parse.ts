/* oxlint-disable complexity */
/* oxlint-disable max-statements */
import {
	asNonEmptyString,
	asNonEmptyStringArray,
	asRecord,
} from "@dsar/guards";

import { ResendInvocationError } from "./errors";
import type {
	ResendInboundIntent,
	ResendInboundRoute,
	ResendReceivedAttachment,
	ResendReceivedEvent,
	ResendWebhookEnvelope,
} from "./types";

const DSAR_INTENT_TOKENS = [
	"subject access request",
	"access my data",
	"my personal data",
	"copy of my data",
	"privacy request",
	"gdpr request",
	"ccpa request",
] as const;

const DSAR_WORD_BOUNDARY_TOKENS = ["sar"] as const;

const DSAR_WORD_BOUNDARY_MATCHERS = DSAR_WORD_BOUNDARY_TOKENS.map((token) => ({
	pattern: new RegExp(`\\b${token}\\b`, "u"),
	token,
}));

const asAttachment = (value: unknown): ResendReceivedAttachment | undefined => {
	const record = asRecord(value);
	if (!record) {
		return;
	}
	const id = asNonEmptyString(record.id);
	const filename = asNonEmptyString(record.filename);
	const contentType = asNonEmptyString(record.content_type);
	if (!id || !filename || !contentType) {
		return;
	}
	return {
		content_disposition: asNonEmptyString(record.content_disposition),
		content_id: asNonEmptyString(record.content_id),
		content_type: contentType,
		filename,
		id,
	};
};

const asAttachmentArray = (
	value: unknown
): readonly ResendReceivedAttachment[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value
		.map((entry) => asAttachment(entry))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
};

/**
 * Extracts a normalized email address from a `From` header value.
 *
 * @param from - Raw `From` header string.
 * @returns Lower-cased email address when one can be extracted.
 */
export const parseFromEmail = (from: string): string | undefined => {
	const match = from.match(/<([^>]+)>/u);
	if (match?.[1]) {
		const extracted = match[1].trim().toLowerCase();
		return extracted.includes("@") ? extracted : undefined;
	}
	const trimmed = from.trim().toLowerCase();
	return trimmed.includes("@") ? trimmed : undefined;
};

/**
 * Parses the transport envelope passed into the Resend inbound adapter.
 *
 * @param payload - Raw adapter input expected to contain `rawBody` and Svix headers.
 * @returns A normalized webhook envelope with body and signature headers.
 */
export const parseEnvelope = (payload: unknown): ResendWebhookEnvelope => {
	const envelope = asRecord(payload);
	if (!envelope) {
		throw new ResendInvocationError({
			category: "validation",
			message: "Inbound payload must be an object with rawBody and headers.",
		});
	}
	const rawBody = asNonEmptyString(envelope.rawBody);
	const headersObject = asRecord(envelope.headers);
	const id = headersObject ? asNonEmptyString(headersObject.id) : undefined;
	const timestamp = headersObject
		? asNonEmptyString(headersObject.timestamp)
		: undefined;
	const signature = headersObject
		? asNonEmptyString(headersObject.signature)
		: undefined;
	if (!rawBody || !id || !timestamp || !signature) {
		throw new ResendInvocationError({
			category: "validation",
			message:
				"Inbound payload requires rawBody and svix headers (id/timestamp/signature).",
		});
	}
	return {
		headers: { id, signature, timestamp },
		rawBody,
	};
};

/**
 * Parses the Resend webhook event payload into the supported received-email shape.
 *
 * @param value - Raw webhook event payload.
 * @returns A normalized `email.received` event.
 */
export const parseReceivedEvent = (value: unknown): ResendReceivedEvent => {
	const event = asRecord(value);
	if (!event) {
		throw new ResendInvocationError({
			category: "validation",
			message: "Webhook payload is not a valid event object.",
		});
	}
	const type = asNonEmptyString(event.type);
	if (type !== "email.received") {
		throw new ResendInvocationError({
			category: "validation",
			message: `Unsupported webhook event type: ${type ?? "unknown"}.`,
		});
	}
	const data = asRecord(event.data);
	return {
		created_at: asNonEmptyString(event.created_at),
		data: data
			? {
					attachments: asAttachmentArray(data.attachments),
					bcc: asNonEmptyStringArray(data.bcc),
					cc: asNonEmptyStringArray(data.cc),
					created_at: asNonEmptyString(data.created_at),
					email_id: asNonEmptyString(data.email_id),
					from: asNonEmptyString(data.from),
					message_id: asNonEmptyString(data.message_id),
					subject: asNonEmptyString(data.subject),
					to: asNonEmptyStringArray(data.to),
				}
			: undefined,
		type,
	};
};

/**
 * Resolves tenant routing for inbound recipients.
 *
 * @param recipients - Recipient email addresses extracted from the event.
 * @param routeMap - Configured inbound route map keyed by recipient.
 * @param defaultRoute - Fallback route when no recipient-specific match exists.
 * @returns The matched recipient and resolved inbound route.
 */
export const resolveRoute = (
	recipients: readonly string[],
	routeMap: Readonly<Record<string, ResendInboundRoute | undefined>>,
	defaultRoute?: ResendInboundRoute
): {
	readonly matchedRecipient: string;
	readonly route: ResendInboundRoute;
} => {
	for (const recipient of recipients) {
		const normalized = recipient.toLowerCase();
		const route = routeMap[normalized];
		if (route) {
			return { matchedRecipient: normalized, route };
		}
	}
	if (defaultRoute) {
		return {
			matchedRecipient: recipients[0] ?? "default",
			route: defaultRoute,
		};
	}
	throw new ResendInvocationError({
		category: "validation",
		details: { recipients },
		message: "No tenant/jurisdiction route found for inbound recipient.",
	});
};

/**
 * Classifies whether an inbound email looks like a DSAR request.
 *
 * @param input - Subject and optional body text used for intent detection.
 * @returns Normalized DSAR intent classification for the received email.
 */
export const parseIntent = (input: {
	readonly subject: string;
	readonly text?: string;
}): ResendInboundIntent => {
	const text = `${input.subject}\n${input.text ?? ""}`.toLowerCase();
	const match = DSAR_INTENT_TOKENS.find((token) => text.includes(token));
	if (match) {
		return { isDsar: true, reason: `Matched token: ${match}` };
	}
	for (const { pattern, token } of DSAR_WORD_BOUNDARY_MATCHERS) {
		if (pattern.test(text)) {
			return {
				isDsar: true,
				reason: `Matched word: ${token}`,
			};
		}
	}
	return {
		isDsar: false,
		reason: "No DSAR-intent token matched in subject/body.",
	};
};

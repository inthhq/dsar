/* oxlint-disable complexity */
/* oxlint-disable max-statements */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { asNonEmptyString, asRecord } from "@dsar/guards";

import { SlackInvocationError, toRecord } from "./errors";
import type { SlackInboundSurface, SlackWebhookEnvelope } from "./types";

/**
 * Normalized Slack event fields extracted from webhook payloads.
 */
export interface SlackEventBody {
	/** Stable event identifier used for idempotency and traceability. */
	readonly eventId: string;
	/** Slack event type or interaction type discriminator. */
	readonly eventType: string;
	/** Human-readable message or command text supplied by the user. */
	readonly text: string;
	/** Slack workspace/team that emitted the event. */
	readonly teamId: string;
	/** Channel identifier when the event is channel-scoped. */
	readonly channelId?: string;
	/** Channel name when Slack provided one in the payload. */
	readonly channelName?: string;
	/** User identifier associated with the interaction. */
	readonly userId?: string;
	/** Display name or username associated with the interaction. */
	readonly userName?: string;
	/** Thread timestamp when the event belongs to a thread. */
	readonly threadTs?: string;
	/** Response URL for interactive payload acknowledgements. */
	readonly responseUrl?: string;
	/** Callback identifier used by interactive components and shortcuts. */
	readonly callbackId?: string;
	/** Slash command name when the payload was command-based. */
	readonly command?: string;
	/** Raw Slack event payload retained for downstream enrichment. */
	readonly rawEvent?: Readonly<Record<string, unknown>>;
	/** Normalized inbound surface used by routing and intent detection. */
	readonly surface: SlackInboundSurface;
	/** Receipt timestamp used for audit and replay calculations. */
	readonly receivedAt: string;
}

interface SlackUrlVerification {
	readonly kind: "url_verification";
	readonly challenge: string;
}

/** Parsed Slack webhook payload, including URL verification handshakes. */
export type ParsedSlackInbound = SlackUrlVerification | SlackEventBody;

/**
 * Checks whether a parsed Slack payload is the URL-verification handshake variant.
 *
 * @param value - Parsed Slack payload returned from request parsing.
 * @returns Whether the payload is a URL-verification challenge.
 */
export const isSlackUrlVerification = (
	value: ParsedSlackInbound
): value is SlackUrlVerification => "kind" in value;

const toLowerContentType = (value: string | undefined): string =>
	value?.split(";")[0]?.trim().toLowerCase() ?? "";

const slackTsToIso = (value: string | undefined, fallback: string): string => {
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return new Date(parsed * 1000).toISOString();
};

/**
 * Parses the transport envelope passed into the Slack inbound adapter.
 *
 * @param payload - Raw adapter input expected to contain `rawBody` and headers.
 * @returns A normalized webhook envelope with raw body and signature headers.
 */
export const parseEnvelope = (payload: unknown): SlackWebhookEnvelope => {
	const envelope = asRecord(payload);
	if (!envelope) {
		throw new SlackInvocationError({
			category: "validation",
			message: "Inbound payload must be an object with rawBody and headers.",
		});
	}
	const rawBody = asNonEmptyString(envelope.rawBody);
	const headersObject = asRecord(envelope.headers);
	if (!rawBody || !headersObject) {
		throw new SlackInvocationError({
			category: "validation",
			message: "Inbound payload requires rawBody and request headers.",
		});
	}
	return {
		headers: {
			contentType: asNonEmptyString(headersObject.contentType),
			signature: asNonEmptyString(headersObject.signature),
			timestamp: asNonEmptyString(headersObject.timestamp),
		},
		rawBody,
	};
};

/**
 * Verifies Slack webhook authenticity and replay window constraints.
 *
 * @param input - Raw body, signature headers, signing secret, and clock helper.
 */
export const defaultVerifySignature = (input: {
	readonly payload: string;
	readonly headers: {
		readonly signature: string;
		readonly timestamp: string;
	};
	readonly replayToleranceSeconds: number;
	readonly signingSecret: string;
	readonly now: () => string;
}): void => {
	const requestTimestamp = Number(input.headers.timestamp);
	if (!Number.isFinite(requestTimestamp)) {
		throw new TypeError("Slack request timestamp is invalid.");
	}
	const currentSeconds = Math.floor(Date.parse(input.now()) / 1000);
	if (
		Math.abs(currentSeconds - requestTimestamp) > input.replayToleranceSeconds
	) {
		throw new Error("Slack request timestamp is outside the replay window.");
	}
	const expectedSignature = createHmac("sha256", input.signingSecret)
		.update(`v0:${input.headers.timestamp}:${input.payload}`)
		.digest("hex");
	const provided = input.headers.signature.startsWith("v0=")
		? input.headers.signature.slice(3)
		: input.headers.signature;
	const providedBuffer = Buffer.from(provided, "utf8");
	const expectedBuffer = Buffer.from(expectedSignature, "utf8");
	if (
		providedBuffer.byteLength !== expectedBuffer.byteLength ||
		!timingSafeEqual(providedBuffer, expectedBuffer)
	) {
		throw new Error("Slack request signature verification failed.");
	}
};

const parseJson = (rawBody: string): Readonly<Record<string, unknown>> => {
	try {
		const parsed = JSON.parse(rawBody) as unknown;
		const record = asRecord(parsed);
		if (!record) {
			throw new Error("Slack JSON payload must be an object.");
		}
		return record;
	} catch (error) {
		if (error instanceof SlackInvocationError) {
			throw error;
		}
		throw new SlackInvocationError({
			category: "validation",
			details: toRecord(error),
			message: "Slack request body is not valid JSON.",
		});
	}
};

const summarizeViewState = (
	state: Readonly<Record<string, unknown>> | undefined
): readonly string[] => {
	if (!state) {
		return [];
	}
	const values = asRecord(state.values);
	if (!values) {
		return [];
	}
	const parts: string[] = [];
	for (const block of Object.values(values)) {
		const blockRecord = asRecord(block);
		if (!blockRecord) {
			continue;
		}
		for (const action of Object.values(blockRecord)) {
			const actionRecord = asRecord(action);
			if (!actionRecord) {
				continue;
			}
			const directValue = asNonEmptyString(actionRecord.value);
			if (directValue) {
				parts.push(directValue);
			}
			const selectedUser = asNonEmptyString(actionRecord.selected_user);
			if (selectedUser) {
				parts.push(selectedUser);
			}
			const selectedConversation = asNonEmptyString(
				actionRecord.selected_conversation
			);
			if (selectedConversation) {
				parts.push(selectedConversation);
			}
			const selectedChannel = asNonEmptyString(actionRecord.selected_channel);
			if (selectedChannel) {
				parts.push(selectedChannel);
			}
			const selectedDate = asNonEmptyString(actionRecord.selected_date);
			if (selectedDate) {
				parts.push(selectedDate);
			}
			const selectedTime = asNonEmptyString(actionRecord.selected_time);
			if (selectedTime) {
				parts.push(selectedTime);
			}
			const selectedOption = asRecord(actionRecord.selected_option);
			const selectedOptionText = asNonEmptyString(
				asRecord(selectedOption?.text)?.text
			);
			if (selectedOptionText) {
				parts.push(selectedOptionText);
			}
			const selectedOptions = Array.isArray(actionRecord.selected_options)
				? actionRecord.selected_options
				: [];
			for (const option of selectedOptions) {
				const optionText = asNonEmptyString(
					asRecord(asRecord(option)?.text)?.text
				);
				if (optionText) {
					parts.push(optionText);
				}
			}
			const selectedUsers = Array.isArray(actionRecord.selected_users)
				? actionRecord.selected_users
				: [];
			for (const user of selectedUsers) {
				if (typeof user === "string" && user.length > 0) {
					parts.push(user);
				}
			}
		}
	}
	return parts;
};

const summarizeInteractivePayload = (
	payload: Readonly<Record<string, unknown>>
): string => {
	const callbackId = asNonEmptyString(payload.callback_id);
	const messageText = asNonEmptyString(asRecord(payload.message)?.text);
	const view = asRecord(payload.view);
	const titleText = asNonEmptyString(asRecord(view?.title)?.text);
	const privateMetadata = asNonEmptyString(view?.private_metadata);
	const stateParts = summarizeViewState(view);
	const actions = Array.isArray(payload.actions) ? payload.actions : [];
	const actionParts = actions.flatMap((action) => {
		const actionRecord = asRecord(action);
		if (!actionRecord) {
			return [];
		}
		const values = [
			asNonEmptyString(actionRecord.action_id),
			asNonEmptyString(actionRecord.value),
			asNonEmptyString(actionRecord.selected_user),
			asNonEmptyString(actionRecord.selected_conversation),
			asNonEmptyString(actionRecord.selected_channel),
			asNonEmptyString(actionRecord.selected_date),
			asNonEmptyString(actionRecord.selected_time),
			asNonEmptyString(
				asRecord(asRecord(actionRecord.selected_option)?.text)?.text
			),
		].filter(Boolean) as string[];
		return values;
	});
	return [
		callbackId,
		titleText,
		messageText,
		privateMetadata,
		...stateParts,
		...actionParts,
	]
		.filter(Boolean)
		.join(" ");
};

const parseSlashCommand = (
	envelope: SlackWebhookEnvelope,
	now: string
): SlackEventBody => {
	const params = new URLSearchParams(envelope.rawBody);
	const command = params.get("command");
	const teamId = params.get("team_id");
	const userId = params.get("user_id");
	if (!command || !teamId || !userId) {
		throw new SlackInvocationError({
			category: "validation",
			message:
				"Slack slash command payload is missing command, team_id, or user_id.",
		});
	}
	return {
		callbackId: undefined,
		channelId: params.get("channel_id") ?? undefined,
		channelName: params.get("channel_name") ?? undefined,
		command,
		eventId:
			params.get("trigger_id") ??
			`slash:${command}:${createHash("sha256").update(envelope.rawBody).digest("hex")}`,
		eventType: "slash_command",
		rawEvent: undefined,
		receivedAt: now,
		responseUrl: params.get("response_url") ?? undefined,
		surface: "slash_command",
		teamId,
		text: params.get("text") ?? "",
		userId,
		userName: params.get("user_name") ?? undefined,
	};
};

const parseInteractivePayload = (
	envelope: SlackWebhookEnvelope,
	now: string
): SlackEventBody => {
	const params = new URLSearchParams(envelope.rawBody);
	const payloadText = params.get("payload");
	if (!payloadText) {
		throw new SlackInvocationError({
			category: "validation",
			message: "Slack interactive payload is missing the payload field.",
		});
	}
	const payload = parseJson(payloadText);
	const type = asNonEmptyString(payload.type);
	const teamId =
		asNonEmptyString(asRecord(payload.team)?.id) ??
		asNonEmptyString(asRecord(payload.user)?.team_id);
	const user = asRecord(payload.user);
	const channel = asRecord(payload.channel);
	const container = asRecord(payload.container);
	const view = asRecord(payload.view);
	if (!type || !teamId || !user) {
		throw new SlackInvocationError({
			category: "validation",
			message:
				"Slack interactive payload is missing type, team, or user context.",
		});
	}
	let surface: SlackInboundSurface = "shortcut";
	if (type === "block_actions") {
		surface = "block_actions";
	} else if (type === "view_submission") {
		surface = "view_submission";
	}
	return {
		callbackId:
			asNonEmptyString(payload.callback_id) ??
			asNonEmptyString(view?.callback_id),
		channelId:
			asNonEmptyString(channel?.id) ??
			asNonEmptyString(container?.channel_id) ??
			asNonEmptyString(asRecord(payload.message)?.channel),
		channelName: asNonEmptyString(channel?.name),
		command: undefined,
		eventId:
			asNonEmptyString(view?.id) ??
			asNonEmptyString(payload.trigger_id) ??
			asNonEmptyString(payload.callback_id) ??
			`${type}:${createHash("sha256").update(payloadText).digest("hex")}`,
		eventType: type,
		rawEvent: payload,
		receivedAt: slackTsToIso(
			asNonEmptyString(container?.message_ts) ??
				asNonEmptyString(container?.thread_ts),
			now
		),
		responseUrl: asNonEmptyString(payload.response_url),
		surface,
		teamId,
		text: summarizeInteractivePayload(payload),
		threadTs:
			asNonEmptyString(container?.thread_ts) ??
			asNonEmptyString(container?.message_ts),
		userId: asNonEmptyString(user.id),
		userName: asNonEmptyString(user.username) ?? asNonEmptyString(user.name),
	};
};

const parseEventCallback = (
	envelope: SlackWebhookEnvelope,
	now: string
): ParsedSlackInbound => {
	const payload = parseJson(envelope.rawBody);
	const type = asNonEmptyString(payload.type);
	if (type === "url_verification") {
		const challenge = asNonEmptyString(payload.challenge);
		if (!challenge) {
			throw new SlackInvocationError({
				category: "validation",
				message: "Slack url_verification payload is missing challenge.",
			});
		}
		return {
			challenge,
			kind: "url_verification",
		};
	}
	if (type !== "event_callback") {
		throw new SlackInvocationError({
			category: "validation",
			message: `Unsupported Slack JSON payload type: ${type ?? "unknown"}.`,
		});
	}
	const event = asRecord(payload.event);
	const eventType = asNonEmptyString(event?.type);
	const teamId =
		asNonEmptyString(payload.team_id) ?? asNonEmptyString(event?.team);
	if (!event || !eventType || !teamId) {
		throw new SlackInvocationError({
			category: "validation",
			message: "Slack event payload is missing event.type or team_id.",
		});
	}
	const channelType = asNonEmptyString(event.channel_type);
	let surface: SlackInboundSurface = "message";
	if (eventType === "app_mention") {
		surface = "app_mention";
	} else if (channelType === "im") {
		surface = "direct_message";
	}
	return {
		callbackId: undefined,
		channelId: asNonEmptyString(event.channel),
		channelName: undefined,
		command: undefined,
		eventId:
			asNonEmptyString(payload.event_id) ??
			`${eventType}:${createHash("sha256").update(envelope.rawBody).digest("hex")}`,
		eventType,
		rawEvent: event,
		receivedAt: slackTsToIso(
			asNonEmptyString(event.event_ts) ?? asNonEmptyString(event.ts),
			now
		),
		responseUrl: undefined,
		surface,
		teamId,
		text: asNonEmptyString(event.text) ?? "",
		threadTs: asNonEmptyString(event.thread_ts) ?? asNonEmptyString(event.ts),
		userId: asNonEmptyString(event.user),
		userName: asNonEmptyString(event.username),
	};
};

/**
 * Parses a Slack webhook request body into a normalized inbound payload.
 *
 * @param envelope - Normalized Slack webhook transport envelope.
 * @param now - Receipt timestamp used when payloads do not include one.
 * @returns Parsed Slack webhook content ready for routing and normalization.
 */
export const parseSlackRequest = (
	envelope: SlackWebhookEnvelope,
	now: string
): ParsedSlackInbound => {
	const contentType = toLowerContentType(envelope.headers.contentType);
	if (contentType === "application/x-www-form-urlencoded") {
		const params = new URLSearchParams(envelope.rawBody);
		return params.has("payload")
			? parseInteractivePayload(envelope, now)
			: parseSlashCommand(envelope, now);
	}
	return parseEventCallback(envelope, now);
};

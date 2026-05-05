/* oxlint-disable max-statements */
/* oxlint-disable promise/avoid-new */
import type {
	NotificationDispatchInput,
	NotificationDispatchResult,
} from "@dsar/backend";
import { asRecord, asTrimmedNonEmptyString } from "@dsar/guards";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Resend } from "resend";

import {
	defaultOutboundResendConfig,
	parseOutboundResendAdapterConfig,
} from "./config";
import type {
	OutboundResendAdapterConfig,
	OutboundResendAdapterContract,
	OutboundResendAdapterDependencies,
	OutboundResendAdapterInvocationError,
	OutboundResendErrorCategory,
	OutboundResendSendContext,
	OutboundResendTemplateRenderer,
} from "./types";
import type { OutboundResendErrorCode } from "./types/error-codes";
import { resolveOutboundResendErrorCatalogEntry } from "./types/error-codes";

const RETRIABLE_CATEGORIES = new Set<OutboundResendErrorCategory>([
	"network",
	"rate_limit",
	"timeout",
]);

const CATEGORY_MATCHERS: readonly {
	readonly category: OutboundResendErrorCategory;
	readonly tokens: readonly string[];
}[] = [
	{ category: "timeout", tokens: ["timeout", "timed out"] },
	{ category: "rate_limit", tokens: ["rate", "429"] },
	{ category: "network", tokens: ["network", "socket", "econn", "fetch"] },
	{
		category: "auth",
		tokens: ["unauthorized", "forbidden", "auth", "401", "403"],
	},
	{
		category: "validation",
		tokens: ["invalid", "validation", "missing", "malformed", "400"],
	},
	{ category: "config", tokens: ["api key", "configuration", "config"] },
];

const classifyErrorCategory = (
	lowerMessage: string,
	statusCode?: number,
	errorName?: string
): OutboundResendErrorCategory => {
	if (statusCode === 429 || errorName === "rate_limit_exceeded") {
		return "rate_limit";
	}
	if (statusCode === 401 || statusCode === 403) {
		return "auth";
	}
	if (statusCode === 400 || errorName === "validation_error") {
		return "validation";
	}
	for (const matcher of CATEGORY_MATCHERS) {
		if (matcher.tokens.some((token) => lowerMessage.includes(token))) {
			return matcher.category;
		}
	}
	return "unknown";
};

const createInvocationError = (input: {
	readonly category: OutboundResendErrorCategory;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
	readonly retriable?: boolean;
}): OutboundResendAdapterInvocationError => {
	const catalogCodeByCategory = {
		config: "OUTBOUND_RESEND_CONFIG_INVALID",
		unknown: "OUTBOUND_RESEND_UNCATALOGED_ERROR",
	} as const satisfies Partial<
		Record<OutboundResendErrorCategory, OutboundResendErrorCode>
	>;
	const catalogCode =
		catalogCodeByCategory[
			input.category as keyof typeof catalogCodeByCategory
		] ?? "OUTBOUND_RESEND_RUNTIME_ERROR";
	const catalogEntry = resolveOutboundResendErrorCatalogEntry(catalogCode);
	return {
		_tag: "AdapterInvocationError",
		adapterKey: "outbound-resend",
		capability: "notifications",
		category: input.category,
		details: {
			...input.details,
			docsUrl: catalogEntry.docsUrl,
			errorCode: catalogEntry.code,
			errorId: catalogEntry.id,
			status: catalogEntry.status,
		},
		message: input.message,
		retriable: input.retriable ?? RETRIABLE_CATEGORIES.has(input.category),
	};
};

/**
 * Normalizes provider/client failures into a stable adapter invocation error
 * shape.
 *
 * @param error - Raw error thrown by the Resend SDK or network layer. May be an
 *   `Error` instance, a plain string, or an object with `message`, `statusCode`,
 *   `name`, and/or a nested `error` record — all of which are inspected to
 *   extract a human-readable message and HTTP status code.
 * @returns An {@link OutboundResendAdapterInvocationError} with a stable
 *   `message`, classified `category`, `retriable` flag, and the original
 *   error details preserved in `details`.
 */
export const normalizeOutboundResendProviderError = (
	error: unknown
): OutboundResendAdapterInvocationError => {
	const details = asRecord(error);
	const rawMessage = asTrimmedNonEmptyString(error);
	const explicitMessage = asTrimmedNonEmptyString(details?.message);
	const errorMessage =
		error instanceof Error ? asTrimmedNonEmptyString(error.message) : undefined;
	const message =
		rawMessage ??
		explicitMessage ??
		errorMessage ??
		"Outbound resend adapter invocation failed.";
	const nestedError = asRecord(details?.error);
	let statusCode: number | undefined;
	if (typeof details?.statusCode === "number") {
		({ statusCode } = details);
	} else if (typeof nestedError?.statusCode === "number") {
		statusCode = Number(nestedError.statusCode);
	}
	const errorName =
		asTrimmedNonEmptyString(details?.name) ??
		asTrimmedNonEmptyString(nestedError?.name);
	const category = classifyErrorCategory(
		message.toLowerCase(),
		statusCode,
		errorName
	);
	return createInvocationError({
		category,
		details,
		message,
	});
};

const deriveRecipient = (
	input: NotificationDispatchInput["payload"]
): string | undefined => {
	const direct = asTrimmedNonEmptyString(input.recipientEmail);
	if (direct) {
		return direct;
	}
	const outboundPayload = asRecord(input._outboundResend);
	return asTrimmedNonEmptyString(outboundPayload?.recipient);
};

const defaultTemplateRenderer: OutboundResendTemplateRenderer = (
	input: OutboundResendSendContext
) => ({
	subject: `DSAR update: ${input.eventType.replaceAll("_", " ")}`,
	text: [
		`Event: ${input.eventType}`,
		`Request ID: ${input.requestId}`,
		`Policy Version: ${input.policyVersion}`,
		`Locale: ${input.locale}`,
		`Correlation ID: ${input.correlationId}`,
		"",
		"Payload:",
		JSON.stringify(input.payload, null, 2),
	].join("\n"),
});

const withTimeout = async <T>(
	promise: Promise<T>,
	timeout: Duration.Duration
): Promise<T> => {
	const ms = Duration.toMillis(timeout);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => {
					reject(
						createInvocationError({
							category: "timeout",
							message: `Outbound-resend send timed out after ${ms}ms.`,
						})
					);
				}, ms);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
};

const makeDependencies = (
	config: OutboundResendAdapterConfig & { readonly timeoutMs: number }
): OutboundResendAdapterDependencies => {
	const client = new Resend(config.apiKey);
	const sendTimeout = Duration.millis(config.timeoutMs);
	return {
		sendEmail: (input) =>
			withTimeout(
				client.emails.send(input.body, {
					idempotencyKey: input.options.idempotencyKey,
				}),
				sendTimeout
			),
	};
};

/**
 * Creates a Resend-backed notification adapter compatible with backend
 * contracts.
 *
 * @param config - Adapter configuration including `apiKey`, sender `from`
 *   address, optional `replyTo`, `subjectPrefix`, and `timeoutMs`.
 * @param dependencies - Optional pre-built Resend client and utilities;
 *   defaults are derived from `config` when omitted.
 * @param renderer - Template renderer that converts notification payloads into
 *   email subject and plain-text body content (defaults to the built-in renderer).
 * @returns A {@link OutboundResendAdapterContract} exposing `send`,
 *   `healthCheck`, and `diagnostics` methods for the notification subsystem.
 */
export const makeOutboundResendAdapter = (
	config: OutboundResendAdapterConfig,
	dependencies?: OutboundResendAdapterDependencies,
	renderer: OutboundResendTemplateRenderer = defaultTemplateRenderer
): OutboundResendAdapterContract => {
	const resolved = defaultOutboundResendConfig(config);
	const deps = dependencies ?? makeDependencies(resolved);
	const adapterTimeoutBudget = Duration.millis(resolved.timeoutMs);
	const withPrefix = (subject: string): string =>
		resolved.subjectPrefix
			? `${resolved.subjectPrefix.trim()} ${subject}`.trim()
			: subject;

	return {
		capability: "notifications",
		diagnostics: () =>
			Effect.succeed({
				capability: "notifications",
				details: {
					from: resolved.from,
					hasReplyTo: resolved.replyTo !== undefined,
					provider: "resend",
				},
				key: "outbound-resend",
			}),
		healthCheck: () =>
			Effect.succeed({
				details: {
					provider: "resend",
				},
				ok: true,
				status: "healthy",
			}),
		init: (_config) => Effect.void,
		key: "outbound-resend",
		send: (input) =>
			Effect.gen(function* outboundResendSendProgram() {
				const recipient = deriveRecipient(input.payload);
				if (!recipient) {
					return {
						error: "Notification payload is missing recipient email.",
						status: "skipped" as const,
					} satisfies NotificationDispatchResult;
				}
				const rendered = renderer({
					correlationId: input.correlationId,
					eventType: input.eventType,
					idempotencyKey: input.idempotencyKey,
					locale: input.locale,
					payload: input.payload,
					policyVersion: input.policyVersion,
					recipient,
					requestId: input.requestId,
				});
				if (!rendered.subject || !rendered.text) {
					return {
						error: "Template renderer returned empty subject or body.",
						status: "failed" as const,
					} satisfies NotificationDispatchResult;
				}
				const subject = withPrefix(rendered.subject);
				const { sendChatMessage } = deps;
				if (sendChatMessage) {
					const chatMessage = yield* Effect.tryPromise({
						catch: (error) => error,
						try: () =>
							withTimeout(
								sendChatMessage({
									correlationId: input.correlationId,
									eventId: input.eventId,
									eventType: input.eventType,
									idempotencyKey: input.idempotencyKey,
									policyVersion: input.policyVersion,
									recipient,
									requestId: input.requestId,
									subject,
									text: rendered.text,
								}),
								adapterTimeoutBudget
							),
					});
					if (!chatMessage?.id) {
						return {
							error: "Chat SDK delivery did not return a message id.",
							status: "failed" as const,
						} satisfies NotificationDispatchResult;
					}
					return {
						responseCode: 202,
						status: "delivered" as const,
					} satisfies NotificationDispatchResult;
				}

				const response = yield* Effect.tryPromise(() =>
					deps.sendEmail({
						body: {
							from: resolved.from,
							headers: {
								"x-dsar-correlation-id": input.correlationId,
								"x-dsar-event-id": input.eventId,
								"x-dsar-policy-version": input.policyVersion,
							},
							replyTo: resolved.replyTo,
							subject,
							tags: [
								{ name: "dsar_event", value: input.eventType },
								{ name: "dsar_request", value: input.requestId },
							],
							text: rendered.text,
							to: [recipient],
						},
						options: {
							idempotencyKey: input.idempotencyKey,
						},
					})
				);

				if (response.error) {
					const message =
						response.error.message ??
						`Resend request failed (${response.error.name ?? "unknown_error"}).`;
					return {
						error: message,
						responseCode:
							typeof response.error.statusCode === "number"
								? response.error.statusCode
								: undefined,
						status: "failed" as const,
					} satisfies NotificationDispatchResult;
				}
				if (!response.data?.id) {
					return {
						error: "Resend did not return an email id.",
						status: "failed" as const,
					} satisfies NotificationDispatchResult;
				}
				return {
					responseCode: 202,
					status: "delivered" as const,
				} satisfies NotificationDispatchResult;
			}).pipe(
				Effect.mapError((error) => normalizeOutboundResendProviderError(error))
			),
		validateConfig: (input) =>
			Effect.suspend(() => {
				const parsed = parseOutboundResendAdapterConfig(input);
				if (parsed._tag === "Failure") {
					return Effect.fail({
						...createInvocationError({
							category: "config",
							details: { parseError: Cause.pretty(parsed.cause) },
							message: "Invalid outbound resend adapter configuration.",
							retriable: false,
						}),
						category: "config" as const,
						retriable: false,
					});
				}
				return Effect.void;
			}),
	};
};

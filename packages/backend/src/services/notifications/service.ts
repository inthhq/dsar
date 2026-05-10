import { asNonEmptyString, asRecordOrEmpty } from "@dsar/guards";
/* oxlint-disable complexity */
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { normalizeAdapterError, toAdapterFailureEvent } from "../../adapters";
import type { AdapterContractError } from "../../adapters";
import type { NotificationEventDraft } from "../../events/contracts";
import { makeRequestId } from "../../middleware/auth-context";
import { RequestValidationError } from "../../types/errors";
import type {
	NotificationDispatchInput,
	NotificationDispatchResult,
	RuntimeServices,
} from "../../types/runtime";
import { RuntimeServicesTag } from "../../types/runtime";
import { dispatchWebhookNotification } from "./webhook";

const DEFAULT_TENANT_ID = "tenant-default";
const DEFAULT_POLICY_VERSION = "policy-v1";
const DEFAULT_LOCALE = "en-GB";
const GENERATED_STATUS = "generated";
const DEFAULT_WEBHOOK_ENDPOINT_ID = "default";

const notifyDeadDispatch = (input: {
	readonly eventId: string;
	readonly channel: string;
	readonly destination: string;
	readonly tenantId: string;
}): Effect.Effect<void, AppendDeliveryAttemptError, RuntimeServicesTag> =>
	Effect.gen(function* notifyDeadDispatchProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		if (services.config.onDeadDispatchAlert) {
			const alertEvent = {
				channel: input.channel,
				destination: input.destination,
				eventId: input.eventId,
				tenantId: input.tenantId,
				deadAt: new Date().toISOString(),
			};
			yield* Effect.tryPromise(() =>
				Promise.resolve(services.config.onDeadDispatchAlert(alertEvent))
			).pipe(Effect.catch(() => Effect.void));
		}
	});

const toGeneratedResult = (
	eventId: string
): {
	readonly eventId: string;
	readonly status: "generated";
} => ({
	eventId,
	status: GENERATED_STATUS,
});

const toErrorCause = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "unknown";
};

const toNotificationDispatchValidationError = (
	error: unknown
): RequestValidationError =>
	new RequestValidationError({
		details: {
			cause: toErrorCause(error),
		},
		message: "Failed to generate or dispatch notification event.",
		reasonCode: "REQUEST_VALIDATION_FAILED",
	});

/**
 * Resolves effective outbound-resend policy with workspace > tenant > global precedence.
 */
const resolveOutboundResendPolicy = (input: {
	readonly config: RuntimeServices["config"];
	readonly tenantId: string;
	readonly workspaceId?: string;
}): {
	readonly enabled: boolean;
	readonly fallbackRecipient?: string;
} => {
	let enabled = true;
	if (input.config.notificationWebhook?.disableBuiltInEmail === true) {
		enabled = false;
	}
	const outboundConfig = input.config.outboundResend;
	if (outboundConfig?.enabled !== undefined) {
		({ enabled } = outboundConfig);
	}
	const tenantPolicy = outboundConfig?.tenants?.[input.tenantId];
	if (tenantPolicy?.enabled !== undefined) {
		({ enabled } = tenantPolicy);
	}
	const workspacePolicy =
		input.workspaceId === undefined
			? undefined
			: tenantPolicy?.workspaces?.[input.workspaceId];
	if (workspacePolicy?.enabled !== undefined) {
		({ enabled } = workspacePolicy);
	}
	return {
		enabled,
		fallbackRecipient:
			asNonEmptyString(workspacePolicy?.fallbackRecipient) ??
			asNonEmptyString(tenantPolicy?.fallbackRecipient) ??
			asNonEmptyString(outboundConfig?.fallbackRecipient),
	};
};

/**
 * Resolves the recipient email from request data, falling back to policy defaults.
 */
const resolveNotificationRecipient = (input: {
	readonly services: RuntimeServices;
	readonly requestId: string;
	readonly tenantId: string;
	readonly fallbackRecipient?: string;
}): Effect.Effect<string | undefined> =>
	Effect.gen(function* resolveNotificationRecipientProgram() {
		const request = yield* input.services.repos.persistence.requests
			.getById(input.requestId)
			.pipe(withTenant(input.tenantId), Effect.result);
		if (request._tag === "Failure") {
			return input.fallbackRecipient;
		}
		const requestor = asRecordOrEmpty(request.success.requestor);
		const capture = asRecordOrEmpty(request.success.capture);
		const subject = asRecordOrEmpty(capture.subject);
		return (
			asNonEmptyString(requestor.email) ??
			asNonEmptyString(subject.email) ??
			input.fallbackRecipient
		);
	});

const toDispatchInput = (input: {
	readonly eventId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string;
	readonly draft: NotificationEventDraft;
}): NotificationDispatchInput => {
	const normalizedPayload =
		typeof input.draft.payload === "object" &&
		input.draft.payload !== null &&
		!Array.isArray(input.draft.payload)
			? asRecordOrEmpty(input.draft.payload)
			: { value: input.draft.payload };
	return {
		correlationId: input.correlationId,
		eventId: input.eventId,
		eventType: input.draft.eventType,
		idempotencyKey: input.idempotencyKey,
		locale: input.draft.locale,
		payload: normalizedPayload,
		policyVersion: input.draft.policyVersion,
		requestId: input.draft.requestId,
	};
};

const resolveWebhookSigningKey = (input: {
	readonly config: NonNullable<
		RuntimeServices["config"]["notificationWebhook"]
	>;
	readonly services: RuntimeServices;
	readonly tenantId: string;
}) =>
	input.services.repos.persistence.webhookEndpoints
		.ensureConfigured({
			createdAt: new Date().toISOString(),
			id: input.config.endpointId ?? DEFAULT_WEBHOOK_ENDPOINT_ID,
			signingSecret: input.config.signingSecret,
			url: input.config.url,
		})
		.pipe(
			withTenant(input.tenantId),
			Effect.map(({ primaryKey }) => ({
				id: primaryKey.id,
				secret: primaryKey.secret,
			}))
		);

const appendDeliveryAttempt = (input: {
	readonly eventId: string;
	readonly requestId: string;
	readonly attempt: number;
	readonly destination: string;
	readonly channel: string;
	readonly status: "pending" | "delivered" | "failed" | "skipped";
	readonly responseCode?: number;
	readonly error?: string;
	readonly tenantId: string;
}) =>
	Effect.gen(function* appendDeliveryAttemptProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		yield* services.repos.persistence.notificationDeliveryAttempts
			.append({
				attempt: input.attempt,
				channel: input.channel,
				createdAt: new Date().toISOString(),
				destination: input.destination,
				error: input.error,
				id: makeRequestId(),
				notificationEventId: input.eventId,
				requestId: input.requestId,
				responseCode: input.responseCode,
				status: input.status,
			})
			.pipe(withTenant(input.tenantId));
	});

type AppendDeliveryAttemptError = Effect.Error<
	ReturnType<typeof appendDeliveryAttempt>
>;

/**
 * Delivers through a single channel and records every attempt for auditability.
 *
 * Retries are bounded by max attempts and adapter retriability semantics.
 */
const deliverWithRetries = (input: {
	readonly eventId: string;
	readonly tenantId: string;
	readonly requestId: string;
	readonly destination: string;
	readonly channel: string;
	readonly adapterKey: string;
	readonly send: () => Effect.Effect<
		NotificationDispatchResult,
		AdapterContractError
	>;
	readonly retryMaxAttempts: number;
	readonly retryDelayMs: number;
}): Effect.Effect<void, AppendDeliveryAttemptError, RuntimeServicesTag> => {
	const runAttempt = (
		attempt: number
	): Effect.Effect<void, AppendDeliveryAttemptError, RuntimeServicesTag> =>
		Effect.gen(function* runNotificationAttempt() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const resultOrError = yield* Effect.result(input.send());
			if (resultOrError._tag === "Failure") {
				const normalized = normalizeAdapterError({
					adapterKey: input.adapterKey,
					capability: "notifications",
					error: resultOrError.failure,
				});
				const adapterEvent = toAdapterFailureEvent({
					error: normalized,
					requestId: services.requestContext.requestId,
				});
				if (services.config.onAdapterEvent) {
					yield* Effect.tryPromise(() =>
						Promise.resolve(services.config.onAdapterEvent?.(adapterEvent))
					).pipe(Effect.catch(() => Effect.void));
				}
				const isLastAttempt = attempt >= input.retryMaxAttempts || !normalized.retriable;
				yield* appendDeliveryAttempt({
					attempt,
					channel: input.channel,
					destination: input.destination,
					error: normalized.message,
					eventId: input.eventId,
					requestId: input.requestId,
					status: isLastAttempt ? "dead" : "failed",
					tenantId: input.tenantId,
				});
				if (isLastAttempt) {
					yield* notifyDeadDispatch({
						eventId: input.eventId,
						channel: input.channel,
						destination: input.destination,
						tenantId: input.tenantId,
					});
					return;
				}
				yield* Effect.sleep(input.retryDelayMs);
				return yield* runAttempt(attempt + 1);
			}
			const result = resultOrError.success;
			yield* appendDeliveryAttempt({
				attempt,
				channel: input.channel,
				destination: input.destination,
				error: result.error,
				eventId: input.eventId,
				requestId: input.requestId,
				responseCode: result.responseCode,
				status: result.status,
				tenantId: input.tenantId,
			});
			if (result.status === "delivered") {
				return;
			}
			if (result.status === "skipped") {
				return;
			}
			if (attempt >= input.retryMaxAttempts) {
				yield* appendDeliveryAttempt({
					attempt: attempt + 1,
					channel: input.channel,
					destination: input.destination,
					error: result.error ?? "Max retry attempts exhausted",
					eventId: input.eventId,
					requestId: input.requestId,
					responseCode: result.responseCode,
					status: "dead",
					tenantId: input.tenantId,
				});
				yield* notifyDeadDispatch({
					eventId: input.eventId,
					channel: input.channel,
					destination: input.destination,
					tenantId: input.tenantId,
				});
				return;
			}
			yield* Effect.sleep(input.retryDelayMs);
			return yield* runAttempt(attempt + 1);
		});
	return runAttempt(1);
};

/**
 * Persists and dispatches a notification event across configured
 * webhook/email channels.
 *
 * @param input - Emission envelope:
 *   - `draft` — the {@link NotificationEventDraft} to persist and send.
 *   - `idempotencyKey` — deduplication key; duplicate keys are skipped.
 *   - `tenantId` — optional tenant scope; defaults to the system tenant.
 *   - `workspaceId` — optional workspace for policy/recipient lookup.
 * @returns An effect yielding `{ eventId, status: "generated" }` once
 *   the event is persisted and delivery attempts are recorded. Fails
 *   with {@link RequestValidationError} on malformed input. Side effects:
 *   inserts a notification event row, records delivery attempts, and
 *   dispatches via webhook and/or email channels.
 */
export const emitNotificationEvent = (input: {
	readonly draft: NotificationEventDraft;
	readonly idempotencyKey: string;
	readonly tenantId?: string;
	readonly workspaceId?: string;
}): Effect.Effect<
	{
		readonly eventId: string;
		readonly status: "generated";
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* emitNotificationEventProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const correlationId = services.requestContext.requestId;
		const requestEvents = yield* services.repos.persistence.notificationEvents
			.listByRequestId(input.draft.requestId)
			.pipe(withTenant(tenantId));
		// Idempotency is scoped to request + event type + caller idempotency key.
		const existing = requestEvents.find(
			(event) =>
				event.idempotencyKey === input.idempotencyKey &&
				event.eventType === input.draft.eventType
		);
		const eventId = existing?.id ?? makeRequestId();

		if (!existing) {
			yield* services.repos.persistence.notificationEvents
				.append({
					correlationId,
					createdAt: new Date().toISOString(),
					eventType: input.draft.eventType,
					id: eventId,
					idempotencyKey: input.idempotencyKey,
					locale: input.draft.locale,
					payload: input.draft.payload,
					policyVersion: input.draft.policyVersion,
					requestId: input.draft.requestId,
				})
				.pipe(withTenant(tenantId));
		}

		const dispatchInput = toDispatchInput({
			correlationId,
			draft: input.draft,
			eventId,
			idempotencyKey: input.idempotencyKey,
		});

		const webhookConfig = services.config.notificationWebhook;
		const resolvedNotificationAdapter =
			services.adapterRegistry.resolveNotification();
		const outboundResendAdapter =
			services.adapterRegistry.resolveNotification("outbound-resend") ??
			(resolvedNotificationAdapter?.key === "outbound-resend"
				? resolvedNotificationAdapter
				: undefined);
		const webhookAdapter =
			resolvedNotificationAdapter &&
			resolvedNotificationAdapter.key !== "outbound-resend"
				? resolvedNotificationAdapter
				: undefined;

		// Webhook is optional; we still persist a pending attempt so audit trails can
		// explain why no outbound webhook dispatch occurred.
		if (!webhookConfig || webhookConfig.url.length === 0) {
			yield* appendDeliveryAttempt({
				attempt: 1,
				channel: "webhook",
				destination: "unconfigured",
				eventId,
				requestId: input.draft.requestId,
				status: "pending",
				tenantId,
			});
		} else {
			const signingKey = yield* resolveWebhookSigningKey({
				config: webhookConfig,
				services,
				tenantId,
			});
			yield* deliverWithRetries({
				adapterKey: webhookAdapter?.key ?? "webhook-fallback",
				channel: "webhook",
				destination: webhookConfig.url,
				eventId,
				requestId: input.draft.requestId,
				retryDelayMs: webhookConfig.retryDelayMs,
				retryMaxAttempts: webhookConfig.retryMaxAttempts,
				send: () =>
					webhookAdapter
						? webhookAdapter.send({
								...dispatchInput,
								webhookSigningKey: signingKey,
							})
						: dispatchWebhookNotification({
								event: dispatchInput,
								signingKey,
								timeoutMs: webhookConfig.timeoutMs,
								url: webhookConfig.url,
							}),
				tenantId,
			});
		}

		// Email dispatch can be disabled independently from webhook dispatch.
		const outboundPolicy = resolveOutboundResendPolicy({
			config: services.config,
			tenantId,
			workspaceId: input.workspaceId,
		});
		if (!outboundPolicy.enabled) {
			yield* appendDeliveryAttempt({
				attempt: 1,
				channel: "email",
				destination: outboundPolicy.fallbackRecipient ?? "disabled",
				eventId,
				requestId: input.draft.requestId,
				status: "skipped",
				tenantId,
			});
			return toGeneratedResult(eventId);
		}

		// Recipient resolution prefers request-derived addresses over configured fallback.
		const recipient = yield* resolveNotificationRecipient({
			fallbackRecipient: outboundPolicy.fallbackRecipient,
			requestId: input.draft.requestId,
			services,
			tenantId,
		});
		if (!recipient) {
			yield* appendDeliveryAttempt({
				attempt: 1,
				channel: "email",
				destination: "recipient_unavailable",
				error: "No email recipient resolved for notification event.",
				eventId,
				requestId: input.draft.requestId,
				status: "skipped",
				tenantId,
			});
			return toGeneratedResult(eventId);
		}
		if (!outboundResendAdapter) {
			yield* appendDeliveryAttempt({
				attempt: 1,
				channel: "email",
				destination: recipient,
				error: "Built-in email adapter is not configured.",
				eventId,
				requestId: input.draft.requestId,
				status: "skipped",
				tenantId,
			});
			return toGeneratedResult(eventId);
		}

		const retryDelayMs = webhookConfig?.retryDelayMs ?? 250;
		const retryMaxAttempts = webhookConfig?.retryMaxAttempts ?? 3;
		const emailDispatchInput: NotificationDispatchInput = {
			...dispatchInput,
			payload: {
				...dispatchInput.payload,
				recipientEmail: recipient,
				tenantId,
				workspaceId: input.workspaceId,
			},
		};
		yield* deliverWithRetries({
			adapterKey: outboundResendAdapter.key,
			channel: "email",
			destination: recipient,
			eventId,
			requestId: input.draft.requestId,
			retryDelayMs,
			retryMaxAttempts,
			send: () => outboundResendAdapter.send(emailDispatchInput),
			tenantId,
		});
		return toGeneratedResult(eventId);
	}).pipe(Effect.mapError(toNotificationDispatchValidationError));

/**
 * Builds a normalized {@link NotificationEventDraft} with default locale
 * and policy-version fallbacks.
 *
 * @param input - Draft fields:
 *   - `requestId` — the DSAR request this notification relates to.
 *   - `eventType` — notification category (e.g. `"ack"`, `"deadline_warning"`).
 *   - `payload` — arbitrary event payload forwarded to templates/webhooks.
 *   - `policyVersion` — optional; defaults to `DEFAULT_POLICY_VERSION`.
 *   - `locale` — optional; defaults to `DEFAULT_LOCALE`.
 * @returns A fully populated {@link NotificationEventDraft} ready to pass
 *   to {@link emitNotificationEvent}. Pure — no side effects.
 */
export const makeNotificationDraft = (input: {
	readonly requestId: string;
	readonly eventType: NotificationEventDraft["eventType"];
	readonly payload: NotificationEventDraft["payload"];
	readonly policyVersion?: string;
	readonly locale?: string;
}): NotificationEventDraft => ({
	eventType: input.eventType,
	locale: input.locale ?? DEFAULT_LOCALE,
	payload: input.payload,
	policyVersion: input.policyVersion ?? DEFAULT_POLICY_VERSION,
	requestId: input.requestId,
});

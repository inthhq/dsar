import { asRecord } from "@dsar/guards";
import { PersistenceEntityNotFoundError, withTenant } from "@dsar/persistence";
import type {
	NotificationDeliveryAttemptRecord,
	NotificationDeliveryStatus,
	NotificationEventRecord,
} from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { appendAuditEvent } from "../../audit/service";
import { replayWebhookDispatch } from "../../services/notifications/service";
import { RequestValidationError } from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "../authz";
import { accepted, ok } from "../helpers";
import { currentTimeMs, getIdempotencyKey } from "../requests/shared";
import type { RouteDefinition } from "../types";

const DEFAULT_WEBHOOK_ENDPOINT_ID = "default";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DISPATCH_REPLAY_ACTION = "webhook_dispatch_replayed";

const hasErrorTag = (error: unknown, tag: string): boolean =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	error._tag === tag;

const parseIntParam = (
	value: string | null,
	fallback: number,
	min: number,
	max: number
): number => {
	if (value === null || value.trim().length === 0) {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
		throw new RequestValidationError({
			message: `Expected integer between ${min} and ${max}.`,
			reasonCode: "REQUEST_VALIDATION_FAILED",
		});
	}
	return parsed;
};

const parseStatusFilter = (
	value: string | null
): readonly NotificationDeliveryStatus[] | undefined => {
	if (!value) {
		return undefined;
	}
	const values = value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	const statuses: NotificationDeliveryStatus[] = [];
	for (const entry of values) {
		switch (entry) {
			case "delivered":
			case "failed":
			case "pending":
			case "skipped": {
				statuses.push(entry);
				break;
			}
			default: {
				throw new RequestValidationError({
					message: `Unsupported webhook dispatch status '${entry}'.`,
					reasonCode: "REQUEST_VALIDATION_FAILED",
				});
			}
		}
	}
	return statuses;
};

const isPriorReplay = (input: {
	readonly event: {
		readonly action: string;
		readonly object: string;
		readonly reason: unknown;
	};
	readonly dispatchId: string;
	readonly idempotencyKey: string;
}): boolean => {
	if (
		input.event.action !== DISPATCH_REPLAY_ACTION ||
		input.event.object !== `webhook_dispatch:${input.dispatchId}`
	) {
		return false;
	}
	return asRecord(input.event.reason)?.idempotencyKey === input.idempotencyKey;
};

const endpointIdForAttempt = (
	attempt: NotificationDeliveryAttemptRecord,
	config: { readonly endpointId?: string; readonly url: string } | undefined
): string | undefined => {
	if (!config || attempt.destination !== config.url) {
		return undefined;
	}
	return config.endpointId ?? DEFAULT_WEBHOOK_ENDPOINT_ID;
};

const toDispatchSummary = (
	attempt: NotificationDeliveryAttemptRecord,
	event: NotificationEventRecord | undefined,
	endpointId: string | undefined
) => ({
	attempt: attempt.attempt,
	createdAt: attempt.createdAt,
	destination: attempt.destination,
	dispatchId: attempt.id,
	endpointId,
	error: attempt.error,
	eventId: attempt.notificationEventId,
	eventType: event?.eventType,
	replayable: attempt.channel === "webhook" && attempt.status === "failed",
	requestId: attempt.requestId,
	responseCode: attempt.responseCode,
	status: attempt.status,
});

const ensureReplayableWebhookDispatch = (
	attempt: NotificationDeliveryAttemptRecord
) => {
	if (attempt.channel !== "webhook") {
		return Effect.fail(
			new RequestValidationError({
				message: `Dispatch ${attempt.id} is not a webhook delivery attempt.`,
				reasonCode: "REQUEST_VALIDATION_FAILED",
			})
		);
	}
	if (attempt.status !== "failed") {
		return Effect.fail(
			new RequestValidationError({
				message: `Dispatch ${attempt.id} is not failed and cannot be replayed.`,
				reasonCode: "REQUEST_VALIDATION_FAILED",
			})
		);
	}
	return Effect.void;
};

const isMissingWebhookDispatchError = (
	error: unknown,
	dispatchId: string
): boolean => {
	if (hasErrorTag(error, "PersistenceEntityNotFoundError")) {
		return true;
	}
	return error instanceof Error && error.message.includes(dispatchId);
};

const toMissingWebhookDispatchError = (dispatchId: string) =>
	new PersistenceEntityNotFoundError({
		entity: "notification_delivery_attempts",
		id: dispatchId,
	});

export const listWebhookDispatchesRoute: RouteDefinition = {
	handler: ({ request }) =>
		Effect.gen(function* listWebhookDispatchesHandler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const actor = yield* requireRequestActor(services.requestContext);
			yield* requirePrincipalKinds({
				actor,
				allowedKinds: ["operator", "service"],
				message:
					"Webhook dispatch inspection is reserved for operator and service principals.",
			});
			const tenantId = yield* requireRequestTenantId(services.requestContext);
			const { searchParams } = new URL(request.url);
			const limit = parseIntParam(
				searchParams.get("limit"),
				DEFAULT_LIMIT,
				1,
				MAX_LIMIT
			);
			const offset = parseIntParam(
				searchParams.get("offset"),
				0,
				0,
				Number.MAX_SAFE_INTEGER
			);
			const endpointId = searchParams.get("endpoint_id") ?? undefined;
			const webhookConfig = services.config.notificationWebhook;
			const configuredEndpointId =
				webhookConfig?.endpointId ?? DEFAULT_WEBHOOK_ENDPOINT_ID;
			const destination =
				endpointId && webhookConfig && endpointId === configuredEndpointId
					? webhookConfig.url
					: undefined;
			if (endpointId && !destination) {
				return ok({
					items: [],
					limit,
					offset,
					total: 0,
				});
			}
			const attempts =
				yield* services.repos.persistence.notificationDeliveryAttempts
					.list({
						channel: "webhook",
						createdAfter: searchParams.get("created_after") ?? undefined,
						createdBefore: searchParams.get("created_before") ?? undefined,
						destination,
						status: parseStatusFilter(searchParams.get("status")),
					})
					.pipe(withTenant(tenantId));
			const page = attempts.slice(offset, offset + limit);
			const items = yield* Effect.forEach(page, (attempt) =>
				Effect.gen(function* mapWebhookDispatch() {
					const event = yield* services.repos.persistence.notificationEvents
						.getById(attempt.notificationEventId)
						.pipe(withTenant(tenantId), Effect.result);
					return toDispatchSummary(
						attempt,
						event._tag === "Success" ? event.success : undefined,
						endpointIdForAttempt(attempt, webhookConfig)
					);
				})
			);
			return ok({
				items,
				limit,
				offset,
				total: attempts.length,
			});
		}),
	method: "GET",
	path: "/webhooks/dispatches",
	protected: true,
	summary: "List outbound webhook dispatches",
};

export const replayWebhookDispatchRoute: RouteDefinition = {
	handler: ({ params, request }) =>
		Effect.gen(function* replayWebhookDispatchHandler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const actor = yield* requireRequestActor(services.requestContext);
			yield* requirePrincipalKinds({
				actor,
				allowedKinds: ["operator", "service"],
				message:
					"Webhook dispatch replay is reserved for operator and service principals.",
			});
			const tenantId = yield* requireRequestTenantId(services.requestContext);
			const dispatchId = params.id;
			if (!dispatchId) {
				return yield* Effect.fail(
					new RequestValidationError({
						message: "Webhook dispatch id is required.",
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
				);
			}
			const attempt =
				yield* services.repos.persistence.notificationDeliveryAttempts
					.getById(dispatchId)
					.pipe(
						withTenant(tenantId),
						Effect.mapError((error) =>
							isMissingWebhookDispatchError(error, dispatchId)
								? toMissingWebhookDispatchError(dispatchId)
								: error
						)
					);
			yield* ensureReplayableWebhookDispatch(attempt);
			const event = yield* services.repos.persistence.notificationEvents
				.getById(attempt.notificationEventId)
				.pipe(withTenant(tenantId));
			if (event.requestId !== attempt.requestId) {
				return yield* Effect.fail(
					new RequestValidationError({
						message: `Webhook dispatch ${dispatchId} does not match its notification event request.`,
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
				);
			}
			const callerIdempotencyKey = getIdempotencyKey(request);
			const fallbackIdempotencyMs = callerIdempotencyKey
				? undefined
				: yield* currentTimeMs;
			const replayIdempotencyKey = callerIdempotencyKey
				? `webhook-dispatch-replay:${dispatchId}:${callerIdempotencyKey}`
				: `webhook-dispatch-replay:${dispatchId}:${String(fallbackIdempotencyMs)}`;
			const priorAuditEvents = yield* services.repos.persistence.auditEvents
				.listByRequestId(event.requestId)
				.pipe(withTenant(tenantId));
			if (
				priorAuditEvents.some((auditEvent) =>
					isPriorReplay({
						dispatchId,
						event: auditEvent,
						idempotencyKey: replayIdempotencyKey,
					})
				)
			) {
				return accepted({
					dispatchId,
					eventId: event.id,
					status: "already_replayed" as const,
				});
			}
			yield* replayWebhookDispatch({
				event,
				idempotencyKey: replayIdempotencyKey,
				tenantId,
			});
			yield* appendAuditEvent({
				action: DISPATCH_REPLAY_ACTION,
				actor: actor.id,
				after: {
					dispatchId,
					eventId: event.id,
					status: "replayed",
				},
				before: {
					attempt: attempt.attempt,
					dispatchId,
					status: attempt.status,
				},
				object: `webhook_dispatch:${dispatchId}`,
				reason: {
					idempotencyKey: replayIdempotencyKey,
					requestedBy: actor.principalKind,
				},
				requestId: event.requestId,
				tenantId,
			});
			return accepted({
				dispatchId,
				eventId: event.id,
				status: "replayed" as const,
			});
		}),
	method: "POST",
	path: "/webhooks/dispatches/:id/replay",
	protected: true,
	summary: "Replay outbound webhook dispatch",
};

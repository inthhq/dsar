import { asRecord } from "@dsar/guards";
import { PersistenceEntityNotFoundError, withTenant } from "@dsar/persistence";
import type {
	NotificationDeliveryAttemptRecord,
	NotificationDeliveryStatus,
	NotificationEventRecord,
} from "@dsar/persistence";
import { IsoTimestampSchema } from "@dsar/schema";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

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
import { getIdempotencyKey } from "../requests/shared";
import type { RouteDefinition } from "../types";

const DEFAULT_WEBHOOK_ENDPOINT_ID = "default";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DISPATCH_REPLAY_ACTION = "webhook_dispatch_replayed";
const DISPATCH_REPLAY_REQUESTED_ACTION = "webhook_dispatch_replay_requested";
const INTEGER_PARAM_PATTERN = /^(0|[1-9]\d*)$/;

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
): Effect.Effect<number, RequestValidationError> => {
	if (value === null || value.trim().length === 0) {
		return Effect.succeed(fallback);
	}
	const trimmed = value.trim();
	if (!INTEGER_PARAM_PATTERN.test(trimmed)) {
		return Effect.fail(
			new RequestValidationError({
				message: `Expected integer between ${min} and ${max}.`,
				reasonCode: "REQUEST_VALIDATION_FAILED",
			})
		);
	}
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
		return Effect.fail(
			new RequestValidationError({
				message: `Expected integer between ${min} and ${max}.`,
				reasonCode: "REQUEST_VALIDATION_FAILED",
			})
		);
	}
	return Effect.succeed(parsed);
};

const parseStatusFilter = (
	value: string | null
): Effect.Effect<
	readonly NotificationDeliveryStatus[] | undefined,
	RequestValidationError
> => {
	if (!value) {
		return Effect.succeed();
	}
	const values = value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	if (values.length === 0) {
		return Effect.succeed();
	}
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
				return Effect.fail(
					new RequestValidationError({
						message: `Unsupported webhook dispatch status '${entry}'.`,
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
				);
			}
		}
	}
	return Effect.succeed(statuses);
};

const normalizeIsoTimestamp = (value: string): string | undefined => {
	const decoded = Schema.decodeUnknownExit(IsoTimestampSchema)(value);
	if (Exit.isFailure(decoded)) {
		return undefined;
	}
	return new Date(value).toISOString();
};

const parseIsoTimestampParam = (
	value: string | null,
	paramName: "created_after" | "created_before"
): Effect.Effect<string | undefined, RequestValidationError> => {
	if (!value || value.trim().length === 0) {
		return Effect.succeed();
	}
	const normalized = normalizeIsoTimestamp(value);
	if (!normalized) {
		return Effect.fail(
			new RequestValidationError({
				message: `${paramName} must be a valid ISO-8601 timestamp.`,
				reasonCode: "REQUEST_VALIDATION_FAILED",
			})
		);
	}
	return Effect.succeed(normalized);
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
		input.event.action !== DISPATCH_REPLAY_REQUESTED_ACTION ||
		input.event.object !== `webhook_dispatch:${input.dispatchId}`
	) {
		return false;
	}
	return asRecord(input.event.reason)?.idempotencyKey === input.idempotencyKey;
};

const replayMarkerId = (input: {
	readonly dispatchId: string;
	readonly idempotencyKey: string;
	readonly tenantId: string;
}): string =>
	[
		"webhook-dispatch-replay",
		input.tenantId,
		input.dispatchId,
		encodeURIComponent(input.idempotencyKey),
	].join(":");

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
	return error instanceof Error && error.message === `Missing ${dispatchId}`;
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
			const limit = yield* parseIntParam(
				searchParams.get("limit"),
				DEFAULT_LIMIT,
				1,
				MAX_LIMIT
			);
			const offset = yield* parseIntParam(
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
			const status = yield* parseStatusFilter(searchParams.get("status"));
			const createdAfter = yield* parseIsoTimestampParam(
				searchParams.get("created_after"),
				"created_after"
			);
			const createdBefore = yield* parseIsoTimestampParam(
				searchParams.get("created_before"),
				"created_before"
			);
			const attemptFilters = {
				channel: "webhook",
				createdAfter,
				createdBefore,
				destination,
				status,
			} as const;
			const total =
				yield* services.repos.persistence.notificationDeliveryAttempts
					.count(attemptFilters)
					.pipe(withTenant(tenantId));
			const attempts =
				yield* services.repos.persistence.notificationDeliveryAttempts
					.list({
						...attemptFilters,
						limit,
						offset,
					})
					.pipe(withTenant(tenantId));
			const items = yield* Effect.forEach(attempts, (attempt) =>
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
				total,
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
			if (!callerIdempotencyKey) {
				return yield* Effect.fail(
					new RequestValidationError({
						message:
							"Webhook dispatch replay requires an x-idempotency-key header.",
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
				);
			}
			const replayIdempotencyKey = `webhook-dispatch-replay:${tenantId}:${dispatchId}:${callerIdempotencyKey}`;
			const replayRequestMarkerId = replayMarkerId({
				dispatchId,
				idempotencyKey: callerIdempotencyKey,
				tenantId,
			});
			const priorAuditEvents = yield* services.repos.persistence.auditEvents
				.list({
					action: DISPATCH_REPLAY_REQUESTED_ACTION,
					limit: MAX_LIMIT,
					requestId: event.requestId,
				})
				.pipe(withTenant(tenantId));
			if (
				priorAuditEvents.items.some((auditEvent) =>
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
			const replayRequestAppended = yield* appendAuditEvent({
				action: DISPATCH_REPLAY_REQUESTED_ACTION,
				actor: actor.id,
				after: {
					dispatchId,
					eventId: event.id,
					status: "accepted",
				},
				before: {
					attempt: attempt.attempt,
					dispatchId,
					status: attempt.status,
				},
				id: replayRequestMarkerId,
				object: `webhook_dispatch:${dispatchId}`,
				reason: {
					idempotencyKey: replayIdempotencyKey,
					requestedBy: actor.principalKind,
				},
				requestId: event.requestId,
				tenantId,
			}).pipe(
				Effect.as(true),
				Effect.catch((error) =>
					Effect.gen(function* recoverReplayRequestAppend() {
						const replayRequests = yield* services.repos.persistence.auditEvents
							.list({
								action: DISPATCH_REPLAY_REQUESTED_ACTION,
								limit: MAX_LIMIT,
								requestId: event.requestId,
							})
							.pipe(withTenant(tenantId));
						if (
							replayRequests.items.some((auditEvent) =>
								isPriorReplay({
									dispatchId,
									event: auditEvent,
									idempotencyKey: replayIdempotencyKey,
								})
							)
						) {
							return false;
						}
						return yield* Effect.fail(error);
					})
				)
			);
			if (!replayRequestAppended) {
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

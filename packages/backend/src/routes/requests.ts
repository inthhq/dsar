/* oxlint-disable func-style -- Effect-based routes use callback style */
import type { JsonValue } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { exportAuditEvents, verifyAuditChain } from "../audit/export";
import { appendAuditEvent } from "../audit/service";
import { transitionRequestLifecycle } from "../lifecycle/service";
import { makeRequestId } from "../middleware/auth-context";
import {
	emitNotificationEvent,
	makeNotificationDraft,
} from "../services/notifications/service";
import { backendErrorCatalogByCode } from "../types/error-codes";
import {
	FulfilmentGuardError,
	InternalRuntimeError,
	RequestValidationError,
} from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	accepted,
	decodeJsonBody,
	ok,
	parseParam,
	requireBinaryBody,
} from "./helpers";
import { coreRequestRoutes } from "./requests/core";
import {
	asNonEmptyString,
	asObject,
	currentIsoTime,
	currentTimeMs,
	DAY_MS,
	dateAsEpoch,
	getErrorMessage,
	getIdempotencyKey,
	getTenantId,
	getWorkspaceId,
	isoTimeOffset,
	requireMatchedTenantScope,
	resolveNotificationStatus,
	sortTimelineEvents,
	toJsonValue,
	toStringArrayValue,
	toStringValue,
	toValidationFailure,
	toVerificationMethod,
	withRequestRouteAuthorization,
	withTenant,
} from "./requests/shared";
import {
	AppealDecideBodySchema,
	AppealSubmitBodySchema,
	AuthorityEvidenceBodySchema,
	DeliveryAddressVerifyBodySchema,
	DeliveryPrepareBodySchema,
	ExtensionBodySchema,
	FulfilmentCallbackBodySchema,
	ManifestValidationBodySchema,
	RefusalBodySchema,
	RequestorUpdateBodySchema,
	RetentionUpdateBodySchema,
	StepUpCompleteBodySchema,
	VerificationEvidenceBodySchema,
} from "./schemas";
import type { RouteDefinition } from "./types";

const storageScopePrefix = (input: {
	readonly tenantId: string;
	readonly requestId: string;
}): string =>
	`tenants/${encodeURIComponent(input.tenantId)}/requests/${encodeURIComponent(input.requestId)}`;

const evidenceStorageKey = (input: {
	readonly tenantId: string;
	readonly requestId: string;
	readonly evidenceId: string;
	readonly fileName: string;
}): string =>
	`${storageScopePrefix(input)}/evidence/${encodeURIComponent(input.evidenceId)}/${input.fileName}`;

const manifestStorageKey = (input: {
	readonly tenantId: string;
	readonly requestId: string;
	readonly artifactId: string;
	readonly fileName: string;
}): string =>
	`${storageScopePrefix(input)}/manifest/${encodeURIComponent(input.artifactId)}/${input.fileName}`;

const isTenantScopedManifestKey = (input: {
	readonly key: string;
	readonly tenantId: string;
	readonly requestId: string;
}): boolean => {
	const tenantScopedPrefix = `${storageScopePrefix(input)}/manifest/`;
	const legacyPrefix = `manifest/${input.requestId}/`;
	return (
		input.key.startsWith(tenantScopedPrefix) ||
		input.key.startsWith(legacyPrefix)
	);
};

/**
 * DSAR request lifecycle route definitions.
 *
 *
 * Covers the full request lifecycle: capture and creation, queue listing,
 * identity verification, authority of agent, acknowledgement, clarification,
 * deadline extension, refusal, fulfilment (manifest upload/download/validation),
 * delivery (prepare, address verification, step-up challenge, artifact download),
 * appeals, notification replay, retention policy, and audit export/verification.
 */
const rawRequestRoutes: readonly RouteDefinition[] = [
	...coreRequestRoutes,
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "clarification_request",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/clarifications/request",
		protected: true,
		summary: "Request clarification",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "clarification_receive",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/clarifications/receive",
		protected: true,
		summary: "Receive clarification",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const { additionalDays, rationale } = yield* decodeJsonBody(
					request,
					ExtensionBodySchema
				);
				const result = yield* transitionRequestLifecycle({
					action: "extension",
					actor,
					additionalDays,
					idempotencyKey: getIdempotencyKey(request),
					rationale,
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/extensions",
		protected: true,
		summary: "Extend deadline",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const body = yield* decodeJsonBody(request, RefusalBodySchema);
				const rationale = (body.rationale?.trim() ||
					body.reason?.trim() ||
					body.message?.trim()) as string;
				const result = yield* transitionRequestLifecycle({
					action: "refuse",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					rationale,
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/refusals",
		protected: true,
		summary: "Refuse request",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "close",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/closures",
		protected: true,
		summary: "Close request",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (latest) {
					const validationState = asNonEmptyString(latest.validationState);
					if (validationState !== "approved") {
						return yield* Effect.fail(
							new FulfilmentGuardError({
								reasonCode:
									backendErrorCatalogByCode.FULFILMENT_MANIFEST_NOT_APPROVED
										.code,
								requestId,
							})
						);
					}
				}
				const result = yield* transitionRequestLifecycle({
					action: "fulfil",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/fulfilment",
		protected: true,
		summary: "Fulfil request",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "acknowledgement_sent",
						id: makeRequestId(),
						payload: { actor },
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "acknowledgement_sent",
					actor,
					after: { acknowledged: true },
					before: {},
					object: "request",
					reason: {},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "acknowledgement_sent",
						locale: services.config.defaultLocale,
						payload: { requestId },
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ?? `acknowledgement:${requestId}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({ requestId, status: "acknowledged" });
			}),
		method: "POST",
		path: "/requests/:id/acknowledgements",
		protected: true,
		summary: "Create acknowledgement",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const body = yield* decodeJsonBody(request, RequestorUpdateBodySchema);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const previous = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(
						withTenant(tenantId),
						Effect.mapError(
							() =>
								new RequestValidationError({
									message: `Request ${requestId} was not found.`,
									reasonCode:
										backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
								})
						)
					);
				const updated = yield* services.repos.persistence.requests
					.update(requestId, {
						requestor: toJsonValue(body) ?? {},
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "requestor_updated",
					actor,
					after: { requestor: updated.requestor },
					before: { requestor: toJsonValue(previous.requestor) ?? {} },
					object: "request",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					requestId,
					requestor: updated.requestor,
				});
			}),
		method: "PUT",
		path: "/requests/:id/requestor",
		protected: true,
		summary: "Set requestor",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const { evidenceArtifacts } = yield* decodeJsonBody(
					request,
					AuthorityEvidenceBodySchema
				);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(
						withTenant(tenantId),
						Effect.mapError(
							() =>
								new RequestValidationError({
									message: `Request ${requestId} was not found.`,
									reasonCode:
										backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
								})
						)
					);
				const currentAuthority = asObject(current.authority) ?? {};
				const updated = yield* services.repos.persistence.requests
					.update(requestId, {
						authority: {
							...currentAuthority,
							evidenceArtifacts,
							status: "pending",
							submittedAt: now,
						},
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "authority_submitted",
						id: makeRequestId(),
						payload: { actor },
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "authority_evidence_submitted",
					actor,
					after: { authority: updated.authority },
					before: { authority: current.authority },
					object: "request",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					authority: updated.authority,
					requestId,
				});
			}),
		method: "POST",
		path: "/requests/:id/authority/submit",
		protected: true,
		summary: "Submit authority evidence",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(
						withTenant(tenantId),
						Effect.mapError(
							() =>
								new RequestValidationError({
									message: `Request ${requestId} was not found.`,
									reasonCode:
										backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
								})
						)
					);
				const currentAuthority = asObject(current.authority) ?? {};
				const updated = yield* services.repos.persistence.requests
					.update(requestId, {
						authority: {
							...currentAuthority,
							status: "verified",
							verifiedAt: now,
						},
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "authority_approved",
						id: makeRequestId(),
						payload: { actor },
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "authority_approved",
					actor,
					after: { authority: updated.authority },
					before: { authority: current.authority },
					object: "request",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					authority: updated.authority,
					requestId,
				});
			}),
		method: "POST",
		path: "/requests/:id/authority/approve",
		protected: true,
		summary: "Approve authority evidence",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(
						withTenant(tenantId),
						Effect.mapError(
							() =>
								new RequestValidationError({
									message: `Request ${requestId} was not found.`,
									reasonCode:
										backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
								})
						)
					);
				const currentAuthority = asObject(current.authority) ?? {};
				const updated = yield* services.repos.persistence.requests
					.update(requestId, {
						authority: {
							...currentAuthority,
							rejectedAt: now,
							status: "rejected",
						},
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "authority_rejected",
						id: makeRequestId(),
						payload: { actor },
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "authority_rejected",
					actor,
					after: { authority: updated.authority },
					before: { authority: current.authority },
					object: "request",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					authority: updated.authority,
					requestId,
				});
			}),
		method: "POST",
		path: "/requests/:id/authority/reject",
		protected: true,
		summary: "Reject authority evidence",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "verification_request",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/verification/request",
		protected: true,
		summary: "Create verification case",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const body = yield* decodeJsonBody(
					request,
					VerificationEvidenceBodySchema
				);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const defaultRetention = yield* isoTimeOffset(30 * DAY_MS);
				const record = yield* services.repos.persistence.verificationEvidence
					.create({
						createdAt: now,
						evidenceArtifacts: toJsonValue(body.evidenceArtifacts) ?? [],
						id: makeRequestId(),
						level: body.level,
						methodsAllowed: toJsonValue(body.methodsAllowed) ?? ["manual"],
						reasonForDoubt: body.reasonForDoubt,
						requestId,
						retentionExpiresAt:
							asNonEmptyString(body?.retentionExpiresAt) ?? defaultRetention,
						status: "pending",
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "verification_evidence_submitted",
						id: makeRequestId(),
						payload: {
							actor,
							evidenceId: record.id,
							level: record.level,
						},
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "verification_evidence_submitted",
					actor,
					after: { evidenceId: record.id, level: record.level },
					before: {},
					object: "verification_evidence",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					evidenceId: record.id,
					level: record.level,
					requestId,
					status: record.status,
					surface: "verification_evidence",
				});
			}),
		method: "POST",
		path: "/requests/:id/verification/evidence",
		protected: true,
		summary: "Attach verification evidence",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const storage = services.adapterRegistry.resolveStorage();
				if (!storage) {
					return yield* Effect.fail(
						new InternalRuntimeError({
							message:
								"Storage adapter is not configured. File upload is unavailable.",
						})
					);
				}
				const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
				const bytes = yield* requireBinaryBody(request, MAX_UPLOAD_BYTES);
				if (bytes.byteLength === 0) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Empty file body.",
							reasonCode:
								backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
						})
					);
				}
				const rawFileName =
					request.headers.get("x-evidence-filename") ?? "evidence";
				let decoded: string;
				try {
					decoded = decodeURIComponent(rawFileName);
				} catch {
					decoded = rawFileName;
				}
				const MAX_FILENAME_LENGTH = 255;
				let sanitized = decoded.replaceAll(/[/\\]/g, "_").replaceAll("..", "_");
				let clean = "";
				for (const ch of sanitized) {
					if ((ch.codePointAt(0) ?? 0) >= 0x20) {
						clean += ch;
					}
				}
				sanitized = clean;
				const fileName = sanitized.slice(0, MAX_FILENAME_LENGTH) || "evidence";
				const contentType =
					request.headers.get("x-evidence-content-type") ??
					"application/octet-stream";
				const level = request.headers.get("x-evidence-level") ?? "reasonable";
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const evidenceId = makeRequestId();
				const storageKey = evidenceStorageKey({
					evidenceId,
					fileName,
					requestId,
					tenantId,
				});
				const stored = yield* storage
					.putObject({
						bytes,
						contentType,
						key: storageKey,
						requestId,
					})
					.pipe(
						Effect.mapError(
							(err) =>
								new InternalRuntimeError({
									message: `Storage upload failed for request ${requestId}: ${getErrorMessage(err)}`,
								})
						)
					);
				const artifactRef = stored.reference.key;
				const record = yield* services.repos.persistence.verificationEvidence
					.create({
						createdAt: now,
						evidenceArtifacts: [artifactRef],
						id: evidenceId,
						level: asNonEmptyString(level) ?? "reasonable",
						methodsAllowed: ["manual"],
						reasonForDoubt: "",
						requestId,
						retentionExpiresAt: yield* isoTimeOffset(30 * DAY_MS),
						status: "pending",
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "verification_evidence_uploaded",
						id: makeRequestId(),
						payload: {
							actor,
							artifactKey: artifactRef,
							contentType,
							evidenceId: record.id,
							fileName,
							level: record.level,
						},
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "verification_evidence_uploaded",
					actor,
					after: {
						artifactKey: artifactRef,
						evidenceId: record.id,
						fileName,
						level: record.level,
					},
					before: {},
					object: "verification_evidence",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					artifactKey: artifactRef,
					evidenceId: record.id,
					requestId,
					status: record.status,
				});
			}),
		method: "POST",
		path: "/requests/:id/verification/evidence/upload",
		protected: true,
		summary: "Upload binary evidence file to storage",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "verification_approve",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/verification/approve",
		protected: true,
		summary: "Approve verification",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const result = yield* transitionRequestLifecycle({
					action: "verification_reject",
					actor,
					idempotencyKey: getIdempotencyKey(request),
					requestId,
					tenantId: getTenantId(services),
					workspaceId: getWorkspaceId(services),
				});
				return accepted(result);
			}),
		method: "POST",
		path: "/requests/:id/verification/reject",
		protected: true,
		summary: "Reject verification",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				const timeline = yield* services.repos.persistence.timeline
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const orderedTimeline = sortTimelineEvents(timeline);
				const reversedTimeline = [...orderedTimeline].toReversed();
				const requestedEvent = reversedTimeline.find(
					(event) => event.eventType === "verification_requested"
				);
				const resolvedEvent = reversedTimeline.find(
					(event) => event.eventType === "verification_resolved"
				);
				const requestedPayload = asObject(requestedEvent?.payload);
				const resolvedPayload = asObject(resolvedEvent?.payload);
				const resolvedAction = resolvedPayload?.action;
				let status = "pending";
				if (resolvedAction === "verification_reject") {
					status = "rejected";
				} else if (resolvedAction === "verification_approve") {
					status = "approved";
				}
				const requestedAt = requestedEvent?.createdAt ?? current.receivedAt;
				return ok({
					evidenceArtifacts: toStringArrayValue(
						requestedPayload?.evidenceArtifacts
					),
					id: `verification-${requestId}`,
					level: toStringValue(requestedPayload?.level),
					method: toVerificationMethod(requestedPayload?.method),
					methodsAllowed: ["existing_auth", "email_link", "manual"],
					pauseClock: true,
					reasonForDoubt: toStringValue(requestedPayload?.reasonForDoubt),
					requestedAt,
					resolvedAt: resolvedEvent?.createdAt,
					retentionExpiresAt: new Date(
						dateAsEpoch(requestedAt) + 30 * DAY_MS
					).toISOString(),
					status,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						toValidationFailure("Failed to read verification case.", error)
					)
				)
			),
		method: "GET",
		path: "/requests/:id/verification-case",
		protected: true,
		summary: "Read verification case",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const body = yield* decodeJsonBody(request, DeliveryPrepareBodySchema);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (!latest) {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"No fulfillment artifact found. Submit a fulfilment callback first.",
							reasonCode:
								backendErrorCatalogByCode.DELIVERY_ARTIFACT_NOT_FOUND.code,
						})
					);
				}
				const deliveryPrepare = {
					channel: body.channel,
					preparedAt: now,
					preparedBy: actor,
					securityLevel: body.securityLevel,
				};
				const updated = yield* services.repos.persistence.fulfillmentArtifacts
					.update(latest.id, {
						deliveryPrepare,
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "delivery_prepared",
						id: makeRequestId(),
						payload: { actor, channel: deliveryPrepare.channel },
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "delivery_prepared",
					actor,
					after: { deliveryPrepare: updated.deliveryPrepare },
					before: {},
					object: "fulfillment_artifact",
					reason: {},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "delivery_prepared",
						locale: services.config.defaultLocale,
						payload: {
							channel: deliveryPrepare.channel,
							requestId,
						},
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ?? `delivery-prepare:${requestId}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({
					artifactId: updated.id,
					deliveryPrepare: updated.deliveryPrepare,
					requestId,
					surface: "delivery_prepare",
				});
			}),
		method: "POST",
		path: "/requests/:id/delivery/prepare",
		protected: true,
		summary: "Prepare delivery",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const body = yield* decodeJsonBody(
					request,
					DeliveryAddressVerifyBodySchema
				);
				const tenantId = getTenantId(services);
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				const requestor = asObject(current.requestor);
				const email = asNonEmptyString(requestor?.email);
				const addressToVerify = body.email ?? email;
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latestArtifact] = manifests;
				const deliveryTarget = asNonEmptyString(
					asObject(latestArtifact?.deliveryPrepare)?.email
				);
				const verified =
					addressToVerify !== undefined &&
					deliveryTarget !== undefined &&
					addressToVerify === deliveryTarget;
				return ok({
					email: addressToVerify,
					requestId,
					verified,
				});
			}),
		method: "POST",
		path: "/requests/:id/delivery/address/verify",
		protected: true,
		summary: "Verify delivery address",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (!latest) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfillment artifact found for step-up challenge.",
							reasonCode:
								backendErrorCatalogByCode.DELIVERY_ARTIFACT_NOT_FOUND.code,
						})
					);
				}
				const token = makeRequestId();
				const tokenGate = {
					createdAt: now,
					createdBy: actor,
					expiresAt: yield* isoTimeOffset(DAY_MS),
					status: "pending",
					token,
				};
				yield* services.repos.persistence.fulfillmentArtifacts
					.update(latest.id, {
						tokenGate,
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "step_up_challenge_issued",
						locale: services.config.defaultLocale,
						payload: {
							expiresAt: tokenGate.expiresAt,
							requestId,
							token,
						},
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ?? `step-up-challenge:${requestId}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({
					expiresAt: tokenGate.expiresAt,
					requestId,
				});
			}),
		method: "POST",
		path: "/requests/:id/delivery/step-up/challenge",
		protected: true,
		summary: "Start step-up challenge",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const { token: submittedToken } = yield* decodeJsonBody(
					request,
					StepUpCompleteBodySchema
				);
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (!latest) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfillment artifact found for step-up completion.",
							reasonCode:
								backendErrorCatalogByCode.DELIVERY_ARTIFACT_NOT_FOUND.code,
						})
					);
				}
				const gate = asObject(latest.tokenGate);
				const expectedToken = asNonEmptyString(gate?.token);
				const gateStatus = asNonEmptyString(gate?.status);
				const gateExpiresAt = asNonEmptyString(gate?.expiresAt);
				if (gateStatus !== "pending") {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Step-up challenge is not in pending state.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				const gateExpiresAtMs = gateExpiresAt
					? new Date(gateExpiresAt).getTime()
					: Number.NaN;
				const nowMs = yield* currentTimeMs;
				if (Number.isNaN(gateExpiresAtMs) || gateExpiresAtMs < nowMs) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Step-up token has expired.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				if (submittedToken !== expectedToken) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Invalid step-up token.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				yield* services.repos.persistence.fulfillmentArtifacts
					.update(latest.id, {
						tokenGate: {
							...gate,
							completedAt: now,
							status: "completed",
						},
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				return accepted({
					requestId,
					status: "completed",
				});
			}),
		method: "POST",
		path: "/requests/:id/delivery/step-up/complete",
		protected: true,
		summary: "Complete step-up challenge",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const artifactId = yield* parseParam(params, "artifactId");
				const token = request.headers.get("x-delivery-token");
				if (!token) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Missing x-delivery-token header.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (!latest) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfillment artifact found.",
							reasonCode:
								backendErrorCatalogByCode.DELIVERY_ARTIFACT_NOT_FOUND.code,
						})
					);
				}
				const gate = asObject(latest.tokenGate);
				const expectedToken = asNonEmptyString(gate?.token);
				if (!expectedToken) {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"No token gate configured. Complete a step-up challenge first.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				if (token !== expectedToken) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Invalid delivery token.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				if (asNonEmptyString(gate?.status) !== "completed") {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"Step-up challenge has not been completed. Complete the challenge before downloading.",
							reasonCode: backendErrorCatalogByCode.DELIVERY_TOKEN_INVALID.code,
						})
					);
				}
				const manifest = asObject(latest.artifactManifest);
				const artifacts = Array.isArray(manifest?.artifacts)
					? manifest.artifacts
					: [];
				const artifact = artifacts.find(
					(a: unknown) => asObject(a)?.id === artifactId
				);
				return ok({
					artifact: artifact ?? null,
					artifactId,
					requestId,
				});
			}),
		method: "GET",
		path: "/requests/:id/artifacts/:artifactId/download",
		protected: true,
		summary: "Download delivery artifact",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const events = yield* services.repos.persistence.notificationEvents
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const deliveryEvents = events.filter(
					(event) =>
						event.eventType === "delivery_prepared" ||
						event.eventType === "delivery_completed" ||
						event.eventType === "delivery_failed"
				);
				const logs: {
					attempts: {
						attempt: unknown;
						channel: unknown;
						createdAt: unknown;
						destination: unknown;
						status: unknown;
					}[];
					eventId: string;
					eventType: string;
				}[] = [];
				for (const event of deliveryEvents) {
					const attempts =
						yield* services.repos.persistence.notificationDeliveryAttempts
							.listByNotificationEventId(event.id)
							.pipe(withTenant(tenantId));
					logs.push({
						attempts: attempts.map((a) => ({
							attempt: a.attempt,
							channel: a.channel,
							createdAt: a.createdAt,
							destination: a.destination,
							status: a.status,
						})),
						eventId: event.id,
						eventType: event.eventType,
					});
				}
				return ok({ logs, requestId });
			}),
		method: "GET",
		path: "/requests/:id/delivery/logs",
		protected: true,
		summary: "Get delivery logs",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const body = yield* decodeJsonBody(
					request,
					FulfilmentCallbackBodySchema
				);
				const { manifest } = body;
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const nowMs = yield* currentTimeMs;
				const idempotencyKey =
					getIdempotencyKey(request) ?? `fulfilment:${nowMs.toString(10)}`;
				const currentRequest = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				const capturePolicy = asObject(
					asObject(currentRequest.capture)?.policy
				);
				const resolvedPolicyVersion =
					typeof capturePolicy?.policyVersion === "string" &&
					capturePolicy.policyVersion.length > 0
						? capturePolicy.policyVersion
						: "1.0.0";
				const callbackPayload = toJsonValue({ ...body, manifest }) ?? null;
				yield* appendAuditEvent({
					action: "fulfillment_callback_received",
					actor,
					after: { manifestReceived: true },
					before: { manifestReceived: false },
					object: "fulfillment",
					reason: {
						callback: callbackPayload,
						idempotencyKey,
					},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "fulfillment_callback_received",
						locale: services.config.defaultLocale,
						payload: {
							callback: callbackPayload,
							manifestReceived: true,
						},
						policyVersion: resolvedPolicyVersion,
						requestId,
					}),
					idempotencyKey,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				const nowIso = yield* currentIsoTime;
				yield* services.repos.persistence.fulfillmentArtifacts
					.create({
						artifactManifest: {
							artifacts: manifest.artifacts,
							dataCategories: body.dataCategories,
							redactionsApplied: body.redactionsApplied,
							thirdPartyExclusions: body.thirdPartyExclusions,
						},
						createdAt: nowIso,
						deliveryLogs: [],
						deliveryPrepare: {},
						id: `manifest-${requestId}-${nowMs.toString(10)}`,
						requestId,
						tokenGate: {},
						updatedAt: nowIso,
						validationState: "pending",
					})
					.pipe(withTenant(tenantId));
				return accepted({
					requestId,
					status: "recorded",
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						toValidationFailure("Failed to record fulfilment callback.", error)
					)
				)
			),
		method: "POST",
		path: "/requests/:id/fulfilment/callback",
		protected: true,
		summary: "Fulfilment callback with manifest",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				const manifest = asObject(latest?.artifactManifest);
				return ok({
					artifacts: Array.isArray(manifest?.artifacts)
						? manifest.artifacts
						: [],
					dataCategories: toStringArrayValue(manifest?.dataCategories),
					redactionsApplied: toStringArrayValue(manifest?.redactionsApplied),
					thirdPartyExclusions: toStringArrayValue(
						manifest?.thirdPartyExclusions
					),
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(toValidationFailure("Failed to read manifest.", error))
				)
			),
		method: "GET",
		path: "/requests/:id/manifest",
		protected: true,
		summary: "Get fulfilment manifest",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);

				const { action } = yield* decodeJsonBody(
					request,
					ManifestValidationBodySchema
				);
				const requestedState: "approved" | "rejected" = action;
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [latest] = manifests;
				if (!latest) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfilment manifest found for this request.",
							reasonCode:
								backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
						})
					);
				}
				const updatedAt = yield* currentIsoTime;
				yield* services.repos.persistence.fulfillmentArtifacts
					.update(latest.id, {
						updatedAt,
						validationState: requestedState,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "manifest_validation_recorded",
					actor,
					after: { validation: requestedState },
					before: {
						validation: toStringValue(latest.validationState) ?? "pending",
					},
					object: "manifest",
					reason: {
						approvalRequired: services.config.enableManifestReview,
					},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "manifest_review_recorded",
						locale: services.config.defaultLocale,
						payload: {
							status: requestedState,
						},
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ??
						`manifest-validate:${requestId}:${requestedState}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({
					requestId,
					status: requestedState,
				});
			}),
		method: "POST",
		path: "/requests/:id/manifest/validate",
		protected: true,
		summary: "Validate fulfilment manifest",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const storage = services.adapterRegistry.resolveStorage();
				if (!storage) {
					return yield* Effect.fail(
						new InternalRuntimeError({
							message:
								"Storage adapter is not configured. File upload is unavailable.",
						})
					);
				}
				const bytes = yield* requireBinaryBody(request);
				if (bytes.byteLength === 0) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Empty file body.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_UPLOAD_FAILED.code,
						})
					);
				}
				const rawFileName =
					request.headers.get("x-artifact-filename") ?? "artifact";
				let fileName: string;
				try {
					fileName = decodeURIComponent(rawFileName);
				} catch {
					fileName = rawFileName;
				}
				const contentType =
					request.headers.get("x-artifact-content-type") ??
					"application/octet-stream";
				const title = request.headers.get("x-artifact-title") ?? fileName;
				let decodedTitle: string;
				try {
					decodedTitle = decodeURIComponent(title);
				} catch {
					decodedTitle = title;
				}
				const artifactType = request.headers.get("x-artifact-type") ?? "other";
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const artifactId = makeRequestId();
				const storageKey = manifestStorageKey({
					artifactId,
					fileName,
					requestId,
					tenantId,
				});
				const stored = yield* storage
					.putObject({
						bytes,
						contentType,
						key: storageKey,
						requestId,
					})
					.pipe(
						Effect.mapError(
							(err) =>
								new InternalRuntimeError({
									message: `Storage upload failed for request ${requestId}: ${getErrorMessage(err)}`,
								})
						)
					);
				const artifactRef = stored.reference.key;
				const artifactEntry = {
					description: "",
					id: artifactId,
					mediaType: contentType,
					sha256: "",
					sizeBytes: bytes.byteLength,
					sourceSystem: "manual_upload",
					storageKey: artifactRef,
					title: decodedTitle,
					type: artifactType,
				};
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [existing] = manifests;
				if (existing) {
					const currentManifest = asObject(existing.artifactManifest);
					const currentArtifacts = Array.isArray(currentManifest?.artifacts)
						? currentManifest.artifacts
						: [];
					currentArtifacts.push(artifactEntry);
					yield* services.repos.persistence.fulfillmentArtifacts
						.update(existing.id, {
							artifactManifest: {
								...currentManifest,
								artifacts: currentArtifacts,
							},
							updatedAt: now,
						})
						.pipe(withTenant(tenantId));
				} else {
					yield* services.repos.persistence.fulfillmentArtifacts
						.create({
							artifactManifest: {
								artifacts: [artifactEntry],
								dataCategories: [],
								redactionsApplied: [],
								thirdPartyExclusions: [],
							},
							createdAt: now,
							deliveryLogs: [],
							deliveryPrepare: {},
							id: `manifest-${requestId}-${(yield* currentTimeMs).toString(10)}`,
							requestId,
							tokenGate: {},
							updatedAt: now,
							validationState: "pending",
						})
						.pipe(withTenant(tenantId));
				}
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "manifest_artifact_uploaded",
						id: makeRequestId(),
						payload: {
							actor,
							artifactId,
							artifactKey: artifactRef,
							contentType,
							fileName,
							sizeBytes: bytes.byteLength,
							title: decodedTitle,
							type: artifactType,
						},
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "manifest_artifact_uploaded",
					actor,
					after: {
						artifactId,
						artifactKey: artifactRef,
						fileName,
						sizeBytes: bytes.byteLength,
						title: decodedTitle,
						type: artifactType,
					},
					before: {},
					object: "manifest_artifact",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					artifactId,
					artifactKey: artifactRef,
					requestId,
				});
			}),
		method: "POST",
		path: "/requests/:id/manifest/artifact/upload",
		protected: true,
		summary: "Upload binary manifest artifact file to storage",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const storage = services.adapterRegistry.resolveStorage();
				if (!storage) {
					return yield* Effect.fail(
						new InternalRuntimeError({
							message:
								"Storage adapter is not configured. File download is unavailable.",
						})
					);
				}
				const url = new URL(request.url, "http://localhost");
				const artifactId = url.searchParams.get("artifactId");
				if (!artifactId) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: 'Missing required query parameter "artifactId".',
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_DOWNLOAD_FAILED
									.code,
						})
					);
				}
				const tenantId = getTenantId(services);
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [existing] = manifests;
				if (!existing) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfilment manifest found for this request.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_DOWNLOAD_FAILED
									.code,
						})
					);
				}
				const currentManifest = asObject(existing.artifactManifest);
				const artifacts = Array.isArray(currentManifest?.artifacts)
					? (currentManifest.artifacts as Record<string, unknown>[])
					: [];
				const target = artifacts.find((artifact) => artifact.id === artifactId);
				if (!target) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: `Artifact "${artifactId}" not found in manifest.`,
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_DOWNLOAD_FAILED
									.code,
						})
					);
				}
				const key = asNonEmptyString(target.storageKey);
				if (!key) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: `Artifact "${artifactId}" is missing a storage key.`,
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_DOWNLOAD_FAILED
									.code,
						})
					);
				}
				if (
					!isTenantScopedManifestKey({
						key,
						requestId,
						tenantId,
					})
				) {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"Artifact key does not belong to this tenant-scoped request.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_DOWNLOAD_FAILED
									.code,
						})
					);
				}
				const stored = yield* storage.getObject(key).pipe(
					Effect.mapError(
						(err) =>
							new InternalRuntimeError({
								message: `Storage download failed for request ${requestId}: ${getErrorMessage(err)}`,
							})
					)
				);
				const fileName = key.split("/").pop() ?? "download";
				return new Response(new Blob([new Uint8Array(stored.bytes)]), {
					headers: {
						"content-disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
						"content-length": stored.bytes.byteLength.toString(),
						"content-type": stored.contentType,
					},
					status: 200,
				});
			}),
		method: "GET",
		path: "/requests/:id/manifest/artifact/download",
		protected: true,
		summary: "Download manifest artifact file from storage",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const artifactId = yield* parseParam(params, "artifactId");
				const services = yield* Effect.service(RuntimeServicesTag);
				const storage = services.adapterRegistry.resolveStorage();
				if (!storage) {
					return yield* Effect.fail(
						new InternalRuntimeError({
							message:
								"Storage adapter is not configured. File replacement is unavailable.",
						})
					);
				}
				const bytes = yield* requireBinaryBody(request);
				if (bytes.byteLength === 0) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "Empty file body.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_REPLACE_FAILED.code,
						})
					);
				}
				const rawFileName =
					request.headers.get("x-artifact-filename") ?? "artifact";
				let fileName: string;
				try {
					fileName = decodeURIComponent(rawFileName);
				} catch {
					fileName = rawFileName;
				}
				fileName = fileName.replaceAll(/[/\\]/g, "_").replaceAll("..", "_");
				const contentType =
					request.headers.get("x-artifact-content-type") ??
					"application/octet-stream";
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const now = yield* currentIsoTime;
				const manifests = yield* services.repos.persistence.fulfillmentArtifacts
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const [existing] = manifests;
				if (!existing) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: "No fulfilment manifest found for this request.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_REPLACE_FAILED.code,
						})
					);
				}
				const currentManifest = asObject(existing.artifactManifest);
				const artifacts = Array.isArray(currentManifest?.artifacts)
					? (currentManifest.artifacts as Record<string, unknown>[])
					: [];
				const targetIdx = artifacts.findIndex((a) => a.id === artifactId);
				if (targetIdx === -1) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: `Artifact "${artifactId}" not found in manifest.`,
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_REPLACE_FAILED.code,
						})
					);
				}
				const target = artifacts[targetIdx] as Record<string, unknown>;
				const existingStorageKey =
					typeof target.storageKey === "string" && target.storageKey.length > 0
						? target.storageKey
						: undefined;
				if (
					existingStorageKey &&
					!isTenantScopedManifestKey({
						key: existingStorageKey,
						requestId,
						tenantId,
					})
				) {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"Artifact key does not belong to this tenant-scoped request.",
							reasonCode:
								backendErrorCatalogByCode.MANIFEST_ARTIFACT_REPLACE_FAILED.code,
						})
					);
				}
				const storageKey =
					existingStorageKey ??
					manifestStorageKey({
						artifactId,
						fileName,
						requestId,
						tenantId,
					});
				yield* storage
					.putObject({
						bytes,
						contentType,
						key: storageKey,
						requestId,
					})
					.pipe(
						Effect.mapError(
							(err) =>
								new InternalRuntimeError({
									message: `Storage replace failed for request ${requestId}: ${getErrorMessage(err)}`,
								})
						)
					);
				const beforeSnapshot = {
					mediaType: asNonEmptyString(target.mediaType) ?? "",
					sizeBytes: Number.isFinite(target.sizeBytes)
						? (target.sizeBytes as number)
						: 0,
				};
				const newArtifacts = [...artifacts];
				newArtifacts[targetIdx] = {
					...target,
					mediaType: contentType,
					sizeBytes: bytes.byteLength,
					updatedAt: now,
				};
				const updatedManifest = structuredClone({
					...currentManifest,
					artifacts: newArtifacts,
				}) as JsonValue;
				yield* services.repos.persistence.fulfillmentArtifacts
					.update(existing.id, {
						artifactManifest: updatedManifest,
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* services.repos.persistence.timeline
					.append({
						createdAt: now,
						eventType: "manifest_artifact_replaced",
						id: makeRequestId(),
						payload: {
							actor,
							artifactId,
							artifactKey: storageKey,
							contentType,
							fileName,
							sizeBytes: bytes.byteLength,
						},
						requestId,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "manifest_artifact_replaced",
					actor,
					after: {
						artifactId,
						mediaType: contentType,
						sizeBytes: bytes.byteLength,
					},
					before: beforeSnapshot,
					object: "manifest_artifact",
					reason: {},
					requestId,
					tenantId,
				});
				return accepted({
					artifactId,
					artifactKey: storageKey,
					replaced: true,
					requestId,
				});
			}),
		method: "PUT",
		path: "/requests/:id/manifest/artifact/:artifactId/replace",
		protected: true,
		summary: "Replace existing manifest artifact file in storage",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const { message, grounds } = yield* decodeJsonBody(
					request,
					AppealSubmitBodySchema
				);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const appealId = makeRequestId();
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				const captureObj = asObject(current.capture);
				const evalObj = asObject(captureObj?.policyEvaluation);
				const decisionObj = asObject(evalObj?.decision);
				if (decisionObj?.appealEligible === false) {
					return yield* Effect.fail(
						new RequestValidationError({
							message:
								"Appeals are not available under the active policy for this request.",
							reasonCode:
								backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
						})
					);
				}
				const existingAppeals = Array.isArray(current.appeals)
					? current.appeals
					: [];
				const now = yield* currentIsoTime;
				const appealRecord: JsonValue = {
					createdAt: now,
					id: appealId,
					message,
					status: "submitted",
					submittedAt: now,
					...(grounds ? { grounds } : {}),
				};
				yield* services.repos.persistence.requests
					.update(requestId, {
						appeals: [...existingAppeals, appealRecord],
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "appeal_submitted",
					actor,
					after: { appealId, message, status: "submitted" },
					before: { status: "none" },
					object: "appeal",
					reason: {
						source: "api",
					},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "appeal_recorded",
						locale: services.config.defaultLocale,
						payload: { appealId, message, status: "submitted" },
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ??
						`appeal-submit:${requestId}:${appealId}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({
					appealId,
					requestId,
					status: "submitted",
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(toValidationFailure("Failed to create appeal.", error))
				)
			),
		method: "POST",
		path: "/requests/:id/appeals",
		protected: true,
		summary: "Create appeal",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				return ok(Array.isArray(current.appeals) ? current.appeals : []);
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(toValidationFailure("Failed to list appeals.", error))
				)
			),
		method: "GET",
		path: "/requests/:id/appeals",
		protected: true,
		summary: "List appeals",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const appealId = yield* parseParam(params, "appealId");
				const services = yield* Effect.service(RuntimeServicesTag);
				const { decision, explanation } = yield* decodeJsonBody(
					request,
					AppealDecideBodySchema
				);
				const actor = services.requestContext.actor?.id ?? "system";
				const tenantId = getTenantId(services);
				const current = yield* services.repos.persistence.requests
					.getById(requestId)
					.pipe(withTenant(tenantId));
				const existingAppeals = Array.isArray(current.appeals)
					? current.appeals
					: [];
				const appealIndex = existingAppeals.findIndex(
					(appeal) => asObject(appeal)?.id === appealId
				);
				if (appealIndex === -1) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: `Appeal ${appealId} was not found for request ${requestId}.`,
							reasonCode:
								backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
						})
					);
				}
				const now = yield* currentIsoTime;
				const DECISION_TO_STATUS: Readonly<Record<string, string>> = {
					approve: "approved",
					deny: "denied",
					partial: "partially_approved",
				};
				const nextStatus = DECISION_TO_STATUS[decision];
				const nextAppeals: readonly JsonValue[] = existingAppeals.map(
					(appeal, index) => {
						if (index !== appealIndex) {
							return appeal;
						}
						const currentAppeal = asObject(appeal) ?? {};
						return {
							...currentAppeal,
							decidedAt: now,
							decision,
							status: nextStatus,
							...(explanation ? { explanation } : {}),
						};
					}
				);
				yield* services.repos.persistence.requests
					.update(requestId, {
						appeals: nextAppeals,
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				yield* appendAuditEvent({
					action: "appeal_decided",
					actor,
					after: { appealId, decision, status: nextStatus ?? null },
					before: { appealId, decision: "pending" },
					object: "appeal",
					reason: {
						explanation: explanation ?? null,
						source: "api",
					},
					requestId,
					tenantId,
				});
				yield* emitNotificationEvent({
					draft: makeNotificationDraft({
						eventType: "appeal_recorded",
						locale: services.config.defaultLocale,
						payload: {
							appealId,
							decision,
							explanation: explanation ?? null,
							status: "decided",
						},
						requestId,
					}),
					idempotencyKey:
						getIdempotencyKey(request) ??
						`appeal-decide:${requestId}:${appealId}`,
					tenantId,
					workspaceId: getWorkspaceId(services),
				});
				return accepted({
					appealId,
					decision,
					requestId,
					status: "decided",
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(toValidationFailure("Failed to decide appeal.", error))
				)
			),
		method: "POST",
		path: "/requests/:id/appeals/:appealId/decide",
		protected: true,
		summary: "Decide appeal",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const notificationEvents =
					yield* services.repos.persistence.notificationEvents
						.listByRequestId(requestId)
						.pipe(withTenant(tenantId));
				const events = yield* Effect.forEach(notificationEvents, (event) =>
					Effect.gen(function* mapEvent() {
						const attempts =
							yield* services.repos.persistence.notificationDeliveryAttempts
								.listByNotificationEventId(event.id)
								.pipe(withTenant(tenantId));
						const attemptStatuses = attempts.map((attempt) => attempt.status);
						return {
							attempts: attempts.map((attempt) => ({
								attempt: attempt.attempt,
								channel: attempt.channel,
								createdAt: attempt.createdAt,
								destination: attempt.destination,
								error: attempt.error,
								responseCode: attempt.responseCode,
								status: attempt.status,
							})),
							createdAt: event.createdAt,
							eventId: event.id,
							eventType: event.eventType,
							status: resolveNotificationStatus(attemptStatuses),
						};
					})
				);
				return ok({
					events,
					requestId,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						toValidationFailure("Failed to list request notifications.", error)
					)
				)
			),
		method: "GET",
		path: "/requests/:id/notifications",
		protected: true,
		summary: "List request notifications",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const eventId = yield* parseParam(params, "eventId");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const original = yield* services.repos.persistence.notificationEvents
					.getById(eventId)
					.pipe(withTenant(tenantId));
				if (original.requestId !== requestId) {
					return yield* Effect.fail(
						new RequestValidationError({
							message: `Notification event ${eventId} does not belong to request ${requestId}.`,
						})
					);
				}
				const draft = makeNotificationDraft({
					eventType: original.eventType as Parameters<
						typeof makeNotificationDraft
					>[0]["eventType"],
					locale: original.locale,
					payload: original.payload,
					policyVersion: original.policyVersion,
					requestId: original.requestId,
				});
				yield* emitNotificationEvent({
					draft,
					idempotencyKey: `replay-${eventId}-${yield* currentTimeMs}`,
					tenantId,
				});
				return accepted({ eventId, status: "replayed" as const });
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						toValidationFailure("Failed to replay notification event.", error)
					)
				)
			),
		method: "POST",
		path: "/requests/:id/notifications/:eventId/replay",
		protected: true,
		summary: "Replay a notification event",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = yield* requireMatchedTenantScope({
					routeTenantId: yield* parseParam(params, "tenantId"),
					services,
				});
				const policies = yield* services.repos.persistence.retentionPolicies
					.list()
					.pipe(withTenant(tenantId));
				return ok(policies);
			}),
		method: "GET",
		path: "/tenants/:tenantId/retention",
		protected: true,
		summary: "Get tenant retention policy",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = yield* requireMatchedTenantScope({
					routeTenantId: yield* parseParam(params, "tenantId"),
					services,
				});
				const body = yield* decodeJsonBody(request, RetentionUpdateBodySchema);
				const now = yield* currentIsoTime;
				const record = yield* services.repos.persistence.retentionPolicies
					.upsert({
						class: body.class,
						id: body.id ?? makeRequestId(),
						legalHoldEnabled: body.legalHoldEnabled,
						maxDays: body.maxDays,
						minDays: body.minDays,
						purgeEnabled: body.purgeEnabled,
						updatedAt: now,
					})
					.pipe(withTenant(tenantId));
				const actor = services.requestContext.actor?.id ?? "system";
				yield* appendAuditEvent({
					action: "retention_policy_upserted",
					actor,
					after: {
						class: record.class,
						maxDays: record.maxDays,
						minDays: record.minDays,
					},
					before: {},
					object: "retention_policy",
					reason: {},
					tenantId,
				});
				return accepted(record);
			}),
		method: "PUT",
		path: "/tenants/:tenantId/retention",
		protected: true,
		summary: "Update tenant retention policy",
	},
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const formatParam = new URL(request.url).searchParams.get("format");
				const format = formatParam === "csv" ? "csv" : "jsonl";
				const exported = yield* exportAuditEvents({
					format,
					requestId,
					tenantId: getTenantId(services),
				});
				return accepted({
					events: exported.events,
					format: exported.format,
					requestId: exported.requestId,
					rootHash: exported.rootHash,
				});
			}),
		method: "GET",
		path: "/requests/:id/audit/export",
		protected: true,
		summary: "Export audit events",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const verification = yield* verifyAuditChain({
					requestId,
					tenantId: getTenantId(services),
				});
				return accepted({
					mismatches: verification.mismatches,
					status: verification.verified ? "verified" : "failed",
					verified: verification.verified,
				});
			}),
		method: "POST",
		path: "/requests/:id/audit/verify",
		protected: true,
		summary: "Verify audit chain",
	},
];

/**
 * Request route definitions with staff-only and subject-owned audience checks
 * enforced before handler execution.
 */
export const requestRoutes: readonly RouteDefinition[] = rawRequestRoutes.map(
	withRequestRouteAuthorization
);

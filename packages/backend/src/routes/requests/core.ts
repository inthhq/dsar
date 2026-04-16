import * as Effect from "effect/Effect";

import { explainRequestClock } from "../../lifecycle/service";
import { backendErrorCatalogByCode } from "../../types/error-codes";
import { RequestValidationError } from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import { ok, parseParam } from "../helpers";
import type { RouteDefinition } from "../types";
import {
	asObject,
	createRequestHandler,
	currentTimeMs,
	DAY_MS,
	dateAsEpoch,
	DEFAULT_LIST_LIMIT,
	getTenantId,
	parseIntParam,
	parseRequestSortBy,
	parseRequestSortOrder,
	sortTimelineEvents,
	toStringValue,
	toValidationFailure,
	withTenant,
} from "./shared";

/** Core request route definitions covering create, list, detail, and timeline flows. */
export const coreRequestRoutes: readonly RouteDefinition[] = [
	{
		handler: createRequestHandler({}),
		method: "POST",
		path: "/requests",
		protected: true,
		summary: "Create request",
	},
	{
		handler: createRequestHandler({ includeDueAt: true }),
		method: "POST",
		path: "/requests/capture",
		protected: true,
		summary: "Capture request intake",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* handler() {
				const { searchParams } = new URL(request.url);
				const statusFilter = searchParams.get("status");
				const statusValues = statusFilter
					? statusFilter
							.split(",")
							.map((value) => value.trim())
							.filter((value) => value.length > 0)
					: [];
				const sortBy = parseRequestSortBy(searchParams.get("sortBy"));
				const sortOrder = parseRequestSortOrder(searchParams.get("sortOrder"));
				const limit = parseIntParam(
					searchParams.get("limit"),
					DEFAULT_LIST_LIMIT,
					1,
					500
				);
				const offset = parseIntParam(
					searchParams.get("offset"),
					0,
					0,
					Number.MAX_SAFE_INTEGER
				);
				const atRiskDaysValue = searchParams.get("atRiskDays");
				const atRiskDays = atRiskDaysValue
					? parseIntParam(atRiskDaysValue, 0, 0, 3650)
					: undefined;
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const allRequests = yield* services.repos.persistence.requests
					.list({
						limit: 500,
						offset: 0,
					})
					.pipe(withTenant(tenantId));
				const nowMs = yield* currentTimeMs;
				const atRiskThreshold =
					typeof atRiskDays === "number"
						? nowMs + atRiskDays * DAY_MS
						: undefined;
				const filtered = allRequests.filter((record) => {
					if (
						statusValues.length > 0 &&
						!statusValues.includes(record.status)
					) {
						return false;
					}
					if (atRiskThreshold === undefined) {
						return true;
					}
					return dateAsEpoch(record.dueAt) <= atRiskThreshold;
				});
				const sorted = [...filtered].toSorted((left, right) => {
					if (sortBy === "status") {
						const value = left.status.localeCompare(right.status);
						return sortOrder === "asc" ? value : value * -1;
					}
					const leftValue =
						sortBy === "dueAt"
							? dateAsEpoch(left.dueAt)
							: dateAsEpoch(left.receivedAt);
					const rightValue =
						sortBy === "dueAt"
							? dateAsEpoch(right.dueAt)
							: dateAsEpoch(right.receivedAt);
					const value = leftValue - rightValue;
					return sortOrder === "asc" ? value : value * -1;
				});
				const items = sorted.slice(offset, offset + limit).map((record) => {
					const capture = asObject(record.capture);
					const intakeSource = asObject(capture?.intakeSource);
					return {
						authority: record.authority,
						dueAt: record.dueAt,
						id: record.id,
						intakeSource: intakeSource
							? {
									rawContextRef: toStringValue(intakeSource.rawContextRef),
									receivedAt:
										toStringValue(intakeSource.receivedAt) ?? record.receivedAt,
									type: toStringValue(intakeSource.type) ?? "api",
								}
							: undefined,
						receivedAt: record.receivedAt,
						requestor: record.requestor,
						status: record.status,
					};
				});
				return ok({
					items,
					limit,
					offset,
					sortBy,
					sortOrder,
					total: filtered.length,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(toValidationFailure("Failed to list requests.", error))
				)
			),
		method: "GET",
		path: "/requests",
		protected: true,
		summary: "List requests queue",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const services = yield* Effect.service(RuntimeServicesTag);
				const requestId = yield* parseParam(params, "id");
				const tenantId = getTenantId(services);
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
				const capture = asObject(current.capture);
				return ok({
					appeals: Array.isArray(current.appeals) ? current.appeals : [],
					authority: current.authority,
					capture: current.capture,
					clockMode: current.clockMode,
					dueAt: current.dueAt,
					id: current.id,
					intakeSource: capture?.intakeSource,
					receivedAt: current.receivedAt,
					requestor: current.requestor,
					status: current.status,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						error instanceof RequestValidationError
							? error
							: toValidationFailure("Failed to get request.", error)
					)
				)
			),
		method: "GET",
		path: "/requests/:id",
		protected: true,
		summary: "Get request",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const tenantId = getTenantId(services);
				const timeline = yield* services.repos.persistence.timeline
					.listByRequestId(requestId)
					.pipe(withTenant(tenantId));
				const sortedTimeline = sortTimelineEvents(timeline);
				return ok({
					events: sortedTimeline.map((event) => ({
						createdAt: event.createdAt,
						eventType: event.eventType,
						id: event.id,
						payload: event.payload,
					})),
					requestId,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						toValidationFailure("Failed to list request timeline.", error)
					)
				)
			),
		method: "GET",
		path: "/requests/:id/timeline",
		protected: true,
		summary: "Get request timeline",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const requestId = yield* parseParam(params, "id");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = services.requestContext.actor?.id ?? "system";
				const explained = yield* explainRequestClock({
					actor,
					requestId,
					tenantId: getTenantId(services),
				});
				return ok(explained);
			}),
		method: "GET",
		path: "/requests/:id/clock/explain",
		protected: true,
		summary: "Explain legal clock",
	},
];

/* oxlint-disable func-style -- Effect-based routes use callback style */
import { asNonEmptyString, asObject, isRecord } from "@dsar/guards";
import type { JsonValue } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import { PolicyPacksLive, resolveActivePolicyPack } from "@dsar/policy-packs";
import type { PolicyPackVersionRecord } from "@dsar/policy-packs";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { captureRequestLifecycle } from "../../lifecycle/service";
import { runInitialPolicyEvaluation } from "../../services/policy-evaluation/evaluate";
import { backendErrorCatalogByCode } from "../../types/error-codes";
import {
	ForbiddenRequestError,
	RequestValidationError,
	UnauthorizedRequestError,
} from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import {
	authorizeRequestAccess,
	requireRequestActor,
	requireRequestTenantId,
} from "../authz";
import { accepted, ok, parseParam, requireJson } from "../helpers";
import type { RouteDefinition } from "../types";

/** Effect that yields the current time as an ISO-8601 string. */
export const currentIsoTime: Effect.Effect<string> =
	Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms).toISOString()));

/** Effect that yields the current wall-clock time in milliseconds. */
export const currentTimeMs: Effect.Effect<number> =
	Clock.currentTimeMillis.pipe(Effect.map(Number));

/**
 * Returns an ISO timestamp shifted by the provided millisecond offset.
 *
 * @param offsetMs - Milliseconds to add to the current time.
 * @returns An effect that yields the shifted ISO-8601 timestamp.
 */
export const isoTimeOffset = (offsetMs: number): Effect.Effect<string> =>
	currentTimeMs.pipe(Effect.map((ms) => new Date(ms + offsetMs).toISOString()));

/**
 * Ensures a request-creation payload contains `intakeSource`.
 *
 * @param payload - Request payload to validate.
 * @returns An effect that succeeds with the payload when intake source is present.
 */
export const requireIntakeSource = (payload: unknown) => {
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("intakeSource" in payload) ||
		typeof payload.intakeSource !== "object" ||
		payload.intakeSource === null
	) {
		return Effect.fail(
			new RequestValidationError({
				message: "Request creation requires intakeSource.",
				reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
			})
		);
	}
	return Effect.succeed(payload);
};

/**
 * Resolves the authenticated tenant id from runtime services.
 *
 * @param services - Runtime services containing request context.
 * @returns The authenticated tenant id.
 */
export const getTenantId = (services: {
	readonly requestContext: { readonly tenantId?: string };
}) => {
	const { tenantId } = services.requestContext;
	if (!tenantId) {
		throw new UnauthorizedRequestError({
			message: "Missing tenant context for authenticated request.",
		});
	}
	return tenantId;
};

/**
 * Reads the idempotency key header from an incoming request.
 *
 * @param request - Incoming HTTP request.
 * @returns The idempotency key when supplied by the client.
 */
export const getIdempotencyKey = (request: Request) =>
	request.headers.get("x-idempotency-key") ?? undefined;

/**
 * Resolves the authenticated workspace id from runtime services.
 *
 * @param services - Runtime services containing request context.
 * @returns The authenticated workspace id when present.
 */
export const getWorkspaceId = (services: {
	readonly requestContext: { readonly workspaceId?: string };
}) => services.requestContext.workspaceId ?? undefined;

/**
 * Verifies that a route-scoped tenant id matches the authenticated tenant context.
 *
 * @param input - Route tenant id and runtime services used for validation.
 * @returns An effect that yields the authenticated tenant id when scopes match.
 */
export const requireMatchedTenantScope = (input: {
	readonly routeTenantId: string;
	readonly services: {
		readonly requestContext: { readonly tenantId?: string };
	};
}) =>
	Effect.gen(function* requireMatchedTenantScopeEffect() {
		const authenticatedTenantId = yield* requireRequestTenantId(
			input.services.requestContext
		);
		if (input.routeTenantId !== authenticatedTenantId) {
			return yield* Effect.fail(
				new ForbiddenRequestError({
					details: {
						authenticatedTenantId,
						routeTenantId: input.routeTenantId,
					},
					message:
						"Tenant-scoped route parameter must match the authenticated tenant context.",
					reasonCode:
						backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
				})
			);
		}
		return authenticatedTenantId;
	});

/**
 * Resolves the most useful error message from an unknown thrown value.
 *
 * @param error - Unknown error value.
 * @returns A human-readable error message.
 */
export const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (error !== null && typeof error === "object" && "message" in error) {
		const { message } = error as { readonly message?: unknown };
		if (message !== null && message !== undefined) {
			return String(message);
		}
	}
	return String(error);
};

const isJsonValue = (value: unknown): value is JsonValue => {
	if (value === null) {
		return true;
	}
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((entry) => isJsonValue(entry));
	}
	if (isRecord(value)) {
		return Object.values(value).every((entry) => isJsonValue(entry));
	}
	return false;
};

/**
 * Narrows an unknown value to a JSON-compatible value when possible.
 *
 * @param value - Candidate value to normalize.
 * @returns The JSON-compatible value, or `undefined` when not serializable.
 */
export const toJsonValue = (value: unknown) =>
	isJsonValue(value) ? value : undefined;

/**
 * Requires a request payload to contain a jurisdiction.
 *
 * @param payload - Request payload to inspect.
 * @returns An effect that yields the jurisdiction string.
 */
export const requireJurisdiction = (
	payload: unknown
): Effect.Effect<string, RequestValidationError> => {
	const jurisdiction = asNonEmptyString(asObject(payload)?.jurisdiction);
	return jurisdiction
		? Effect.succeed(jurisdiction)
		: Effect.fail(
				new RequestValidationError({
					message: "Request creation requires jurisdiction.",
					reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
				})
			);
};

const enrichPayloadWithPolicy = (
	payload: unknown,
	resolved: PolicyPackVersionRecord,
	policyEvaluation?: unknown
): unknown => {
	const { clock } = resolved.pack.sections;
	const policy = {
		clarificationEffect: clock.clarificationEffect,
		maxAdditionalDays: clock.extension.maxAdditionalDays,
		policyPack: resolved.pack.packId,
		policyVersion: resolved.version,
		responseDeadlineDays: clock.responseDeadlineDays,
		verificationEffect: clock.verificationEffect,
	};
	const base =
		typeof payload === "object" && payload !== null
			? { ...payload, policy }
			: { policy };
	if (policyEvaluation) {
		return { ...base, policyEvaluation };
	}
	return base;
};

const enrichCaptureWithPolicy = (input: {
	readonly payload: unknown;
	readonly jurisdiction: string;
	readonly tenantId: string;
	readonly workspaceId: string | undefined;
}) =>
	Effect.gen(function* enrichCapture() {
		const resolvedPack = yield* resolveActivePolicyPack({
			jurisdiction: input.jurisdiction,
			scope: {
				tenantId: input.tenantId,
				workspaceId: input.workspaceId,
			},
		}).pipe(Effect.provide(PolicyPacksLive));
		const intakeReceivedAt = asNonEmptyString(
			asObject(asObject(input.payload)?.intakeSource)?.receivedAt
		);
		const receivedAt = intakeReceivedAt ?? (yield* currentIsoTime);
		const evaluation = yield* runInitialPolicyEvaluation({
			capture: input.payload,
			jurisdiction: input.jurisdiction,
			receivedAt,
			resolvedPack,
		});
		return enrichPayloadWithPolicy(input.payload, resolvedPack, evaluation);
	});

/** Supported request queue sort fields. */
export type RequestSortBy = "dueAt" | "receivedAt" | "status";
/** Supported request queue sort directions. */
export type RequestSortOrder = "asc" | "desc";

/** Default page size for request listing endpoints. */
export const DEFAULT_LIST_LIMIT = 50;
/** Maximum page size accepted by request listing endpoints. */
export const MAX_LIST_LIMIT = 500;
/** Number of milliseconds in a UTC day. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parses an integer query parameter with clamping and fallback behavior.
 *
 * @param value - Raw query parameter value.
 * @param fallback - Fallback value when parsing fails.
 * @param min - Minimum accepted value.
 * @param max - Maximum accepted value.
 * @returns The parsed and clamped integer value.
 */
export const parseIntParam = (
	value: string | null,
	fallback: number,
	min: number,
	max: number
) => {
	if (value === null) {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, parsed));
};

/**
 * Parses the request queue sort field from query params.
 *
 * @param value - Raw sort field query parameter.
 * @returns A supported request sort field.
 */
export const parseRequestSortBy = (value: string | null): RequestSortBy => {
	if (value === "dueAt" || value === "status") {
		return value;
	}
	return "receivedAt";
};

/**
 * Parses the request queue sort direction from query params.
 *
 * @param value - Raw sort direction query parameter.
 * @returns A supported request sort direction.
 */
export const parseRequestSortOrder = (value: string | null): RequestSortOrder =>
	value === "asc" ? "asc" : "desc";

/**
 * Converts an ISO timestamp to epoch milliseconds.
 *
 * @param value - ISO-like date string.
 * @returns Epoch milliseconds, or `0` when parsing fails.
 */
export const dateAsEpoch = (value: string) => {
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Returns a value when it is a string.
 *
 * @param value - Candidate value to narrow.
 * @returns The string value, or `undefined` when not a string.
 */
export const toStringValue = (value: unknown) =>
	typeof value === "string" ? value : undefined;

/**
 * Returns only string entries from an unknown array-like value.
 *
 * @param value - Candidate array-like value.
 * @returns A readonly array containing only string entries.
 */
export const toStringArrayValue = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];

/**
 * Normalizes a verification method to the supported route values.
 *
 * @param value - Raw verification method value.
 * @returns A supported verification method.
 */
export const toVerificationMethod = (
	value: unknown
): "existing_auth" | "email_link" | "manual" => {
	if (
		value === "existing_auth" ||
		value === "email_link" ||
		value === "manual"
	) {
		return value;
	}
	return "manual";
};

/**
 * Collapses per-attempt notification statuses into a single event status.
 *
 * @param statuses - Attempt statuses for a notification event.
 * @returns Aggregate notification event status.
 */
export const resolveNotificationStatus = (
	statuses: readonly ("pending" | "delivered" | "failed" | "skipped")[]
): "generated" | "delivered" | "failed" | "skipped" => {
	if (statuses.includes("delivered")) {
		return "delivered";
	}
	if (statuses.includes("failed")) {
		return "failed";
	}
	if (statuses.includes("skipped")) {
		return "skipped";
	}
	return "generated";
};

/**
 * Wraps unknown failures in a request validation error with cause details.
 *
 * @param message - Message to expose on the validation error.
 * @param error - Original thrown value.
 * @returns A normalized request validation error.
 */
export const toValidationFailure = (
	message: string,
	error: unknown
): RequestValidationError => {
	if (error instanceof RequestValidationError) {
		return error;
	}
	return new RequestValidationError({
		details: {
			cause: getErrorMessage(error),
		},
		message,
		reasonCode: backendErrorCatalogByCode.INTERNAL_RUNTIME_ERROR.code,
	});
};

const TIMELINE_EVENT_PRECEDENCE: Readonly<Record<string, number>> = {
	appeal_decided: 100,
	appeal_submitted: 90,
	captured: 10,
	clarification_received: 50,
	clarification_requested: 40,
	extension_applied: 60,
	fulfilled: 80,
	refused: 70,
	verification_requested: 20,
	verification_resolved: 30,
};

interface TimelineEvent {
	readonly id: string;
	readonly createdAt: string;
	readonly eventType: string;
}

/**
 * Sorts timeline events by timestamp, precedence, and stable id ordering.
 *
 * @param events - Timeline events to sort.
 * @typeParam T - Concrete timeline event shape being sorted.
 * @returns A new array ordered for deterministic timeline rendering.
 */
export const sortTimelineEvents = <T extends TimelineEvent>(
	events: readonly T[]
): readonly T[] =>
	[...events].toSorted((left, right) => {
		const byCreatedAt =
			dateAsEpoch(left.createdAt) - dateAsEpoch(right.createdAt);
		if (byCreatedAt !== 0) {
			return byCreatedAt;
		}
		const leftPrecedence =
			TIMELINE_EVENT_PRECEDENCE[left.eventType] ?? Number.MAX_SAFE_INTEGER;
		const rightPrecedence =
			TIMELINE_EVENT_PRECEDENCE[right.eventType] ?? Number.MAX_SAFE_INTEGER;
		const byPrecedence = leftPrecedence - rightPrecedence;
		if (byPrecedence !== 0) {
			return byPrecedence;
		}
		return left.id.localeCompare(right.id);
	});

/**
 * Creates a request-capture route handler with optional due-date inclusion.
 *
 * @param options - Handler options controlling response payload shape.
 * @returns Route handler that validates, enriches, and captures a request.
 */
export const createRequestHandler =
	(options: { includeDueAt?: boolean }) =>
	({ request }: { request: Request }) =>
		Effect.gen(function* handler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const payload = yield* requireJson(request);
			yield* requireIntakeSource(payload);
			const jurisdiction = yield* requireJurisdiction(payload);
			const enrichedPayload = yield* enrichCaptureWithPolicy({
				jurisdiction,
				payload,
				tenantId: getTenantId(services),
				workspaceId: getWorkspaceId(services),
			});
			const actor = services.requestContext.actor?.id ?? "system";
			const created = yield* captureRequestLifecycle({
				actor,
				payload: enrichedPayload,
				tenantId: getTenantId(services),
				workspaceId: getWorkspaceId(services),
			});
			return accepted({
				...(options.includeDueAt ? { dueAt: created.dueAt } : {}),
				id: created.id,
				receivedAt: created.receivedAt,
				status: created.status,
			});
		});

const SUBJECT_OWNED_ROUTE_KEYS = new Set([
	"GET /requests/:id",
	"GET /requests/:id/timeline",
	"POST /requests/:id/clarifications/receive",
	"POST /requests/:id/authority/submit",
	"POST /requests/:id/verification/request",
	"POST /requests/:id/verification/evidence",
	"POST /requests/:id/verification/evidence/upload",
	"GET /requests/:id/verification-case",
	"POST /requests/:id/delivery/address/verify",
	"POST /requests/:id/delivery/step-up/challenge",
	"POST /requests/:id/delivery/step-up/complete",
	"GET /requests/:id/artifacts/:artifactId/download",
	"GET /requests/:id/manifest",
	"GET /requests/:id/manifest/artifact/download",
	"POST /requests/:id/appeals",
	"GET /requests/:id/appeals",
]);

const UNRESTRICTED_ROUTE_KEYS = new Set([
	"POST /requests",
	"POST /requests/capture",
]);

const getRouteKey = (route: RouteDefinition): string =>
	`${route.method} ${route.path}`;

/**
 * Wraps a request route with authorization appropriate to its ownership model.
 *
 * @param route - Route definition to wrap.
 * @returns Route definition with request authorization applied when needed.
 */
export const withRequestRouteAuthorization = (
	route: RouteDefinition
): RouteDefinition => {
	if (!route.protected) {
		return route;
	}
	const routeKey = getRouteKey(route);
	if (UNRESTRICTED_ROUTE_KEYS.has(routeKey)) {
		return route;
	}
	if (!SUBJECT_OWNED_ROUTE_KEYS.has(routeKey)) {
		return {
			...route,
			handler: (input) =>
				Effect.gen(function* authorizeStaffOnlyHandler() {
					const services = yield* Effect.service(RuntimeServicesTag);
					const actor = yield* requireRequestActor(services.requestContext);
					yield* authorizeRequestAccess({
						actor,
						allowSubjectOwner: false,
						operatorMessage:
							"This route is reserved for operator or service principals.",
						requestId: input.params.tenantId ?? input.params.id ?? route.path,
						services,
					});
					return yield* route.handler(input);
				}),
		};
	}
	return {
		...route,
		handler: (input) =>
			Effect.gen(function* authorizeSubjectOwnedHandler() {
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = yield* requireRequestActor(services.requestContext);
				const requestId = yield* parseParam(input.params, "id");
				yield* authorizeRequestAccess({
					actor,
					allowSubjectOwner: true,
					operatorMessage:
						"This route requires an operator, service principal, or the owning subject.",
					requestId,
					services,
				});
				return yield* route.handler(input);
			}),
	};
};

export { asNonEmptyString, asObject, ok, withTenant };

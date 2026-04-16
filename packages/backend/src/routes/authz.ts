import { asNonEmptyString, asObject } from "@dsar/guards";
import type { RequestRecord } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { backendErrorCatalogByCode } from "../types/error-codes";
import {
	ForbiddenRequestError,
	RequestValidationError,
	UnauthorizedRequestError,
} from "../types/errors";
import type {
	RequestActor,
	RequestPrincipalKind,
	RuntimeRequestContext,
	RuntimeServices,
} from "../types/runtime";

type ServicesWithRequestContext = Pick<
	RuntimeServices,
	"repos" | "requestContext"
>;

const toRequestValidationError = (requestId: string): RequestValidationError =>
	new RequestValidationError({
		message: `Request ${requestId} was not found.`,
		reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
	});

const normalizeIdentifier = (value: string): string =>
	value.trim().toLowerCase();

const isAllowedPrincipalKind = (
	principalKind: RequestPrincipalKind,
	allowedKinds: readonly RequestPrincipalKind[]
): boolean => allowedKinds.includes(principalKind);

const getRequestSubjectIdentifiers = (
	record: RequestRecord
): readonly string[] => {
	const capture = asObject(record.capture);
	const subject = asObject(capture?.subject);
	const requestor = asObject(record.requestor);
	return [
		asNonEmptyString(subject?.subjectId),
		asNonEmptyString(subject?.externalRef),
		asNonEmptyString(requestor?.email),
	]
		.filter((value): value is string => typeof value === "string")
		.map(normalizeIdentifier);
};

const getActorSubjectIdentifiers = (actor: RequestActor): readonly string[] => {
	const identifiers = [actor.id, actor.email]
		.filter((value): value is string => typeof value === "string")
		.map(normalizeIdentifier);
	return [...new Set(identifiers)];
};

/**
 * Requires an authenticated request actor in the runtime request context.
 *
 * @param requestContext - Request context carrying the optional authenticated actor.
 * @returns An Effect that succeeds with the authenticated actor or fails when actor context is absent.
 */
export const requireRequestActor = (
	requestContext: Pick<RuntimeRequestContext, "actor">
): Effect.Effect<RequestActor, UnauthorizedRequestError> =>
	requestContext.actor
		? Effect.succeed(requestContext.actor)
		: Effect.fail(
				new UnauthorizedRequestError({
					message: "Missing actor context for protected request.",
				})
			);

/**
 * Requires a tenant scope on the current request context.
 *
 * @param requestContext - Request context carrying the optional tenant id.
 * @returns An Effect that succeeds with the tenant id or fails when tenant scoping is missing.
 */
export const requireRequestTenantId = (
	requestContext: Pick<RuntimeRequestContext, "tenantId">
): Effect.Effect<string, UnauthorizedRequestError> =>
	requestContext.tenantId
		? Effect.succeed(requestContext.tenantId)
		: Effect.fail(
				new UnauthorizedRequestError({
					message: "Missing tenant context for authenticated request.",
				})
			);

/**
 * Requires the current actor to match one of the allowed principal kinds.
 *
 * @param input - Actor plus allowed principal kinds and the failure message to surface on mismatch.
 * @returns An Effect that succeeds when the actor principal kind is allowed for the route.
 */
export const requirePrincipalKinds = (input: {
	readonly actor: RequestActor;
	readonly allowedKinds: readonly RequestPrincipalKind[];
	readonly message: string;
}): Effect.Effect<void, ForbiddenRequestError> =>
	isAllowedPrincipalKind(input.actor.principalKind, input.allowedKinds)
		? Effect.void
		: Effect.fail(
				new ForbiddenRequestError({
					details: {
						allowedKinds: input.allowedKinds,
						principalKind: input.actor.principalKind,
					},
					message: input.message,
					reasonCode:
						backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
				})
			);

/**
 * Loads a request record inside the authenticated tenant scope.
 *
 * @param services - Runtime services carrying persistence and request context.
 * @param requestId - Request identifier to load from tenant-scoped persistence.
 * @returns An Effect that succeeds with the request record or fails when tenant scope or record lookup fails.
 */
export const loadTenantScopedRequest = (
	services: ServicesWithRequestContext,
	requestId: string
): Effect.Effect<
	RequestRecord,
	RequestValidationError | UnauthorizedRequestError
> =>
	Effect.gen(function* loadRequestEffect() {
		const tenantId = yield* requireRequestTenantId(services.requestContext);
		return yield* services.repos.persistence.requests.getById(requestId).pipe(
			withTenant(tenantId),
			Effect.mapError(() => toRequestValidationError(requestId))
		);
	});

/**
 * Requires a subject principal to own the target request before continuing.
 *
 * @param input - Actor, loaded request record, and request id used for ownership enforcement.
 * @returns An Effect that succeeds when the subject owns the request and fails otherwise.
 */
export const requireSubjectRequestOwnership = (input: {
	readonly actor: RequestActor;
	readonly record: RequestRecord;
	readonly requestId: string;
}): Effect.Effect<void, ForbiddenRequestError> => {
	const actorIdentifiers = new Set(getActorSubjectIdentifiers(input.actor));
	const owned = getRequestSubjectIdentifiers(input.record).some((identifier) =>
		actorIdentifiers.has(identifier)
	);
	return owned
		? Effect.void
		: Effect.fail(
				new ForbiddenRequestError({
					details: {
						principalKind: input.actor.principalKind,
						requestId: input.requestId,
					},
					message:
						"Authenticated subject does not own the requested DSAR record.",
					reasonCode:
						backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
				})
			);
};

/**
 * Authorizes request access for staff and subject-owned route audiences.
 *
 * @param input - Actor, services, route request id, and route audience configuration.
 * @returns An Effect that succeeds when the actor may access the target request.
 */
export const authorizeRequestAccess = (input: {
	readonly actor: RequestActor;
	readonly services: ServicesWithRequestContext;
	readonly requestId: string;
	readonly allowSubjectOwner: boolean;
	readonly operatorMessage: string;
}): Effect.Effect<
	void,
	ForbiddenRequestError | RequestValidationError | UnauthorizedRequestError
> =>
	Effect.gen(function* authorizeRequestAccessEffect() {
		if (input.actor.principalKind === "subject") {
			if (!input.allowSubjectOwner) {
				return yield* Effect.fail(
					new ForbiddenRequestError({
						details: {
							principalKind: input.actor.principalKind,
							requestId: input.requestId,
						},
						message: input.operatorMessage,
						reasonCode:
							backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
					})
				);
			}
			const record = yield* loadTenantScopedRequest(
				input.services,
				input.requestId
			);
			return yield* requireSubjectRequestOwnership({
				actor: input.actor,
				record,
				requestId: input.requestId,
			});
		}
		return yield* requirePrincipalKinds({
			actor: input.actor,
			allowedKinds: ["operator", "service"],
			message: input.operatorMessage,
		});
	});

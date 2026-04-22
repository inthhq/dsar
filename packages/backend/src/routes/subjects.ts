import { asNonEmptyString } from "@dsar/guards";
import type { RequestSubjectCursor } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import { IsoTimestampSchema } from "@dsar/schema";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { backendErrorCatalogByCode } from "../types/error-codes";
import { ForbiddenRequestError, RequestValidationError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "./authz";
import { ok, parseParam } from "./helpers";
import {
	MAX_LIST_LIMIT,
	parseIntParam,
	toValidationFailure,
} from "./requests/shared";
import type { RouteDefinition } from "./types";

const DEFAULT_SUBJECT_PAGE_SIZE = 50;
const normalizeIdentifier = (value: string): string =>
	value.trim().toLowerCase();

const parseStatusFilter = (value: string | null): readonly string[] =>
	value
		? value
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		: [];

const parseIsoTimestampParam = (
	value: string | null,
	paramName: "created_after" | "created_before"
): Effect.Effect<string | undefined, RequestValidationError> => {
	if (!value || value.trim().length === 0) {
		return Effect.succeed();
	}
	const decoded = Schema.decodeUnknownExit(IsoTimestampSchema)(value);
	if (Exit.isFailure(decoded)) {
		return Effect.fail(
			new RequestValidationError({
				message: `${paramName} must be a valid ISO-8601 timestamp.`,
				reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
			})
		);
	}
	return Effect.succeed(new Date(value).toISOString());
};

const encodeCursor = (cursor: RequestSubjectCursor): string =>
	Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (
	value: string | null
): RequestSubjectCursor | undefined => {
	if (!value) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(value, "base64url").toString("utf8")
		);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as { readonly createdAt?: unknown }).createdAt ===
				"string" &&
			typeof (parsed as { readonly id?: unknown }).id === "string"
		) {
			return {
				createdAt: (parsed as { readonly createdAt: string }).createdAt,
				id: (parsed as { readonly id: string }).id,
			};
		}
	} catch {
		return undefined;
	}
	return undefined;
};

/**
 * Route definitions for the `/subjects` namespace: retrieving
 * data-subject profiles and their associated DSAR requests.
 */
export const subjectRoutes: readonly RouteDefinition[] = [
	{
		handler: ({ params, request }) =>
			Effect.gen(function* handler() {
				const subjectId = yield* parseParam(params, "subjectId");
				const normalizedSubjectId = normalizeIdentifier(subjectId);
				const { searchParams } = new URL(request.url);
				const limit = parseIntParam(
					searchParams.get("limit"),
					DEFAULT_SUBJECT_PAGE_SIZE,
					1,
					MAX_LIST_LIMIT
				);
				const cursor = decodeCursor(searchParams.get("cursor"));
				const cursorParam = searchParams.get("cursor");
				if (cursorParam && !cursor) {
					return yield* Effect.fail(
						toValidationFailure(
							"Invalid subject pagination cursor.",
							new Error("Cursor must be a cursor returned by this endpoint.")
						)
					);
				}
				const createdAfter = yield* parseIsoTimestampParam(
					searchParams.get("created_after"),
					"created_after"
				);
				const createdBefore = yield* parseIsoTimestampParam(
					searchParams.get("created_before"),
					"created_before"
				);
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = yield* requireRequestActor(services.requestContext);
				let subjectIdentifiers = new Set([normalizedSubjectId]);
				if (actor.principalKind === "subject") {
					subjectIdentifiers = new Set(
						[actor.id, actor.email]
							.filter((value): value is string => typeof value === "string")
							.map(normalizeIdentifier)
					);
					if (!subjectIdentifiers.has(normalizedSubjectId)) {
						return yield* Effect.fail(
							new ForbiddenRequestError({
								message:
									"Authenticated subject cannot read another subject profile.",
								reasonCode:
									backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
							})
						);
					}
				} else {
					yield* requirePrincipalKinds({
						actor,
						allowedKinds: ["operator", "service"],
						message:
							"This route is reserved for operator, service, or the matching subject principal.",
					});
				}
				const tenantId = yield* requireRequestTenantId(services.requestContext);
				const page = yield* services.repos.persistence.requests
					.listBySubject({
						createdAfter,
						createdBefore,
						cursor,
						identifiers: [...subjectIdentifiers],
						limit,
						policyPack: asNonEmptyString(searchParams.get("policy_pack")),
						status: parseStatusFilter(searchParams.get("status")),
					})
					.pipe(withTenant(tenantId));
				return ok({
					pagination: {
						limit: page.limit,
						nextCursor: page.nextCursor
							? encodeCursor(page.nextCursor)
							: undefined,
					},
					requests: page.items.map((req) => ({
						id: req.id,
						receivedAt: req.receivedAt,
						status: req.status,
					})),
					subjectId,
				});
			}),
		method: "GET",
		path: "/subjects/:subjectId",
		protected: true,
		summary: "Get subject profile",
	},
];

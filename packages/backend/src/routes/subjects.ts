import { asObject, asNonEmptyString } from "@dsar/guards";
import type { RequestRecord } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { backendErrorCatalogByCode } from "../types/error-codes";
import { ForbiddenRequestError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "./authz";
import { ok, parseParam } from "./helpers";
import type { RouteDefinition } from "./types";

const PAGE_SIZE = 500;
const normalizeIdentifier = (value: string): string =>
	value.trim().toLowerCase();

/**
 * Route definitions for the `/subjects` namespace: retrieving
 * data-subject profiles and their associated DSAR requests.
 */
export const subjectRoutes: readonly RouteDefinition[] = [
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const subjectId = yield* parseParam(params, "subjectId");
				const normalizedSubjectId = normalizeIdentifier(subjectId);
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
				const allRequests: RequestRecord[] = [];
				let offset = 0;
				let hasMore = true;
				while (hasMore) {
					const page = yield* services.repos.persistence.requests
						.list({ limit: PAGE_SIZE, offset })
						.pipe(withTenant(tenantId));
					for (const req of page) {
						allRequests.push(req);
					}
					hasMore = page.length === PAGE_SIZE;
					offset += page.length;
				}
				const subjectRequests = allRequests.filter((req) => {
					const capture = asObject(req.capture);
					const subject = asObject(capture?.subject);
					const requestor = asObject(req.requestor);
					const recordIdentifiers = [
						asNonEmptyString(subject?.subjectId),
						asNonEmptyString(subject?.externalRef),
						asNonEmptyString(requestor?.email),
					]
						.filter((value): value is string => typeof value === "string")
						.map(normalizeIdentifier);
					return recordIdentifiers.some((identifier) =>
						subjectIdentifiers.has(identifier)
					);
				});
				return ok({
					requests: subjectRequests.map((req) => ({
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

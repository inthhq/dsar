import { asNonEmptyString } from "@dsar/guards";
import type {
	ListRequestsBySubjectInput,
	RequestRecord,
	RequestSubjectCursor,
	RequestSubjectPage,
	RequestsRepository,
} from "@dsar/persistence";
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

type RequestsRepositoryWithOptionalSubjectLookup = Omit<
	RequestsRepository,
	"listBySubject"
> &
	Partial<Pick<RequestsRepository, "listBySubject">>;

const asJsonRecord = (
	value: unknown
): Readonly<Record<string, unknown>> | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: undefined;

const normalizeUnknownIdentifier = (value: unknown): string | null =>
	typeof value === "string" && value.trim().length > 0
		? normalizeIdentifier(value)
		: null;

const requestMatchesSubjectIdentifiers = (
	record: RequestRecord,
	identifiers: ReadonlySet<string>
): boolean => {
	const capture = asJsonRecord(record.capture);
	const subject = asJsonRecord(capture?.subject);
	const requestor = asJsonRecord(record.requestor);
	const recordIdentifiers = [
		normalizeUnknownIdentifier(subject?.subjectId),
		normalizeUnknownIdentifier(subject?.externalRef),
		normalizeUnknownIdentifier(requestor?.email),
	].filter((value): value is string => value !== null);
	return recordIdentifiers.some((identifier) => identifiers.has(identifier));
};

const requestPolicyPack = (record: RequestRecord): string | undefined => {
	const capture = asJsonRecord(record.capture);
	const policy = asJsonRecord(capture?.policy);
	return typeof policy?.policyPack === "string" && policy.policyPack.length > 0
		? policy.policyPack
		: undefined;
};

const legacyListRequestsBySubject = (
	records: readonly RequestRecord[],
	input: ListRequestsBySubjectInput
): RequestSubjectPage => {
	const identifiers = new Set(
		input.identifiers
			.map(normalizeIdentifier)
			.filter((value) => value.length > 0)
	);
	const limit = input.limit ?? DEFAULT_SUBJECT_PAGE_SIZE;
	if (identifiers.size === 0) {
		return { items: [], limit };
	}
	const statuses = input.status ? new Set(input.status) : new Set<string>();
	const matchingRecords = records
		.filter((record) => {
			if (!requestMatchesSubjectIdentifiers(record, identifiers)) {
				return false;
			}
			if (statuses.size > 0 && !statuses.has(record.status)) {
				return false;
			}
			if (input.createdAfter && record.createdAt <= input.createdAfter) {
				return false;
			}
			if (input.createdBefore && record.createdAt >= input.createdBefore) {
				return false;
			}
			if (input.policyPack && requestPolicyPack(record) !== input.policyPack) {
				return false;
			}
			if (
				input.cursor &&
				!(
					record.createdAt < input.cursor.createdAt ||
					(record.createdAt === input.cursor.createdAt &&
						record.id < input.cursor.id)
				)
			) {
				return false;
			}
			return true;
		})
		.toSorted((left, right) => {
			const createdOrder = right.createdAt.localeCompare(left.createdAt);
			return createdOrder === 0
				? right.id.localeCompare(left.id)
				: createdOrder;
		});
	const items = matchingRecords.slice(0, limit);
	const last = items.at(-1);
	return {
		items,
		limit,
		nextCursor:
			matchingRecords.length > limit && last
				? { createdAt: last.createdAt, id: last.id }
				: undefined,
	};
};

const listRequestsBySubject = (
	requests: RequestsRepositoryWithOptionalSubjectLookup,
	input: ListRequestsBySubjectInput
): ReturnType<RequestsRepository["listBySubject"]> => {
	if (typeof requests.listBySubject === "function") {
		return requests.listBySubject(input);
	}
	return requests
		.list({ limit: MAX_LIST_LIMIT })
		.pipe(Effect.map((records) => legacyListRequestsBySubject(records, input)));
};

const parseStatusFilter = (value: string | null): readonly string[] =>
	value
		? value
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		: [];

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
		return Effect.succeed(undefined as string | undefined);
	}
	const normalized = normalizeIsoTimestamp(value);
	if (!normalized) {
		return Effect.fail(
			new RequestValidationError({
				message: `${paramName} must be a valid ISO-8601 timestamp.`,
				reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
			})
		);
	}
	return Effect.succeed(normalized);
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
			"createdAt" in parsed &&
			"id" in parsed &&
			typeof parsed.createdAt === "string" &&
			typeof parsed.id === "string"
		) {
			const { createdAt, id } = parsed;
			const normalizedCreatedAt = normalizeIsoTimestamp(createdAt);
			if (!normalizedCreatedAt || id.trim().length === 0) {
				return undefined;
			}
			return {
				createdAt: normalizedCreatedAt,
				id,
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
				const cursorParam = searchParams.get("cursor");
				const cursor = decodeCursor(cursorParam);
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
				const page = yield* listRequestsBySubject(
					services.repos.persistence
						.requests as RequestsRepositoryWithOptionalSubjectLookup,
					{
						createdAfter,
						createdBefore,
						cursor,
						identifiers: [...subjectIdentifiers],
						limit,
						policyPack: asNonEmptyString(searchParams.get("policy_pack")),
						status: parseStatusFilter(searchParams.get("status")),
					}
				).pipe(withTenant(tenantId));
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

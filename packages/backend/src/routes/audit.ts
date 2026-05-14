import type { AuditEventCursor } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import { IsoTimestampSchema } from "@dsar/schema";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { exportAuditEventsTenantWide } from "../audit/export";
import {
	ForbiddenRequestError,
	RequestValidationError,
	UnauthorizedRequestError,
} from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "./authz";
import { ok } from "./helpers";
import {
	DEFAULT_LIST_LIMIT,
	MAX_LIST_LIMIT,
	parseIntParam,
	toValidationFailure,
} from "./requests/shared";
import type { RouteDefinition } from "./types";

const normalizeIsoTimestamp = (value: string): string | undefined => {
	const decoded = Schema.decodeUnknownExit(IsoTimestampSchema)(value);
	if (Exit.isFailure(decoded)) {
		return undefined;
	}
	return new Date(decoded.value).toISOString();
};

const parseIsoTimestampParam = (
	value: string | null,
	paramName: string
): Effect.Effect<
	string | undefined,
	ReturnType<typeof toValidationFailure>
> => {
	if (!value || value.trim().length === 0) {
		return Effect.succeed(undefined as string | undefined);
	}
	const normalized = normalizeIsoTimestamp(value);
	if (!normalized) {
		return Effect.fail(
			toValidationFailure(
				`${paramName} must be a valid ISO-8601 timestamp.`,
				new Error(`Received ${paramName}=${value}`)
			)
		);
	}
	return Effect.succeed(normalized);
};

const encodeCursor = (cursor: AuditEventCursor): string =>
	Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (value: string | null): AuditEventCursor | undefined => {
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
			return { createdAt: normalizedCreatedAt, id };
		}
	} catch {
		return undefined;
	}
	return undefined;
};

const OPERATOR_MESSAGE =
	"The audit log is reserved for operator or service principals.";

const requireOperator = Effect.gen(function* requireOperatorEffect() {
	const services = yield* Effect.service(RuntimeServicesTag);
	const actor = yield* requireRequestActor(services.requestContext);
	yield* requirePrincipalKinds({
		actor,
		allowedKinds: ["operator", "service"],
		message: OPERATOR_MESSAGE,
	});
	const tenantId = yield* requireRequestTenantId(services.requestContext);
	return { services, tenantId };
});

const trimmed = (value: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	const v = value.trim();
	return v.length > 0 ? v : undefined;
};

/**
 * Route definitions for the operator-facing `/audit` namespace: browsing
 * and exporting the immutable, hash-chained audit log for compliance review.
 */
export const auditRoutes: readonly RouteDefinition[] = [
	{
		handler: ({ request }) =>
			Effect.gen(function* listAuditHandler() {
				const { services, tenantId } = yield* requireOperator;
				const { searchParams } = new URL(request.url);
				const limit = parseIntParam(
					searchParams.get("limit"),
					DEFAULT_LIST_LIMIT,
					1,
					MAX_LIST_LIMIT
				);
				const cursorParam = searchParams.get("cursor");
				const cursor = decodeCursor(cursorParam);
				if (cursorParam && !cursor) {
					return yield* Effect.fail(
						toValidationFailure(
							"Invalid audit pagination cursor.",
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
				const requestId = trimmed(searchParams.get("request_id"));
				const subjectId = trimmed(searchParams.get("subject_id"));
				const actor = trimmed(searchParams.get("actor"));
				const action = trimmed(searchParams.get("event_type"));
				let requestIds: readonly string[] | undefined;
				if (subjectId) {
					const subjectPage = yield* services.repos.persistence.requests
						.listBySubject({
							identifiers: [subjectId],
							limit: MAX_LIST_LIMIT,
						})
						.pipe(withTenant(tenantId));
					requestIds = subjectPage.items.map((record) => record.id);
					if (requestIds.length === 0) {
						return ok({
							items: [],
							pagination: { limit, nextCursor: undefined },
						});
					}
				}
				const page = yield* services.repos.persistence.auditEvents
					.list({
						action,
						actor,
						createdAfter,
						createdBefore,
						cursor,
						limit,
						requestId,
						requestIds,
					})
					.pipe(withTenant(tenantId));
				return ok({
					items: page.items.map((event) => ({
						action: event.action,
						actor: event.actor,
						createdAt: event.createdAt,
						hash: event.hash,
						hashAlg: event.hashAlg,
						id: event.id,
						object: event.object,
						prevHash: event.prevHash,
						requestId: event.requestId,
						sequence: event.sequence,
					})),
					pagination: {
						limit: page.limit,
						nextCursor: page.nextCursor
							? encodeCursor(page.nextCursor)
							: undefined,
					},
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						error instanceof ForbiddenRequestError ||
							error instanceof UnauthorizedRequestError ||
							error instanceof RequestValidationError
							? error
							: toValidationFailure("Failed to list audit events.", error)
					)
				)
			),
		method: "GET",
		path: "/audit",
		protected: true,
		summary: "List audit events",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* exportAuditHandler() {
				const { tenantId } = yield* requireOperator;
				const { searchParams } = new URL(request.url);
				const sinceParam = searchParams.get("since");
				if (!sinceParam || sinceParam.trim().length === 0) {
					return yield* Effect.fail(
						toValidationFailure(
							"`since` is required for tenant-wide audit export.",
							new Error("Missing required query parameter: since")
						)
					);
				}
				const since = yield* parseIsoTimestampParam(sinceParam, "since");
				const until = yield* parseIsoTimestampParam(
					searchParams.get("until"),
					"until"
				);
				const formatParam = searchParams.get("format");
				const format = formatParam === "csv" ? "csv" : "jsonl";
				const exported = yield* exportAuditEventsTenantWide({
					format,
					since: since ?? sinceParam,
					tenantId,
					until,
				});
				return ok({
					eventCount: exported.events.length,
					events: exported.events,
					format: exported.format,
					rootHash: exported.rootHash,
					since: exported.since,
					until: exported.until,
				});
			}).pipe(
				Effect.catch((error) =>
					Effect.fail(
						error instanceof ForbiddenRequestError ||
							error instanceof UnauthorizedRequestError ||
							error instanceof RequestValidationError
							? error
							: toValidationFailure("Failed to export audit events.", error)
					)
				)
			),
		method: "GET",
		path: "/audit/export",
		protected: true,
		summary: "Export tenant audit trail",
	},
];

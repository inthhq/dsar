import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import type {
	JsonValue,
	NotificationDeliveryAttemptRecord,
	RetentionPolicyRecord,
} from "../../types/domain";
import { resolvePersistenceErrorCatalogEntry } from "../../types/error-codes";
import {
	PersistenceEntityNotFoundError,
	PersistenceInvalidRecordError,
} from "../../types/errors";

/** SQL client type used by persistence helpers and migrations. */
export type Sql = SqlClient.SqlClient;

/** Catalog entry used when required persistence entities are missing. */
export const PERSISTENCE_ENTITY_NOT_FOUND_ENTRY =
	resolvePersistenceErrorCatalogEntry("PERSISTENCE_ENTITY_NOT_FOUND");
/** Catalog entry used when persisted rows cannot be decoded safely. */
export const PERSISTENCE_INVALID_RECORD_ENTRY =
	resolvePersistenceErrorCatalogEntry("PERSISTENCE_INVALID_RECORD");

/** Tenant id used for bootstrap records that exist outside user tenants. */
export const BOOTSTRAP_TENANT_ID = "__dsar_bootstrap__";

/**
 * Serializes a JSON value for SQL storage.
 *
 * @param value - JSON value to encode.
 * @returns JSON string representation of the value.
 */
export const jsonEncode = (value: JsonValue) => JSON.stringify(value);

const asJsonRecord = (
	value: JsonValue | undefined
): Readonly<Record<string, JsonValue>> | undefined => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Readonly<Record<string, JsonValue>>;
};

const asNonEmptyString = (value: JsonValue | undefined): string | undefined =>
	typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;

/**
 * Normalizes subject lookup identifiers for case-insensitive matching.
 *
 * @param value - Raw subject id, external ref, or email value.
 * @returns Lower-cased trimmed identifier, or `null` when blank.
 */
export const normalizeSubjectLookupIdentifier = (
	value: string | undefined
): string | null => {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 ? normalized : null;
};

/**
 * Extracts indexed request lookup fields from JSON request payloads.
 *
 * @param input - Request capture and requestor JSON values.
 * @returns Normalized lookup metadata persisted alongside the request row.
 */
export const extractRequestLookupFields = (input: {
	readonly capture: JsonValue;
	readonly requestor: JsonValue;
}): {
	readonly policyPack: string | null;
	readonly requestorEmail: string | null;
	readonly subjectExternalRef: string | null;
	readonly subjectId: string | null;
} => {
	const capture = asJsonRecord(input.capture);
	const subject = asJsonRecord(capture?.subject);
	const policy = asJsonRecord(capture?.policy);
	const requestor = asJsonRecord(input.requestor);
	return {
		policyPack: asNonEmptyString(policy?.policyPack) ?? null,
		requestorEmail: normalizeSubjectLookupIdentifier(
			asNonEmptyString(requestor?.email)
		),
		subjectExternalRef: normalizeSubjectLookupIdentifier(
			asNonEmptyString(subject?.externalRef)
		),
		subjectId: normalizeSubjectLookupIdentifier(
			asNonEmptyString(subject?.subjectId)
		),
	};
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
	if (typeof value === "object") {
		return (
			value !== null &&
			Object.values(value).every((entry) => isJsonValue(entry))
		);
	}
	return false;
};

/**
 * Parses a JSON string into a validated domain JSON value.
 *
 * @param value - JSON string read from persistence storage.
 * @returns Parsed JSON value, or `null` when decoding fails.
 */
export const jsonDecode = (value: string): JsonValue => {
	try {
		const parsed: unknown = JSON.parse(value);
		return isJsonValue(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

/**
 * Parses a retention class string from storage into the domain union.
 *
 * @param value - Raw retention class stored in SQL.
 * @returns An effect yielding a validated retention class.
 */
export const parseRetentionClass = (
	value: string
): Effect.Effect<
	RetentionPolicyRecord["class"],
	PersistenceInvalidRecordError
> => {
	switch (value) {
		case "request_record":
		case "audit_event":
		case "verification_evidence":
		case "fulfilment_artifact":
		case "delivery_log":
		case "notification_log": {
			return Effect.succeed(value);
		}
		default: {
			return Effect.fail(
				new PersistenceInvalidRecordError({
					code: PERSISTENCE_INVALID_RECORD_ENTRY.code,
					docsUrl: PERSISTENCE_INVALID_RECORD_ENTRY.docsUrl,
					entity: "retention_policies",
					errorId: PERSISTENCE_INVALID_RECORD_ENTRY.id,
					field: "class",
					value,
				})
			);
		}
	}
};

/**
 * Parses a notification delivery status string from storage.
 *
 * @param value - Raw notification delivery status stored in SQL.
 * @returns An effect yielding a validated notification delivery status.
 */
export const parseNotificationDeliveryStatus = (
	value: string
): Effect.Effect<
	NotificationDeliveryAttemptRecord["status"],
	PersistenceInvalidRecordError
> => {
	switch (value) {
		case "pending":
		case "delivered":
		case "failed":
		case "skipped": {
			return Effect.succeed(value);
		}
		default: {
			return Effect.fail(
				new PersistenceInvalidRecordError({
					code: PERSISTENCE_INVALID_RECORD_ENTRY.code,
					docsUrl: PERSISTENCE_INVALID_RECORD_ENTRY.docsUrl,
					entity: "notification_delivery_attempts",
					errorId: PERSISTENCE_INVALID_RECORD_ENTRY.id,
					field: "status",
					value,
				})
			);
		}
	}
};

const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_OFFSET = 0;

/**
 * Normalizes a query limit using persistence defaults and bounds.
 *
 * @param limit - Optional caller-supplied limit.
 * @returns Bounded limit value safe for SQL queries.
 */
export const limitWithFallback = (limit?: number) => {
	if (typeof limit !== "number" || !Number.isFinite(limit)) {
		return DEFAULT_LIMIT;
	}
	return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.trunc(limit)));
};

/**
 * Normalizes a query offset using persistence defaults and bounds.
 *
 * @param offset - Optional caller-supplied offset.
 * @returns Non-negative offset safe for SQL queries.
 */
export const offsetWithFallback = (offset?: number) => {
	if (typeof offset !== "number" || !Number.isFinite(offset)) {
		return DEFAULT_OFFSET;
	}
	return Math.max(DEFAULT_OFFSET, Math.trunc(offset));
};

/**
 * Requires an optional row to exist or fails with a not-found persistence error.
 *
 * @param row - Row returned by the query.
 * @param entity - Entity/table name for diagnostics.
 * @param id - Lookup id used in the query.
 * @typeParam T - Row type returned by the query.
 * @returns An effect yielding the row when present.
 */
export const findRequired = <T>(
	row: T | undefined,
	entity: string,
	id: string
): Effect.Effect<T, PersistenceEntityNotFoundError> =>
	row === undefined
		? Effect.fail(
				new PersistenceEntityNotFoundError({
					code: PERSISTENCE_ENTITY_NOT_FOUND_ENTRY.code,
					docsUrl: PERSISTENCE_ENTITY_NOT_FOUND_ENTRY.docsUrl,
					entity,
					errorId: PERSISTENCE_ENTITY_NOT_FOUND_ENTRY.id,
					id,
				})
			)
		: Effect.succeed(row);

import * as Effect from "effect/Effect";

import type { Sql } from "./shared";

const sqliteDuplicateColumnPattern = /duplicate column name/i;

const collectErrorText = (error: unknown): string => {
	const seen = new WeakSet<object>();
	const messages: string[] = [];
	const visit = (value: unknown): void => {
		if (value === null || value === undefined) {
			return;
		}
		if (typeof value === "string" || typeof value === "number") {
			messages.push(String(value));
			return;
		}
		if (typeof value !== "object") {
			return;
		}
		if (seen.has(value)) {
			return;
		}
		seen.add(value);
		if (value instanceof Error) {
			messages.push(value.message);
		}
		const record = value as Record<PropertyKey, unknown>;
		for (const key of Reflect.ownKeys(value)) {
			visit(record[key]);
		}
	};
	visit(error);
	return messages.join("\n");
};

const isSqliteDuplicateColumnError = (error: unknown): boolean =>
	sqliteDuplicateColumnPattern.test(collectErrorText(error));

const ignoreSqliteDuplicateColumnError = <A, E, R>(
	effect: Effect.Effect<A, E, R>
) =>
	effect.pipe(
		Effect.catch((error) =>
			isSqliteDuplicateColumnError(error) ? Effect.void : Effect.fail(error)
		)
	);

/**
 * Adds request lookup columns used by subject profile queries.
 *
 * @param sql - Effect SQL client used to execute DDL statements.
 * @returns An effect that completes once all lookup columns exist.
 */
export const ensureRequestLookupColumns = (sql: Sql) =>
	sql.onDialectOrElse({
		orElse: () =>
			Effect.die(
				new Error(
					"Request lookup column migration is not implemented for this SQL dialect."
				)
			),
		pg: () =>
			sql`ALTER TABLE requests
				ADD COLUMN IF NOT EXISTS subject_id TEXT,
				ADD COLUMN IF NOT EXISTS subject_external_ref TEXT,
				ADD COLUMN IF NOT EXISTS requestor_email TEXT,
				ADD COLUMN IF NOT EXISTS policy_pack TEXT`,
		sqlite: () =>
			Effect.gen(function* addSqliteRequestLookupColumns() {
				yield* ignoreSqliteDuplicateColumnError(
					sql`ALTER TABLE requests ADD COLUMN subject_id TEXT`
				);
				yield* ignoreSqliteDuplicateColumnError(
					sql`ALTER TABLE requests ADD COLUMN subject_external_ref TEXT`
				);
				yield* ignoreSqliteDuplicateColumnError(
					sql`ALTER TABLE requests ADD COLUMN requestor_email TEXT`
				);
				yield* ignoreSqliteDuplicateColumnError(
					sql`ALTER TABLE requests ADD COLUMN policy_pack TEXT`
				);
			}),
	});

/**
 * Backfills request lookup columns from existing request JSON payloads.
 *
 * Rows are updated only when a missing lookup column has a non-null extracted
 * value, so records that legitimately lack lookup metadata are not rewritten on
 * every service boot.
 *
 * @param sql - Effect SQL client used to execute backfill statements.
 * @returns An effect that completes after eligible rows are backfilled.
 */
export const backfillRequestLookupColumns = (sql: Sql) =>
	sql.onDialectOrElse({
		orElse: () =>
			Effect.die(
				new Error(
					"Request lookup backfill is not implemented for this SQL dialect."
				)
			),
		pg: () =>
			sql`WITH extracted AS (
					SELECT
						tenant_id,
						id,
						lower(nullif(trim(capture_json::jsonb #>> '{subject,subjectId}'), '')) AS next_subject_id,
						lower(nullif(trim(capture_json::jsonb #>> '{subject,externalRef}'), '')) AS next_subject_external_ref,
						lower(nullif(trim(requestor_json::jsonb ->> 'email'), '')) AS next_requestor_email,
						nullif(trim(capture_json::jsonb #>> '{policy,policyPack}'), '') AS next_policy_pack
					FROM requests
				)
				UPDATE requests AS r
				SET
					subject_id = COALESCE(r.subject_id, extracted.next_subject_id),
					subject_external_ref = COALESCE(r.subject_external_ref, extracted.next_subject_external_ref),
					requestor_email = COALESCE(r.requestor_email, extracted.next_requestor_email),
					policy_pack = COALESCE(r.policy_pack, extracted.next_policy_pack)
				FROM extracted
				WHERE r.tenant_id = extracted.tenant_id
					AND r.id = extracted.id
					AND (
						(r.subject_id IS NULL AND extracted.next_subject_id IS NOT NULL)
						OR (r.subject_external_ref IS NULL AND extracted.next_subject_external_ref IS NOT NULL)
						OR (r.requestor_email IS NULL AND extracted.next_requestor_email IS NOT NULL)
						OR (r.policy_pack IS NULL AND extracted.next_policy_pack IS NOT NULL)
					)`,
		sqlite: () =>
			sql`UPDATE requests
				SET
					subject_id = COALESCE(
						subject_id,
						lower(nullif(trim(CAST(json_extract(capture_json, '$.subject.subjectId') AS TEXT)), ''))
					),
					subject_external_ref = COALESCE(
						subject_external_ref,
						lower(nullif(trim(CAST(json_extract(capture_json, '$.subject.externalRef') AS TEXT)), ''))
					),
					requestor_email = COALESCE(
						requestor_email,
						lower(nullif(trim(CAST(json_extract(requestor_json, '$.email') AS TEXT)), ''))
					),
					policy_pack = COALESCE(
						policy_pack,
						nullif(trim(CAST(json_extract(capture_json, '$.policy.policyPack') AS TEXT)), '')
					)
				WHERE
					(subject_id IS NULL AND lower(nullif(trim(CAST(json_extract(capture_json, '$.subject.subjectId') AS TEXT)), '')) IS NOT NULL)
					OR (subject_external_ref IS NULL AND lower(nullif(trim(CAST(json_extract(capture_json, '$.subject.externalRef') AS TEXT)), '')) IS NOT NULL)
					OR (requestor_email IS NULL AND lower(nullif(trim(CAST(json_extract(requestor_json, '$.email') AS TEXT)), '')) IS NOT NULL)
					OR (policy_pack IS NULL AND nullif(trim(CAST(json_extract(capture_json, '$.policy.policyPack') AS TEXT)), '') IS NOT NULL)`,
	});

import * as Effect from "effect/Effect";

import type { Sql } from "./shared";

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
				yield* sql`ALTER TABLE requests ADD COLUMN subject_id TEXT`.pipe(
					Effect.ignore
				);
				yield* sql`ALTER TABLE requests ADD COLUMN subject_external_ref TEXT`.pipe(
					Effect.ignore
				);
				yield* sql`ALTER TABLE requests ADD COLUMN requestor_email TEXT`.pipe(
					Effect.ignore
				);
				yield* sql`ALTER TABLE requests ADD COLUMN policy_pack TEXT`.pipe(
					Effect.ignore
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

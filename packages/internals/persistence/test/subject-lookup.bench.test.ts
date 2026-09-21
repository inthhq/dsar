import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";

import { makeSqlitePersistenceLayer } from "../../persistence-sqlite/src";
import { Persistence, withTenant } from "../src";
import {
	extractRequestLookupFields,
	jsonEncode,
} from "../src/services/persistence/shared";
import type { Sql } from "../src/services/persistence/shared";

const runPerfBenches = process.env.PERF === "1";

const REQUEST_SCALE = 1000;
const WARMUP_ITERATIONS = 5;
const SAMPLE_ITERATIONS = 40;
const P95_BOUND_MS = 100;
const SQLITE_INSERT_BATCH_SIZE = 500;
const SUBJECT_ID = "subject-scale";
const NOW_MS = Date.parse("2026-03-01T00:00:00.000Z");

const webhookSigningSecretEncryption = {
	key: "test-webhook-signing-secret-encryption-key",
	keyId: "test-key",
} as const;

const percentile = (samples: readonly number[], p: number): number => {
	const ordered = [...samples].toSorted((left, right) => left - right);
	if (ordered.length === 0) {
		return Number.POSITIVE_INFINITY;
	}
	const index = Math.min(
		ordered.length - 1,
		Math.max(0, Math.ceil(p * ordered.length) - 1)
	);
	return ordered[index] ?? Number.POSITIVE_INFINITY;
};

const scaledRequestInput = (index: number) => {
	const day = ((index % 28) + 1).toString().padStart(2, "0");
	return {
		appeals: [],
		authority: { status: "verified", type: "subject" },
		capture: {
			policy: {
				policyPack: index % 4 === 0 ? "pack-scale" : "pack-other",
			},
			subject: {
				subjectId: index % 20 === 0 ? SUBJECT_ID : "subject-other",
			},
		},
		clockMode: "calendar_days",
		dueAt: "2026-04-01T00:00:00.000Z",
		id: `req-bench-${index.toString().padStart(5, "0")}`,
		receivedAt: `2026-03-${day}T00:00:00.000Z`,
		requestor: { type: "subject" },
		status: index % 2 === 0 ? "in_progress" : "fulfilled",
	} as const;
};

const seedRequestsDirectly = (sql: Sql) =>
	sql.withTransaction(
		Effect.forEach(
			Array.from(
				{ length: Math.ceil(REQUEST_SCALE / SQLITE_INSERT_BATCH_SIZE) },
				(_, batchIndex) => batchIndex
			),
			(batchIndex) => {
				const start = batchIndex * SQLITE_INSERT_BATCH_SIZE;
				const rows = Array.from(
					{
						length: Math.min(SQLITE_INSERT_BATCH_SIZE, REQUEST_SCALE - start),
					},
					(_, offset) => {
						const input = scaledRequestInput(start + offset);
						const lookupFields = extractRequestLookupFields(input);
						return {
							appeals_json: jsonEncode(input.appeals),
							authority_json: jsonEncode(input.authority),
							capture_json: jsonEncode(input.capture),
							clock_mode: input.clockMode,
							created_at: input.receivedAt,
							due_at: input.dueAt,
							id: input.id,
							policy_pack: lookupFields.policyPack,
							received_at: input.receivedAt,
							requestor_email: lookupFields.requestorEmail,
							requestor_json: jsonEncode(input.requestor),
							status: input.status,
							subject_external_ref: lookupFields.subjectExternalRef,
							subject_id: lookupFields.subjectId,
							tenant_id: "tenant-a",
							updated_at: input.receivedAt,
						};
					}
				);
				return sql`INSERT INTO requests ${sql.insert(rows)}`;
			},
			{ concurrency: 1, discard: true }
		)
	);

describe.skipIf(!runPerfBenches)("subject lookup bench", () => {
	it.effect(
		`p95 of listBySubject at ${REQUEST_SCALE} in-memory SQLite rows stays under ${P95_BOUND_MS}ms`,
		() =>
			Effect.gen(function* subjectLookupBench() {
				yield* TestClock.setTime(NOW_MS);
				yield* Clock.currentTimeMillis;
				const persistence = yield* Effect.service(Persistence);
				const samples: number[] = [];
				let lastCount = 0;

				for (const iteration of Array.from(
					{ length: WARMUP_ITERATIONS + SAMPLE_ITERATIONS },
					(_, index) => index
				)) {
					const started = performance.now();
					const page = yield* persistence.requests.listBySubject({
						identifiers: [SUBJECT_ID],
						limit: 25,
						policyPack: "pack-scale",
						status: ["in_progress"],
					});
					const elapsed = performance.now() - started;
					lastCount = page.items.length;
					if (iteration >= WARMUP_ITERATIONS) {
						samples.push(elapsed);
					}
				}

				const p95Ms = percentile(samples, 0.95);
				expect(lastCount).toBeGreaterThan(0);
				expect(p95Ms).toBeLessThan(P95_BOUND_MS);
			}).pipe(
				Effect.provide(
					makeSqlitePersistenceLayer({
						filename: ":memory:",
						migrationHooks: {
							afterMigrations: seedRequestsDirectly,
						},
						webhookSigningSecretEncryption,
					})
				),
				withTenant("tenant-a")
			),
		20_000
	);
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeSqlitePersistenceLayer } from "../../persistence-sqlite/src";
import { Persistence, withTenant } from "../src";
import {
	extractRequestLookupFields,
	jsonEncode,
} from "../src/services/persistence/shared";
import type { Sql } from "../src/services/persistence/shared";

const sqliteFile = (name: string): string =>
	`/tmp/dsar-persistence-${name}-${crypto.randomUUID()}.sqlite`;

const webhookSigningSecretEncryption = {
	key: "test-webhook-signing-secret-encryption-key",
	keyId: "test-key",
} as const;

const baseRequest = {
	appeals: [],
	authority: { status: "verified", type: "subject" },
	capture: { channel: "api", receivedAt: "2026-01-01T00:00:00.000Z" },
	clockMode: "calendar_days",
	dueAt: "2026-02-01T00:00:00.000Z",
	receivedAt: "2026-01-01T00:00:00.000Z",
	requestor: { type: "subject" },
	status: "received",
} as const;

const subjectLookupSeedRequests = [
	{
		id: "req-subject-0",
		policyPack: "pack-a",
		receivedAt: "2026-01-01T00:00:00.000Z",
		status: "received",
	},
	{
		id: "req-subject-1",
		policyPack: "pack-a",
		receivedAt: "2026-01-02T00:00:00.000Z",
		status: "fulfilled",
	},
	{
		id: "req-subject-2",
		policyPack: "pack-a",
		receivedAt: "2026-01-03T00:00:00.000Z",
		status: "received",
	},
	{
		id: "req-subject-3",
		policyPack: "pack-b",
		receivedAt: "2026-01-04T00:00:00.000Z",
		status: "received",
	},
] as const;

const toSubjectLookupCreateInput = (
	seedRequest: (typeof subjectLookupSeedRequests)[number]
) => ({
	...baseRequest,
	capture: {
		policy: {
			policyPack: seedRequest.policyPack,
		},
		subject: {
			externalRef: "external-subject",
			subjectId: "subject-indexed",
		},
	},
	id: seedRequest.id,
	receivedAt: seedRequest.receivedAt,
	status: seedRequest.status,
});

const scaledSubjectLookupSeedInput = (scale: number, index: number) => ({
	...baseRequest,
	capture: {
		policy: {
			policyPack: index % 4 === 0 ? "pack-scale" : "pack-other",
		},
		subject: {
			subjectId: index % 100 === 0 ? "subject-scale" : "subject-other",
		},
	},
	id: `req-scale-${scale}-${index.toString().padStart(5, "0")}`,
	receivedAt: `2026-03-${((index % 28) + 1).toString().padStart(2, "0")}T00:00:00.000Z`,
	status: index % 2 === 0 ? "in_progress" : "fulfilled",
});

const SQLITE_INSERT_BATCH_SIZE = 500;

const seedRequestsDirectly = (scale: number) => (sql: Sql) =>
	sql.withTransaction(
		Effect.forEach(
			Array.from(
				{ length: Math.ceil(scale / SQLITE_INSERT_BATCH_SIZE) },
				(_, batchIndex) => batchIndex
			),
			(batchIndex) => {
				const start = batchIndex * SQLITE_INSERT_BATCH_SIZE;
				const rows = Array.from(
					{
						length: Math.min(SQLITE_INSERT_BATCH_SIZE, scale - start),
					},
					(_, offset) => {
						const input = scaledSubjectLookupSeedInput(scale, start + offset);
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

const runForTenant = <A>(
	filename: string,
	tenantId: string,
	program: Effect.Effect<A, unknown, Persistence>
) =>
	Effect.runPromise(
		program.pipe(
			Effect.provide(
				makeSqlitePersistenceLayer({
					filename,
					webhookSigningSecretEncryption,
				})
			),
			withTenant(tenantId)
		)
	);

describe(Persistence, () => {
	it("isolates request visibility across tenants", async () => {
		const dbPath = sqliteFile("tenant-isolation");

		await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* createTenantARequest() {
				const persistence = yield* Effect.service(Persistence);
				yield* persistence.requests.create({
					...baseRequest,
					id: "req-1",
				});
			})
		);

		const requestsForTenantB = await runForTenant(
			dbPath,
			"tenant-b",
			Effect.gen(function* listTenantBRequests() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.list();
			})
		);

		expect(requestsForTenantB).toHaveLength(0);
	});

	it.effect("fails closed when tenant context is not provided", () =>
		Effect.gen(function* failsClosedTest() {
			const dbPath = sqliteFile("missing-tenant");
			const program = Effect.gen(function* listWithoutTenant() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.list();
			}).pipe(Effect.provide(makeSqlitePersistenceLayer({ filename: dbPath })));

			const result = yield* Effect.result(program);
			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toMatchObject({
				_tag: "MissingTenantScopeError",
			});
		})
	);

	it("applies schema migrations on a clean database", async () => {
		const dbPath = sqliteFile("migrations-clean-db");
		const requestList = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* listRequestsAfterMigration() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.list();
			})
		);

		expect(Array.isArray(requestList)).toBeTruthy();
		expect(requestList).toHaveLength(0);
	});

	it("backfills indexed subject lookup columns for existing request rows", async () => {
		const dbPath = sqliteFile("subject-backfill");
		const requestList = await Effect.runPromise(
			Effect.gen(function* listBackfilledSubjectRequests() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.listBySubject({
					identifiers: ["subject-backfill"],
					limit: 10,
				});
			}).pipe(
				Effect.provide(
					makeSqlitePersistenceLayer({
						filename: dbPath,
						migrationHooks: {
							beforeMigrations: (sql) =>
								Effect.gen(function* seedOldSchema() {
									yield* sql`CREATE TABLE IF NOT EXISTS requests (
										id TEXT NOT NULL,
										tenant_id TEXT NOT NULL,
										status TEXT NOT NULL,
										received_at TEXT NOT NULL,
										due_at TEXT NOT NULL,
										clock_mode TEXT NOT NULL,
										requestor_json TEXT NOT NULL,
										authority_json TEXT NOT NULL,
										capture_json TEXT NOT NULL,
										appeals_json TEXT NOT NULL,
										created_at TEXT NOT NULL,
										updated_at TEXT NOT NULL,
										PRIMARY KEY (tenant_id, id)
									)`;
									yield* sql`INSERT INTO requests (
										id,
										tenant_id,
										status,
										received_at,
										due_at,
										clock_mode,
										requestor_json,
										authority_json,
										capture_json,
										appeals_json,
										created_at,
										updated_at
									) VALUES (
										'req-backfilled',
										'tenant-a',
										'received',
										'2026-01-01T00:00:00.000Z',
										'2026-02-01T00:00:00.000Z',
										'calendar_days',
										'{"type":"subject","email":"backfill@example.com"}',
										'{}',
										'{"subject":{"subjectId":"subject-backfill"},"policy":{"policyPack":"pack-backfill"}}',
										'[]',
										'2026-01-01T00:00:00.000Z',
										'2026-01-01T00:00:00.000Z'
									)`;
								}),
						},
					})
				),
				withTenant("tenant-a")
			)
		);

		expect(requestList.items.map((request) => request.id)).toStrictEqual([
			"req-backfilled",
		]);
	});

	it("lists subject requests with indexed filters and cursor pagination", async () => {
		const dbPath = sqliteFile("subject-lookup");
		const page = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* subjectLookupProgram() {
				const persistence = yield* Effect.service(Persistence);
				for (const seedRequest of subjectLookupSeedRequests) {
					yield* persistence.requests.create(
						toSubjectLookupCreateInput(seedRequest)
					);
				}
				return yield* persistence.requests.listBySubject({
					identifiers: ["external-subject"],
					limit: 2,
					policyPack: "pack-a",
					status: ["received"],
				});
			})
		);

		expect(page.items.map((request) => request.id)).toStrictEqual([
			"req-subject-2",
			"req-subject-0",
		]);
		expect(page.nextCursor).toBeUndefined();
	});

	it("continues subject request lookup from the returned cursor", async () => {
		const dbPath = sqliteFile("subject-lookup-cursor");
		const pages = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* subjectLookupCursorProgram() {
				const persistence = yield* Effect.service(Persistence);
				for (const seedRequest of subjectLookupSeedRequests) {
					yield* persistence.requests.create(
						toSubjectLookupCreateInput(seedRequest)
					);
				}
				const firstPage = yield* persistence.requests.listBySubject({
					identifiers: ["external-subject"],
					limit: 1,
					policyPack: "pack-a",
					status: ["received"],
				});
				const secondPage = yield* persistence.requests.listBySubject({
					cursor: firstPage.nextCursor,
					identifiers: ["external-subject"],
					limit: 1,
					policyPack: "pack-a",
					status: ["received"],
				});
				return { firstPage, secondPage };
			})
		);

		expect(pages.firstPage.items.map((request) => request.id)).toStrictEqual([
			"req-subject-2",
		]);
		expect(pages.firstPage.nextCursor).toBeDefined();
		expect(pages.secondPage.items.map((request) => request.id)).toStrictEqual([
			"req-subject-0",
		]);
		expect(pages.secondPage.nextCursor).toBeUndefined();
	});

	it("keeps real SQLite subject lookup latency bounded at 100, 1k, and 10k request scale", async () => {
		const scales = [100, 1000, 10_000] as const;
		const thresholdsMs: Readonly<Record<(typeof scales)[number], number>> = {
			100: 100,
			1000: 250,
			10_000: 1500,
		};
		for (const scale of scales) {
			const dbPath = sqliteFile(`subject-scale-${scale}`);
			const result = await Effect.runPromise(
				Effect.gen(function* subjectLookupScaleProgram() {
					const persistence = yield* Effect.service(Persistence);
					const started = performance.now();
					const page = yield* persistence.requests.listBySubject({
						identifiers: ["subject-scale"],
						limit: 25,
						policyPack: "pack-scale",
						status: ["in_progress"],
					});
					return { elapsedMs: performance.now() - started, page };
				}).pipe(
					Effect.provide(
						makeSqlitePersistenceLayer({
							filename: dbPath,
							migrationHooks: {
								afterMigrations: seedRequestsDirectly(scale),
							},
						})
					),
					withTenant("tenant-a")
				)
			);

			expect(result.page.items).toHaveLength(
				Math.min(Math.ceil(scale / 100), 25)
			);
			expect(result.elapsedMs).toBeLessThan(thresholdsMs[scale]);
		}
	});

	it("persists and lists clock segments in deterministic order", async () => {
		const dbPath = sqliteFile("clock-segments");

		await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* createRequestAndSegments() {
				const persistence = yield* Effect.service(Persistence);
				yield* persistence.requests.create({
					...baseRequest,
					id: "req-clock-1",
				});
				yield* persistence.clockSegments.append({
					actor: "system",
					countsTowardDeadline: false,
					from: "2026-01-03T00:00:00.000Z",
					id: "seg-2",
					policyVersion: "v1",
					reason: "clarification",
					requestId: "req-clock-1",
					to: "2026-01-04T00:00:00.000Z",
				});
				yield* persistence.clockSegments.append({
					actor: "system",
					countsTowardDeadline: true,
					from: "2026-01-01T00:00:00.000Z",
					id: "seg-1",
					policyVersion: "v1",
					reason: "base",
					requestId: "req-clock-1",
					to: "2026-01-03T00:00:00.000Z",
				});
				return yield* persistence.clockSegments.listByRequestId("req-clock-1");
			})
		).then((segments) => {
			expect(segments.map((segment) => segment.id)).toStrictEqual([
				"seg-1",
				"seg-2",
			]);
			expect(segments.map((segment) => segment.reason)).toStrictEqual([
				"base",
				"clarification",
			]);
		});
	});

	it("persists notification generation and delivery attempts independently", async () => {
		const dbPath = sqliteFile("notification-events");

		await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* createNotificationEvidence() {
				const persistence = yield* Effect.service(Persistence);
				yield* persistence.requests.create({
					...baseRequest,
					id: "req-notify-1",
				});
				yield* persistence.notificationEvents.append({
					correlationId: "corr-1",
					createdAt: "2026-01-01T00:00:00.000Z",
					eventType: "request_captured",
					id: "ne-1",
					idempotencyKey: "idem-1",
					locale: "en-GB",
					payload: { requestId: "req-notify-1" },
					policyVersion: "uk-v1",
					requestId: "req-notify-1",
				});
				yield* persistence.notificationDeliveryAttempts.append({
					attempt: 2,
					channel: "webhook",
					createdAt: "2026-01-01T00:00:02.000Z",
					destination: "https://tenant.example/webhook",
					error: "timeout",
					id: "nda-2",
					notificationEventId: "ne-1",
					requestId: "req-notify-1",
					status: "failed",
				});
				yield* persistence.notificationDeliveryAttempts.append({
					attempt: 1,
					channel: "webhook",
					createdAt: "2026-01-01T00:00:01.000Z",
					destination: "https://tenant.example/webhook",
					id: "nda-1",
					notificationEventId: "ne-1",
					requestId: "req-notify-1",
					responseCode: 202,
					status: "delivered",
				});

				const events =
					yield* persistence.notificationEvents.listByRequestId("req-notify-1");
				const attempts =
					yield* persistence.notificationDeliveryAttempts.listByNotificationEventId(
						"ne-1"
					);
				return { attempts, events };
			})
		).then((result) => {
			expect(result.events).toHaveLength(1);
			expect(result.events[0]?.id).toBe("ne-1");
			expect(result.attempts.map((attempt) => attempt.id)).toStrictEqual([
				"nda-1",
				"nda-2",
			]);
			expect(result.attempts[1]?.status).toBe("failed");
		});
	});

	it("persists webhook endpoint signing-key rotation with tenant isolation", async () => {
		const dbPath = sqliteFile("webhook-rotation");
		const seeded = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* seedAndRotateWebhookEndpoint() {
				const persistence = yield* Effect.service(Persistence);
				const ensured = yield* persistence.webhookEndpoints.ensureConfigured({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "default",
					keyId: "key-old",
					signingSecret: "old-secret",
					url: "https://tenant.example/webhook",
				});
				const activeBefore = yield* persistence.webhookEndpoints.listActiveKeys(
					"default",
					"2026-01-02T00:00:00.000Z"
				);
				const rotation = yield* persistence.webhookEndpoints.rotateSigningKey({
					endpointId: "default",
					graceExpiresAt: "2026-01-08T00:00:00.000Z",
					newKeyId: "key-new",
					newSecret: "new-secret",
					rotatedAt: "2026-01-02T00:00:00.000Z",
				});
				const activeDuringGrace =
					yield* persistence.webhookEndpoints.listActiveKeys(
						"default",
						"2026-01-03T00:00:00.000Z"
					);
				const activeAfterGrace =
					yield* persistence.webhookEndpoints.listActiveKeys(
						"default",
						"2026-01-09T00:00:00.000Z"
					);
				return {
					activeAfterGrace,
					activeBefore,
					activeDuringGrace,
					ensured,
					rotation,
				};
			})
		);

		expect(seeded.ensured.primaryKey.secret).toBe("old-secret");
		expect(seeded.activeBefore.map((key) => key.id)).toStrictEqual(["key-old"]);
		expect(seeded.rotation.previousPrimary?.id).toBe("key-old");
		expect(seeded.rotation.previousPrimary?.role).toBe("secondary");
		expect(seeded.rotation.previousPrimary?.expiresAt).toBe(
			"2026-01-08T00:00:00.000Z"
		);
		expect(seeded.activeDuringGrace.map((key) => key.id)).toStrictEqual([
			"key-new",
			"key-old",
		]);
		expect(seeded.activeAfterGrace.map((key) => key.id)).toStrictEqual([
			"key-new",
		]);

		const tenantBKeys = await runForTenant(
			dbPath,
			"tenant-b",
			Effect.gen(function* listTenantBWebhookKeys() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.webhookEndpoints.listActiveKeys(
					"default",
					"2026-01-03T00:00:00.000Z"
				);
			})
		);
		expect(tenantBKeys).toHaveLength(0);
	});

	it("seeds webhook primary keys atomically", async () => {
		const dbPath = sqliteFile("webhook-ensure-concurrency");
		const ensureEndpoint = () =>
			runForTenant(
				dbPath,
				"tenant-a",
				Effect.gen(function* ensureWebhookEndpoint() {
					const persistence = yield* Effect.service(Persistence);
					return yield* persistence.webhookEndpoints.ensureConfigured({
						createdAt: "2026-01-01T00:00:00.000Z",
						id: "default",
						signingSecret: "old-secret",
						url: "https://tenant.example/webhook",
					});
				})
			);

		await Promise.all([ensureEndpoint(), ensureEndpoint()]);

		const activeKeys = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* listWebhookKeys() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.webhookEndpoints.listActiveKeys(
					"default",
					"2026-01-02T00:00:00.000Z"
				);
			})
		);

		expect(activeKeys.map((key) => key.id)).toStrictEqual(["default:primary"]);
	});

	it("rotates webhook signing keys transactionally under concurrency", async () => {
		const dbPath = sqliteFile("webhook-rotate-concurrency");
		await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* seedWebhookEndpoint() {
				const persistence = yield* Effect.service(Persistence);
				yield* persistence.webhookEndpoints.ensureConfigured({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "default",
					keyId: "key-old",
					signingSecret: "old-secret",
					url: "https://tenant.example/webhook",
				});
			})
		);
		const rotateEndpoint = (newKeyId: string, rotatedAt: string) =>
			runForTenant(
				dbPath,
				"tenant-a",
				Effect.gen(function* rotateWebhookEndpoint() {
					const persistence = yield* Effect.service(Persistence);
					return yield* persistence.webhookEndpoints.rotateSigningKey({
						endpointId: "default",
						graceExpiresAt: "2026-01-08T00:00:00.000Z",
						newKeyId,
						newSecret: `${newKeyId}-secret`,
						rotatedAt,
					});
				})
			);

		await Promise.all([
			rotateEndpoint("key-new-a", "2026-01-02T00:00:00.000Z"),
			rotateEndpoint("key-new-b", "2026-01-02T00:00:01.000Z"),
		]);

		const activeKeys = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* listWebhookKeys() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.webhookEndpoints.listActiveKeys(
					"default",
					"2026-01-03T00:00:00.000Z"
				);
			})
		);

		expect(activeKeys.filter((key) => key.role === "primary")).toHaveLength(1);
		expect(activeKeys[0]?.role).toBe("primary");
	});

	it("rejects invalid webhook signing key roles at the database layer", async () => {
		const dbPath = sqliteFile("webhook-role-check");
		let rejectedInvalidRole = false;
		await Effect.runPromise(
			Effect.gen(function* initializePersistence() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.list();
			}).pipe(
				Effect.provide(
					makeSqlitePersistenceLayer({
						filename: dbPath,
						migrationHooks: {
							afterMigrations: (sql) =>
								Effect.gen(function* insertInvalidWebhookSigningKey() {
									yield* sql`INSERT INTO webhook_endpoints (
										id,
										tenant_id,
										url,
										created_at,
										updated_at
									) VALUES (
										${"default"},
										${"tenant-a"},
										${"https://tenant.example/webhook"},
										${"2026-01-01T00:00:00.000Z"},
										${"2026-01-01T00:00:00.000Z"}
									)`;
									const result =
										yield* Effect.result(sql`INSERT INTO webhook_signing_keys (
										id,
										tenant_id,
										endpoint_id,
										secret_ciphertext,
										secret_key_id,
										secret_nonce,
										secret_tag,
										secret_encrypted_data_key,
										secret_data_key_nonce,
										secret_data_key_tag,
										role,
										expires_at,
										created_at
									) VALUES (
										${"key-invalid"},
										${"tenant-a"},
										${"default"},
										${"ciphertext"},
										${"test-key"},
										${"nonce"},
										${"tag"},
										${"encrypted-data-key"},
										${"data-key-nonce"},
										${"data-key-tag"},
										${"invalid"},
										${null},
										${"2026-01-01T00:00:00.000Z"}
									)`);
									rejectedInvalidRole = result._tag === "Failure";
								}),
						},
					})
				),
				withTenant("tenant-a")
			)
		);

		expect(rejectedInvalidRole).toBe(true);
	});

	it("persists chat runtime state, subscriptions, and locks", async () => {
		const dbPath = sqliteFile("chat-runtime-state");
		const now = Date.now();
		const initialStateAt = new Date(now).toISOString();
		const initialStateExpiresAt = new Date(
			now + 365 * 24 * 60 * 60 * 1000
		).toISOString();
		const duplicateWriteAt = new Date(now + 1000).toISOString();
		const subscribedAt = new Date(now + 2000).toISOString();
		const firstLockAcquiredAt = new Date(now + 3000).toISOString();
		const firstLockExpiresAt = new Date(now + 10 * 60 * 1000).toISOString();
		const secondLockAcquiredAt = new Date(now + 4000).toISOString();
		const secondLockExpiresAt = new Date(
			now + 10 * 60 * 1000 + 1000
		).toISOString();
		const extendedExpiresAt = new Date(now + 20 * 60 * 1000).toISOString();
		const extendedAfterReleaseExpiresAt = new Date(
			now + 25 * 60 * 1000
		).toISOString();
		const thirdLockAcquiredAt = new Date(now + 5000).toISOString();
		const thirdLockExpiresAt = new Date(now + 30 * 60 * 1000).toISOString();
		const fourthLockAcquiredAt = new Date(now + 6000).toISOString();
		const fourthLockExpiresAt = new Date(now + 35 * 60 * 1000).toISOString();

		const result = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* exerciseChatRuntimeState() {
				const persistence = yield* Effect.service(Persistence);
				yield* persistence.chatRuntimeState.set({
					createdAt: initialStateAt,
					expiresAt: initialStateExpiresAt,
					key: "thread:state:1",
					updatedAt: initialStateAt,
					value: { mode: "ai" },
				});
				const cached =
					yield* persistence.chatRuntimeState.get("thread:state:1");
				const inserted = yield* persistence.chatRuntimeState.setIfNotExists({
					createdAt: initialStateAt,
					key: "dedupe:1",
					updatedAt: initialStateAt,
					value: { seen: true },
				});
				const duplicate = yield* persistence.chatRuntimeState.setIfNotExists({
					createdAt: duplicateWriteAt,
					key: "dedupe:1",
					updatedAt: duplicateWriteAt,
					value: { seen: false },
				});
				yield* persistence.chatRuntimeState.subscribe({
					subscribedAt,
					threadId: "resend:subject@example.com:abc123",
				});
				const subscribed = yield* persistence.chatRuntimeState.isSubscribed(
					"resend:subject@example.com:abc123"
				);
				const firstLock = yield* persistence.chatRuntimeState.acquireLock({
					acquiredAt: firstLockAcquiredAt,
					expiresAt: firstLockExpiresAt,
					threadId: "resend:subject@example.com:abc123",
					token: "lock-1",
				});
				const secondLock = yield* persistence.chatRuntimeState.acquireLock({
					acquiredAt: secondLockAcquiredAt,
					expiresAt: secondLockExpiresAt,
					threadId: "resend:subject@example.com:abc123",
					token: "lock-2",
				});
				const extended = yield* persistence.chatRuntimeState.extendLock({
					expiresAt: extendedExpiresAt,
					threadId: "resend:subject@example.com:abc123",
					token: "lock-1",
				});
				yield* persistence.chatRuntimeState.releaseLock({
					threadId: "resend:subject@example.com:abc123",
					token: "lock-1",
				});
				const extendedAfterRelease =
					yield* persistence.chatRuntimeState.extendLock({
						expiresAt: extendedAfterReleaseExpiresAt,
						threadId: "resend:subject@example.com:abc123",
						token: "lock-1",
					});
				const thirdLock = yield* persistence.chatRuntimeState.acquireLock({
					acquiredAt: thirdLockAcquiredAt,
					expiresAt: thirdLockExpiresAt,
					threadId: "resend:subject@example.com:abc123",
					token: "lock-3",
				});
				yield* persistence.chatRuntimeState.releaseLock({
					threadId: "resend:subject@example.com:abc123",
					token: "wrong-token",
				});
				const lockAfterWrongRelease =
					yield* persistence.chatRuntimeState.acquireLock({
						acquiredAt: fourthLockAcquiredAt,
						expiresAt: fourthLockExpiresAt,
						threadId: "resend:subject@example.com:abc123",
						token: "lock-4",
					});
				yield* persistence.chatRuntimeState.releaseLock({
					threadId: "resend:subject@example.com:abc123",
					token: "lock-3",
				});
				yield* persistence.chatRuntimeState.unsubscribe(
					"resend:subject@example.com:abc123"
				);
				const subscribedAfter =
					yield* persistence.chatRuntimeState.isSubscribed(
						"resend:subject@example.com:abc123"
					);
				const missing = yield* persistence.chatRuntimeState.get("missing:key");
				yield* persistence.chatRuntimeState.delete("thread:state:1");
				const deleted =
					yield* persistence.chatRuntimeState.get("thread:state:1");
				return {
					cached,
					deleted,
					duplicate,
					extended,
					extendedAfterRelease,
					firstLock,
					inserted,
					lockAfterWrongRelease,
					missing,
					secondLock,
					subscribed,
					subscribedAfter,
					thirdLock,
				};
			})
		);
		expect(result.cached?.value).toStrictEqual({ mode: "ai" });
		expect(result.deleted).toBeNull();
		expect(result.inserted).toBeTruthy();
		expect(result.duplicate).toBeFalsy();
		expect(result.subscribed).toBeTruthy();
		expect(result.subscribedAfter).toBeFalsy();
		expect(result.firstLock?.token).toBe("lock-1");
		expect(result.secondLock).toBeNull();
		expect(result.extended).toBeTruthy();
		expect(result.extendedAfterRelease).toBeFalsy();
		expect(result.thirdLock?.token).toBe("lock-3");
		expect(result.lockAfterWrongRelease).toBeNull();
		expect(result.missing).toBeNull();
	});

	it("treats expired chat locks as non-renewable and reacquirable", async () => {
		const dbPath = sqliteFile("chat-runtime-expired-locks");
		const threadId = "resend:subject@example.com:expired-lock";
		const nowMs = Date.now();
		const expiredAcquiredAt = new Date(nowMs - 120_000).toISOString();
		const expiredAt = new Date(nowMs - 60_000).toISOString();
		const reacquiredAt = new Date(nowMs + 1000).toISOString();
		const renewedAt = new Date(nowMs + 120_000).toISOString();
		const extendedAt = new Date(nowMs + 180_000).toISOString();

		const result = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* exerciseExpiredLocks() {
				const persistence = yield* Effect.service(Persistence);
				const expiredLock = yield* persistence.chatRuntimeState.acquireLock({
					acquiredAt: expiredAcquiredAt,
					expiresAt: expiredAt,
					threadId,
					token: "lock-expired",
				});
				const extendExpired = yield* persistence.chatRuntimeState.extendLock({
					expiresAt: renewedAt,
					threadId,
					token: "lock-expired",
				});
				const reacquiredLock = yield* persistence.chatRuntimeState.acquireLock({
					acquiredAt: reacquiredAt,
					expiresAt: renewedAt,
					threadId,
					token: "lock-active",
				});
				const staleTokenExtend = yield* persistence.chatRuntimeState.extendLock(
					{
						expiresAt: extendedAt,
						threadId,
						token: "lock-expired",
					}
				);
				const activeOwnerExtend =
					yield* persistence.chatRuntimeState.extendLock({
						expiresAt: extendedAt,
						threadId,
						token: "lock-active",
					});
				return {
					activeOwnerExtend,
					expiredLock,
					extendExpired,
					reacquiredLock,
					staleTokenExtend,
				};
			})
		);
		expect(result.expiredLock?.token).toBe("lock-expired");
		expect(result.extendExpired).toBeFalsy();
		expect(result.reacquiredLock?.token).toBe("lock-active");
		expect(result.staleTokenExtend).toBeFalsy();
		expect(result.activeOwnerExtend).toBeTruthy();
	});
});

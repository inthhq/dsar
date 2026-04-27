import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeSqlitePersistenceLayer } from "../../persistence-sqlite/src";
import { Persistence, withTenant } from "../src";

const sqliteFile = (name: string): string =>
	`/tmp/dsar-persistence-${name}-${crypto.randomUUID()}.sqlite`;

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

const runForTenant = <A>(
	filename: string,
	tenantId: string,
	program: Effect.Effect<A, unknown, Persistence>
) =>
	Effect.runPromise(
		program.pipe(
			Effect.provide(makeSqlitePersistenceLayer({ filename })),
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

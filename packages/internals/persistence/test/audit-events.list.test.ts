import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makeSqlitePersistenceLayer } from "../../persistence-sqlite/src";
import { Persistence, withTenant } from "../src";
import type { CreateAuditEventInput } from "../src";

const sqliteFile = (name: string): string =>
	`/tmp/dsar-audit-list-${name}-${crypto.randomUUID()}.sqlite`;

const webhookSigningSecretEncryption = {
	key: "test-webhook-signing-secret-encryption-key",
	keyId: "test-key",
} as const;

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

const makeAuditInput = (override: {
	readonly id: string;
	readonly sequence: number;
	readonly createdAt: string;
	readonly actor?: string;
	readonly action?: string;
	readonly requestId?: string;
	readonly prevHash?: string;
}): CreateAuditEventInput => ({
	action: override.action ?? "capture",
	actor: override.actor ?? "operator-1",
	after: {},
	before: {},
	createdAt: override.createdAt,
	hash: `hash-${override.id}`,
	hashAlg: "sha256",
	id: override.id,
	object: "request",
	prevHash: override.prevHash,
	reason: {},
	requestId: override.requestId ?? "req-1",
	sequence: override.sequence,
});

const seedEvents = (events: readonly CreateAuditEventInput[]) =>
	Effect.gen(function* seedProgram() {
		const persistence = yield* Effect.service(Persistence);
		for (const input of events) {
			yield* persistence.auditEvents.append(input);
		}
	});

describe("auditEvents.list", () => {
	it("returns events newest-first with cursor when more rows remain", async () => {
		const dbPath = sqliteFile("cursor");
		const page = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* program() {
				const persistence = yield* Effect.service(Persistence);
				yield* seedEvents([
					makeAuditInput({
						createdAt: "2026-01-01T00:00:00.000Z",
						id: "evt-1",
						sequence: 1,
					}),
					makeAuditInput({
						createdAt: "2026-01-02T00:00:00.000Z",
						id: "evt-2",
						sequence: 2,
					}),
					makeAuditInput({
						createdAt: "2026-01-03T00:00:00.000Z",
						id: "evt-3",
						sequence: 3,
					}),
				]);
				return yield* persistence.auditEvents.list({ limit: 2 });
			})
		);
		expect(page.items.map((event) => event.id)).toStrictEqual([
			"evt-3",
			"evt-2",
		]);
		expect(page.nextCursor).toMatchObject({
			createdAt: "2026-01-02T00:00:00.000Z",
			id: "evt-2",
		});
	});

	it("continues from the returned cursor across pages", async () => {
		const dbPath = sqliteFile("cursor-continue");
		const result = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* program() {
				const persistence = yield* Effect.service(Persistence);
				yield* seedEvents([
					makeAuditInput({
						createdAt: "2026-01-01T00:00:00.000Z",
						id: "evt-1",
						sequence: 1,
					}),
					makeAuditInput({
						createdAt: "2026-01-02T00:00:00.000Z",
						id: "evt-2",
						sequence: 2,
					}),
					makeAuditInput({
						createdAt: "2026-01-03T00:00:00.000Z",
						id: "evt-3",
						sequence: 3,
					}),
				]);
				const first = yield* persistence.auditEvents.list({ limit: 2 });
				const second = yield* persistence.auditEvents.list({
					cursor: first.nextCursor,
					limit: 2,
				});
				return { first, second };
			})
		);
		expect(result.second.items.map((event) => event.id)).toStrictEqual([
			"evt-1",
		]);
		expect(result.second.nextCursor).toBeUndefined();
	});

	it("filters by actor, action, request id, and creation window independently", async () => {
		const dbPath = sqliteFile("filters");
		const result = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* program() {
				const persistence = yield* Effect.service(Persistence);
				yield* seedEvents([
					makeAuditInput({
						action: "capture",
						actor: "operator-1",
						createdAt: "2026-01-01T00:00:00.000Z",
						id: "evt-1",
						requestId: "req-1",
						sequence: 1,
					}),
					makeAuditInput({
						action: "verify",
						actor: "operator-2",
						createdAt: "2026-01-02T00:00:00.000Z",
						id: "evt-2",
						requestId: "req-1",
						sequence: 2,
					}),
					makeAuditInput({
						action: "capture",
						actor: "operator-1",
						createdAt: "2026-01-03T00:00:00.000Z",
						id: "evt-3",
						requestId: "req-2",
						sequence: 3,
					}),
				]);
				const byActor = yield* persistence.auditEvents.list({
					actor: "operator-2",
				});
				const byAction = yield* persistence.auditEvents.list({
					action: "capture",
				});
				const byRequest = yield* persistence.auditEvents.list({
					requestId: "req-2",
				});
				const inWindow = yield* persistence.auditEvents.list({
					createdAfter: "2026-01-02T00:00:00.000Z",
					createdBefore: "2026-01-02T23:59:59.000Z",
				});
				return { byAction, byActor, byRequest, inWindow };
			})
		);
		expect(result.byActor.items.map((event) => event.id)).toStrictEqual([
			"evt-2",
		]);
		expect(result.byAction.items.map((event) => event.id)).toStrictEqual([
			"evt-3",
			"evt-1",
		]);
		expect(result.byRequest.items.map((event) => event.id)).toStrictEqual([
			"evt-3",
		]);
		expect(result.inWindow.items.map((event) => event.id)).toStrictEqual([
			"evt-2",
		]);
	});

	it("returns the empty page when requestIds filter is empty", async () => {
		const dbPath = sqliteFile("empty-request-ids");
		const page = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* program() {
				const persistence = yield* Effect.service(Persistence);
				yield* seedEvents([
					makeAuditInput({
						createdAt: "2026-01-01T00:00:00.000Z",
						id: "evt-1",
						sequence: 1,
					}),
				]);
				return yield* persistence.auditEvents.list({ requestIds: [] });
			})
		);
		expect(page.items).toStrictEqual([]);
	});

	it("scopes results to the active tenant", async () => {
		const dbPath = sqliteFile("tenant-isolation");
		await runForTenant(
			dbPath,
			"tenant-a",
			seedEvents([
				makeAuditInput({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "evt-a",
					sequence: 1,
				}),
			])
		);
		await runForTenant(
			dbPath,
			"tenant-b",
			seedEvents([
				makeAuditInput({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "evt-b",
					sequence: 1,
				}),
			])
		);
		const tenantA = await runForTenant(
			dbPath,
			"tenant-a",
			Effect.gen(function* program() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.auditEvents.list({});
			})
		);
		expect(tenantA.items.map((event) => event.id)).toStrictEqual(["evt-a"]);
	});
});

import { Persistence, withTenant } from "@dsar/persistence";
import { makePgPersistenceLayer } from "@dsar/persistence-pg";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

const pgUrl = process.env.DSAR_TEST_PG_URL;
const hasPgUrl = typeof pgUrl === "string" && pgUrl.length > 0;

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
	tenantId: string,
	program: Effect.Effect<A, unknown, Persistence>
) =>
	Effect.runPromise(
		program.pipe(
			Effect.provide(
				makePgPersistenceLayer({
					config: { url: pgUrl },
				})
			),
			withTenant(tenantId)
		)
	);

describe("pg persistence layer", () => {
	it.skipIf(!hasPgUrl)(
		"applies migrations and enforces tenant isolation",
		async () => {
			const tenantA = `tenant-a-${crypto.randomUUID()}`;
			const tenantB = `tenant-b-${crypto.randomUUID()}`;
			const requestId = `req-${crypto.randomUUID()}`;

			await runForTenant(
				tenantA,
				Effect.gen(function* createRequestForTenantA() {
					const persistence = yield* Effect.service(Persistence);
					yield* persistence.requests.create({
						...baseRequest,
						id: requestId,
					});
				})
			);

			const listForTenantB = await runForTenant(
				tenantB,
				Effect.gen(function* listForTenantBProgram() {
					const persistence = yield* Effect.service(Persistence);
					return yield* persistence.requests.list();
				})
			);

			expect(listForTenantB).toHaveLength(0);
		}
	);

	it.skipIf(!hasPgUrl)(
		"fails closed when tenant context is missing",
		async () => {
			const program = Effect.gen(function* _() {
				const persistence = yield* Effect.service(Persistence);
				return yield* persistence.requests.list();
			}).pipe(
				Effect.provide(
					makePgPersistenceLayer({
						config: { url: pgUrl },
					})
				)
			);

			const result = await Effect.runPromise(Effect.result(program));
			expect(result._tag).toBe("Failure");
		}
	);
});

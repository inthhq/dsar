import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dsarInstance } from "../../src";
import {
	TEST_MEMBER_HEADERS,
	TEST_RUNTIME_AUTH,
	TEST_SUBJECT_HEADERS,
} from "../auth";
import { makeMemoryPersistence } from "../e2e/fixtures";

interface ListEnvelope {
	readonly data: {
		readonly items: readonly {
			readonly id: string;
			readonly action: string;
			readonly actor: string;
			readonly requestId?: string;
		}[];
		readonly pagination: {
			readonly limit: number;
			readonly nextCursor?: string;
		};
	};
}

interface ExportEnvelope {
	readonly data: {
		readonly events: readonly { readonly id: string }[];
		readonly format: "jsonl" | "csv";
		readonly since: string;
		readonly until?: string;
		readonly rootHash?: string;
		readonly tipHash?: string;
		readonly eventCount: number;
	};
}

const makeRuntime = () => {
	const persistence = makeMemoryPersistence();
	const runtime = dsarInstance({
		...TEST_RUNTIME_AUTH,
		adapters: {
			inbound: "stub",
			notifications: "stub",
			storage: "stub",
		},
		repos: { persistence },
	});
	return { persistence, runtime };
};

const seedAudit = async (
	persistence: ReturnType<typeof makeMemoryPersistence>,
	events: readonly {
		readonly id: string;
		readonly action: string;
		readonly actor: string;
		readonly createdAt: string;
		readonly requestId?: string;
		readonly sequence: number;
	}[]
): Promise<void> => {
	for (const event of events) {
		await Effect.runPromise(
			persistence.auditEvents.append({
				action: event.action,
				actor: event.actor,
				after: {},
				before: {},
				createdAt: event.createdAt,
				hash: `hash-${event.id}`,
				hashAlg: "sha256",
				id: event.id,
				object: "request",
				reason: {},
				requestId: event.requestId,
				sequence: event.sequence,
			})
		);
	}
};

describe("audit routes", () => {
	it("GET /audit returns paginated tenant-scoped events newest-first", async () => {
		const { persistence, runtime } = makeRuntime();
		await seedAudit(persistence, [
			{
				action: "capture",
				actor: "operator-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				id: "evt-1",
				requestId: "req-1",
				sequence: 1,
			},
			{
				action: "verify",
				actor: "operator-2",
				createdAt: "2026-01-02T00:00:00.000Z",
				id: "evt-2",
				requestId: "req-1",
				sequence: 2,
			},
		]);
		const response = await runtime.handler(
			new Request("https://example.test/audit?limit=10", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as ListEnvelope;
		expect(body.data.items.map((item) => item.id)).toStrictEqual([
			"evt-2",
			"evt-1",
		]);
	});

	it("GET /audit filters by event_type and actor", async () => {
		const { persistence, runtime } = makeRuntime();
		await seedAudit(persistence, [
			{
				action: "capture",
				actor: "operator-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				id: "evt-1",
				requestId: "req-1",
				sequence: 1,
			},
			{
				action: "verify",
				actor: "operator-2",
				createdAt: "2026-01-02T00:00:00.000Z",
				id: "evt-2",
				requestId: "req-1",
				sequence: 2,
			},
		]);
		const response = await runtime.handler(
			new Request(
				"https://example.test/audit?event_type=verify&actor=operator-2",
				{
					headers: TEST_MEMBER_HEADERS,
					method: "GET",
				}
			)
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as ListEnvelope;
		expect(body.data.items.map((item) => item.id)).toStrictEqual(["evt-2"]);
	});

	it("GET /audit rejects subject principals", async () => {
		const { runtime } = makeRuntime();
		const response = await runtime.handler(
			new Request("https://example.test/audit", {
				headers: TEST_SUBJECT_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(403);
	});

	it("GET /audit rejects malformed cursors", async () => {
		const { runtime } = makeRuntime();
		const response = await runtime.handler(
			new Request("https://example.test/audit?cursor=not-base64", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(400);
	});

	it("GET /audit/export requires `since`", async () => {
		const { runtime } = makeRuntime();
		const response = await runtime.handler(
			new Request("https://example.test/audit/export", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(400);
	});

	it("GET /audit/export returns events in the time window", async () => {
		const { persistence, runtime } = makeRuntime();
		await seedAudit(persistence, [
			{
				action: "capture",
				actor: "operator-1",
				createdAt: "2025-12-31T00:00:00.000Z",
				id: "evt-0",
				sequence: 0,
			},
			{
				action: "verify",
				actor: "operator-1",
				createdAt: "2026-01-15T00:00:00.000Z",
				id: "evt-1",
				sequence: 1,
			},
			{
				action: "fulfil",
				actor: "operator-1",
				createdAt: "2026-02-15T00:00:00.000Z",
				id: "evt-2",
				sequence: 2,
			},
		]);
		const response = await runtime.handler(
			new Request(
				"https://example.test/audit/export?since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z&format=jsonl",
				{
					headers: TEST_MEMBER_HEADERS,
					method: "GET",
				}
			)
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as ExportEnvelope;
		expect(body.data.eventCount).toBe(1);
		expect(body.data.events.map((event) => event.id)).toStrictEqual(["evt-1"]);
		expect(body.data.format).toBe("jsonl");
	});

	it("GET /audit/export rejects subject principals", async () => {
		const { runtime } = makeRuntime();
		const response = await runtime.handler(
			new Request(
				"https://example.test/audit/export?since=2026-01-01T00:00:00.000Z",
				{
					headers: TEST_SUBJECT_HEADERS,
					method: "GET",
				}
			)
		);
		expect(response.status).toBe(403);
	});
});

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dsarInstance } from "../../src";
import { makeNotificationFixture } from "../adapters/conformance/fixtures";
import {
	TEST_MEMBER_HEADERS,
	TEST_RUNTIME_AUTH,
	TEST_SUBJECT_HEADERS,
} from "../auth";
import { makeMemoryPersistence } from "../e2e/fixtures";

interface DiagnosticsEnvelope {
	readonly data: {
		readonly adapters: readonly {
			readonly capability: string;
			readonly details?: Readonly<Record<string, unknown>>;
			readonly key: string;
			readonly status: string;
		}[];
		readonly migrations: {
			readonly applied: readonly {
				readonly id: number;
				readonly name: string;
			}[];
			readonly current: boolean;
			readonly expected: readonly {
				readonly id: number;
				readonly name: string;
			}[];
		};
		readonly persistence: {
			readonly error?: string;
			readonly reachable: boolean;
		};
	};
}

const makeRuntime = () =>
	dsarInstance({
		...TEST_RUNTIME_AUTH,
		adapters: {
			notifications: makeNotificationFixture(),
			storage: "stub",
		},
		repos: { persistence: makeMemoryPersistence() },
	});

describe("status routes", () => {
	it("GET /status/diagnostics rejects subject principals", async () => {
		const response = await makeRuntime().handler(
			new Request("https://example.test/status/diagnostics", {
				headers: TEST_SUBJECT_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(403);
	});

	it("GET /status/diagnostics returns persistence and adapter diagnostics for operators", async () => {
		const response = await makeRuntime().handler(
			new Request("https://example.test/status/diagnostics", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as DiagnosticsEnvelope;
		expect(body.data.persistence.reachable).toBe(true);
		expect(body.data.migrations.current).toBe(true);
		expect(body.data.migrations.applied).toStrictEqual(
			body.data.migrations.expected
		);
		expect(
			body.data.adapters.map(({ capability, key, status }) => ({
				capability,
				key,
				status,
			}))
		).toStrictEqual([
			{
				capability: "notifications",
				key: "fixture-notifications",
				status: "healthy",
			},
		]);
	});

	it("GET /status/diagnostics handles persistence migration status failure gracefully", async () => {
		const failingPersistence = {
			...makeMemoryPersistence(),
			migrationStatus: () =>
				Effect.fail(new Error("Database connection failed")),
		};

		const failingRuntime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				notifications: makeNotificationFixture(),
				storage: "stub",
			},
			repos: { persistence: failingPersistence },
		});

		const response = await failingRuntime.handler(
			new Request("https://example.test/status/diagnostics", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as DiagnosticsEnvelope;
		expect(body.data.persistence.reachable).toBe(false);
		expect(body.data.persistence.error).toBe("Database connection failed");
		expect(body.data.migrations.current).toBe(false);
		expect(body.data.migrations.applied).toStrictEqual([]);
	});

	it("GET /status/diagnostics handles adapter health check and diagnostics failures gracefully", async () => {
		const failingNotificationAdapter = makeNotificationFixture({
			diagnostics: () => Effect.fail(new Error("Diagnostics failed")),
			healthCheck: () => Effect.fail(new Error("Health check failed")),
		});

		const failingRuntime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			adapters: {
				notifications: failingNotificationAdapter,
				storage: "stub",
			},
			repos: { persistence: makeMemoryPersistence() },
		});

		const response = await failingRuntime.handler(
			new Request("https://example.test/status/diagnostics", {
				headers: TEST_MEMBER_HEADERS,
				method: "GET",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as DiagnosticsEnvelope;
		expect(body.data.adapters[0]).toMatchObject({
			capability: "notifications",
			status: "down",
		});
		expect(body.data.adapters[0]?.details?.diagnostics).toStrictEqual({
			error: "Diagnostics failed",
		});
	});
});

import { describe, expect, it } from "@effect/vitest";

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
		readonly persistence: { readonly reachable: true };
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
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DemoDatabase, DemoDatabaseError } from "../lib/db.ts";
import { runSmokeTest } from "../lib/smoke.ts";

describe("Next.js deletion webhook quickstart", () => {
	it("deletes through the signed route and persists one audit record", async () => {
		await expect(runSmokeTest("smoke-test-signing-secret")).resolves.toEqual({
			auditRecordCount: 1,
			eventId: "evt_smoke_456",
			requestId: "req_smoke_001",
		});
	});

	it("reports SQLite initialization failures with a typed error", () => {
		const directoryPath = mkdtempSync(join(tmpdir(), "dsar-sqlite-error-"));
		let failure: unknown;
		try {
			const database = new DemoDatabase(directoryPath);
			database.close();
		} catch (error) {
			failure = error;
		} finally {
			rmSync(directoryPath, { force: true, recursive: true });
		}

		expect(failure).toBeInstanceOf(DemoDatabaseError);
		if (!(failure instanceof DemoDatabaseError)) {
			throw new Error("Expected DemoDatabaseError.");
		}
		expect(failure.operation).toBe("initialize");
	});

	it("rejects a reused event ID with conflicting metadata", () => {
		const directoryPath = mkdtempSync(join(tmpdir(), "dsar-event-conflict-"));
		const databasePath = join(directoryPath, "demo.sqlite");
		const database = new DemoDatabase(databasePath);
		try {
			database.seed();
			const delivery = {
				eventId: "evt_conflict_001",
				eventType: "request_captured",
				idempotencyKey: "idem_conflict_001",
				locale: "en-US",
				policyVersion: "2026.1",
				requestId: "req_smoke_001",
			};
			expect(database.deleteForRequest(delivery)).toBe(true);
			expect(() =>
				database.deleteForRequest({
					...delivery,
					requestId: "req_other_002",
				})
			).toThrow(DemoDatabaseError);
			expect(database.findByRequestId("req_other_002")).toBeDefined();
			expect(database.countAuditRecords()).toBe(1);
		} finally {
			database.close();
			rmSync(directoryPath, { force: true, recursive: true });
		}
	});
});

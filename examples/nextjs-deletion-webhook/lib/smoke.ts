import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	closeDemoDatabase,
	countDeletionAuditRecords,
	findDeletionAuditByEventId,
	findDemoUserByRequestId,
	seedDemoUsers,
} from "./db.ts";

const textEncoder = new TextEncoder();

const computeHmacHex = async (
	body: string,
	secret: string
): Promise<string> => {
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		textEncoder.encode(body)
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const isExactAcknowledgement = (value: unknown): boolean =>
	isRecord(value) && Object.keys(value).length === 1 && value.ok === true;

const requireAcknowledgement = async (response: Response): Promise<void> => {
	if (response.status !== 200) {
		throw new Error(`Expected HTTP 200 but received ${response.status}.`);
	}
	const body: unknown = await response.json();
	if (!isExactAcknowledgement(body)) {
		throw new Error("Expected response body { ok: true }.");
	}
};

export interface SmokeTestResult {
	readonly auditRecordCount: number;
	readonly eventId: string;
	readonly requestId: string;
}

/** Runs the signed webhook through the public Next.js route boundary. */
export const runSmokeTest = async (
	signingSecret: string
): Promise<SmokeTestResult> => {
	if (signingSecret.trim().length === 0) {
		throw new Error("A non-empty smoke-test signing secret is required.");
	}
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), "dsar-nextjs-webhook-")
	);
	const databasePath = join(temporaryDirectory, "demo.sqlite");
	const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
	const previousSigningSecret = process.env.DSAR_WEBHOOK_SECRET;
	process.env.DEMO_DATABASE_PATH = databasePath;
	process.env.DSAR_WEBHOOK_SECRET = signingSecret;

	try {
		seedDemoUsers(databasePath);
		const requestId = "req_smoke_001";
		if (!findDemoUserByRequestId(requestId)) {
			throw new Error(
				"Expected the linked demo user to exist before deletion."
			);
		}

		const eventId = "evt_smoke_456";
		const payload = {
			correlationId: "corr_smoke_123",
			eventId,
			eventType: "request_captured",
			idempotencyKey: "idem_smoke_789",
			locale: "en-US",
			payload: {
				action: "capture",
				dueAt: "2026-09-29T12:00:00.000Z",
				status: "captured",
			},
			policyVersion: "2026.1",
			requestId,
		};
		const rawBody = JSON.stringify(payload);
		const signature = await computeHmacHex(rawBody, signingSecret);
		const makeRequest = () =>
			new Request("http://localhost:3000/api/webhooks/dsar", {
				body: rawBody,
				headers: {
					"content-type": "application/json",
					"x-dsar-signature": signature,
				},
				method: "POST",
			});
		const { POST } = await import("../app/api/webhooks/dsar/route.ts");

		await requireAcknowledgement(await POST(makeRequest()));
		await requireAcknowledgement(await POST(makeRequest()));

		if (findDemoUserByRequestId(requestId) !== undefined) {
			throw new Error("The linked demo user was not deleted from SQLite.");
		}
		const auditRecord = findDeletionAuditByEventId(eventId);
		if (
			!auditRecord ||
			auditRecord.requestId !== requestId ||
			auditRecord.eventType !== "request_captured" ||
			auditRecord.idempotencyKey !== "idem_smoke_789" ||
			auditRecord.policyVersion !== "2026.1" ||
			auditRecord.locale !== "en-US" ||
			auditRecord.recordDeleted !== true ||
			Number.isNaN(Date.parse(auditRecord.processedAt))
		) {
			throw new Error("The durable deletion audit record is incomplete.");
		}
		const auditRecordCount = countDeletionAuditRecords();
		if (auditRecordCount !== 1) {
			throw new Error(
				"A retried event must not create a duplicate audit record."
			);
		}
		return { auditRecordCount, eventId, requestId };
	} finally {
		closeDemoDatabase();
		if (previousDatabasePath === undefined) {
			delete process.env.DEMO_DATABASE_PATH;
		} else {
			process.env.DEMO_DATABASE_PATH = previousDatabasePath;
		}
		if (previousSigningSecret === undefined) {
			delete process.env.DSAR_WEBHOOK_SECRET;
		} else {
			process.env.DSAR_WEBHOOK_SECRET = previousSigningSecret;
		}
		rmSync(temporaryDirectory, { force: true, recursive: true });
	}
};

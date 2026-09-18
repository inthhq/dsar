import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	createDeletionWebhookPostHandler,
	createRoutePostHandler,
} from "../lib/receiver";
import { DemoStore } from "../lib/store";

const signingSecret = "whsec_smoke_test";
const demoEmail = "ada@example.com";
const requestId = "req_smoke_001";

const signBody = (body: string): string =>
	createHmac("sha256", signingSecret).update(body).digest("hex");

const makeEvent = (input: {
	readonly eventId: string;
	readonly eventType: "request_captured" | "request_fulfilled";
	readonly payload: Record<string, unknown>;
}): string =>
	JSON.stringify({
		correlationId: "corr_smoke_001",
		eventId: input.eventId,
		eventType: input.eventType,
		idempotencyKey: `idem_${input.eventId}`,
		locale: "en-US",
		payload: input.payload,
		policyVersion: "2026.1",
		requestId,
	});

const post = (
	handler: (request: Request) => Promise<Response>,
	body: string,
	signature?: string
): Promise<Response> => {
	const headers = new Headers({ "content-type": "application/json" });
	if (signature) {
		headers.set("x-dsar-signature", signature);
	}
	return handler(
		new Request("http://localhost/api/webhooks/dsar", {
			body,
			headers,
			method: "POST",
		})
	);
};

describe("Next.js deletion webhook receiver", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directoryPath of directories.splice(0)) {
			rmSync(directoryPath, { force: true, recursive: true });
		}
	});

	const makeStore = (): DemoStore => {
		const directoryPath = mkdtempSync(join(tmpdir(), "dsar-webhook-demo-"));
		directories.push(directoryPath);
		const store = new DemoStore(join(directoryPath, "demo-users.json"));
		store.seed({ email: demoEmail, requestId });
		return store;
	};

	it("does not delete on request_captured and deletes on request_fulfilled", async () => {
		const store = makeStore();
		const handler = createDeletionWebhookPostHandler({
			signingSecret,
			store,
		});

		const captureBody = makeEvent({
			eventId: "evt_capture_001",
			eventType: "request_captured",
			payload: {
				action: "capture",
				dueAt: "2026-04-15T00:00:00.000Z",
				status: "captured",
			},
		});
		const captureResponse = await post(
			handler,
			captureBody,
			signBody(captureBody)
		);
		expect(captureResponse.status).toBe(200);
		await expect(captureResponse.json()).resolves.toEqual({ ok: true });
		expect(store.getUser(requestId)).toEqual({
			email: demoEmail,
			requestId,
		});
		expect(store.listAudit()).toEqual([
			{
				email: demoEmail,
				eventId: "evt_capture_001",
				eventType: "request_captured",
				requestId,
				result: "ignored_until_fulfilment",
			},
		]);

		const fulfilBody = makeEvent({
			eventId: "evt_fulfil_001",
			eventType: "request_fulfilled",
			payload: {
				email: "attacker@example.com",
				from: "in_progress",
				to: "fulfilled",
			},
		});
		const fulfilResponse = await post(
			handler,
			fulfilBody,
			signBody(fulfilBody)
		);
		expect(fulfilResponse.status).toBe(200);
		await expect(fulfilResponse.json()).resolves.toEqual({ ok: true });
		expect(store.getUser(requestId)).toBeUndefined();
		expect(store.listUsers()).toEqual([]);
		expect(store.listAudit().at(-1)).toEqual({
			email: demoEmail,
			eventId: "evt_fulfil_001",
			eventType: "request_fulfilled",
			requestId,
			result: "deleted",
		});
	});

	it("returns 401 for a missing or invalid signature without deleting", async () => {
		const store = makeStore();
		const handler = createDeletionWebhookPostHandler({
			signingSecret,
			store,
		});
		const fulfilBody = makeEvent({
			eventId: "evt_fulfil_401",
			eventType: "request_fulfilled",
			payload: { from: "in_progress", to: "fulfilled" },
		});

		const missing = await post(handler, fulfilBody);
		expect(missing.status).toBe(401);
		await expect(missing.json()).resolves.toEqual({
			error: "missing_signature",
			ok: false,
		});

		const invalid = await post(handler, fulfilBody, "deadbeef");
		expect(invalid.status).toBe(401);
		await expect(invalid.json()).resolves.toEqual({
			error: "invalid_signature",
			ok: false,
		});

		expect(store.getUser(requestId)).toEqual({
			email: demoEmail,
			requestId,
		});
		expect(store.listAudit()).toEqual([]);
	});

	it("requires DSAR_WEBHOOK_SECRET for the route handler", () => {
		const previous = process.env.DSAR_WEBHOOK_SECRET;
		delete process.env.DSAR_WEBHOOK_SECRET;
		try {
			expect(() => createRoutePostHandler()).toThrow(
				"DSAR_WEBHOOK_SECRET is required."
			);
		} finally {
			if (previous === undefined) {
				delete process.env.DSAR_WEBHOOK_SECRET;
			} else {
				process.env.DSAR_WEBHOOK_SECRET = previous;
			}
		}
	});

	it("is idempotent for a repeated fulfilment event id", async () => {
		const store = makeStore();
		const handler = createDeletionWebhookPostHandler({
			signingSecret,
			store,
		});
		const fulfilBody = makeEvent({
			eventId: "evt_fulfil_repeat",
			eventType: "request_fulfilled",
			payload: { from: "in_progress", to: "fulfilled" },
		});
		const signature = signBody(fulfilBody);

		const first = await post(handler, fulfilBody, signature);
		const second = await post(handler, fulfilBody, signature);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(store.getUser(requestId)).toBeUndefined();
		expect(store.listAudit().map((entry) => entry.result)).toEqual([
			"deleted",
			"already_processed",
		]);
	});
});

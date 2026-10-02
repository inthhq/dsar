import { dsarInstance } from "@dsar/backend";
import type { NotificationAdapterContract } from "@dsar/backend";
import { makeMinimalPersistenceSync } from "@dsar/backend/testing/minimal-persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { E2E_API_TOKEN, getRelevantOutput, runE2eCli } from "./harness";

const webhookConfig = {
	endpointId: "default",
	retryDelayMs: 1,
	retryMaxAttempts: 1,
	signingSecret: "cli-e2e-secret",
	tenantScoped: true,
	timeoutMs: 1000,
	url: "https://tenant.example/webhook",
} as const;

const makeDeliveringAdapter = (): NotificationAdapterContract => ({
	capability: "notifications",
	channels: ["webhook"],
	diagnostics: () =>
		Effect.succeed({
			capability: "notifications",
			key: "cli-dlq-webhook",
		}),
	healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
	init: () => Effect.void,
	key: "cli-dlq-webhook",
	send: () =>
		Effect.succeed({
			responseCode: 200,
			status: "delivered",
		}),
	validateConfig: () => Effect.void,
});

const seedDeadDispatch = async (
	persistence: ReturnType<typeof makeMinimalPersistenceSync>
): Promise<void> => {
	await Effect.runPromise(
		persistence.notificationEvents.append({
			correlationId: "corr-dlq",
			createdAt: "2026-02-20T00:00:00.000Z",
			eventType: "acknowledgement_sent",
			id: "evt-dlq-1",
			idempotencyKey: "event-dlq-1",
			locale: "en-GB",
			payload: { note: "dead webhook" },
			policyVersion: "policy-v1",
			requestId: "req-dlq-1",
		})
	);
	await Effect.runPromise(
		persistence.notificationDeliveryAttempts.append({
			attempt: 6,
			channel: "webhook",
			createdAt: "2026-02-20T00:01:00.000Z",
			destination: webhookConfig.url,
			error: "500 Internal Server Error",
			id: "dispatch-dlq-1",
			notificationEventId: "evt-dlq-1",
			requestId: "req-dlq-1",
			responseCode: 500,
			status: "dead",
		})
	);
};

describe("cLI webhook DLQ", () => {
	it("lists and replays a dead outbound webhook dispatch", async () => {
		const persistence = makeMinimalPersistenceSync();
		await seedDeadDispatch(persistence);
		const runtime = dsarInstance({
			adapters: {
				notifications: makeDeliveringAdapter(),
			},
			config: {
				auth: {
					staticBearerTokens: {
						[E2E_API_TOKEN]: {
							actorId: "cli-e2e",
							role: "admin",
							tenantId: "tenant-default",
						},
					},
				},
				notificationWebhook: webhookConfig,
			},
			repos: { persistence },
		});
		const fetchImpl = async (
			input: string | URL | Request,
			init?: RequestInit
		): Promise<Response> => {
			const request =
				input instanceof Request
					? new Request(input, init)
					: new Request(input.toString(), init);
			return await runtime.handler(request);
		};

		const listed = await runE2eCli({
			argv: ["webhooks", "dlq", "list"],
			fetch: fetchImpl,
		});
		expect(listed.exitCode).toBe(0);
		const listedOutput = getRelevantOutput(listed, 0);
		expect(listedOutput).toContain('"dispatchId":"dispatch-dlq-1"');
		expect(listedOutput).toContain('"status":"dead"');
		expect(listedOutput).toContain('"total":1');

		const failedList = await runE2eCli({
			argv: ["webhooks", "list", "--status=failed"],
			fetch: fetchImpl,
		});
		expect(failedList.exitCode).toBe(0);
		expect(getRelevantOutput(failedList, 0)).toContain('"total":0');

		const replayed = await runE2eCli({
			argv: [
				"webhooks",
				"dlq",
				"replay",
				"dispatch-dlq-1",
				"--idempotency-key=dlq-replay-dead",
			],
			fetch: fetchImpl,
		});
		expect(replayed.exitCode).toBe(0);
		expect(getRelevantOutput(replayed, 0)).toContain('"status":"replayed"');
	});
});

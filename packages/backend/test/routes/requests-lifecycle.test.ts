/* oxlint-disable jest/max-expects -- lifecycle test has many assertions per step */
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dsarInstance } from "../../src";
import type { InboundAdapterContract } from "../../src";
import { TEST_MEMBER_HEADERS, TEST_RUNTIME_AUTH } from "../auth";
import { makeMemoryPersistence } from "../e2e/fixtures";

const actorHeaders = TEST_MEMBER_HEADERS;

const makeRuntime = (inbound?: InboundAdapterContract) =>
	dsarInstance({
		...TEST_RUNTIME_AUTH,
		adapters: {
			inbound: inbound ? [inbound] : "stub",
			notifications: "stub",
			storage: "stub",
		},
		repos: {
			persistence: makeMemoryPersistence(),
		},
	});

describe("request lifecycle routes", () => {
	it("captures request and returns explainable clock output", async () => {
		const runtime = await makeRuntime();
		const captureResponse = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(captureResponse.status).toBe(202);
		const captureBody = (await captureResponse.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;

		const explainResponse = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/clock/explain`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(explainResponse.status).toBe(200);
		const explainBody = (await explainResponse.json()) as {
			readonly data: {
				readonly requestId: string;
				readonly policyVersion: string;
				readonly clock: { readonly segments: readonly unknown[] };
			};
		};
		expect(explainBody.data.requestId).toBe(requestId);
		expect(explainBody.data.policyVersion).toBe("1.0.0");
		expect(explainBody.data.clock.segments.length).toBeGreaterThan(0);
	});

	it("rejects extension without rationale after entering in_progress", async () => {
		const runtime = await makeRuntime();
		const captureResponse = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const captureBody = (await captureResponse.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;

		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/approve`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);

		const extensionResponse = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/extensions`, {
				body: JSON.stringify({ additionalDays: 3 }),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(extensionResponse.status).toBe(400);
		const errorBody = (await extensionResponse.json()) as {
			readonly error: { readonly code: string };
		};
		expect(errorBody.error.code).toBe("REQUEST_VALIDATION_FAILED");
	});

	it("lists queue items with status filter and sort controls", async () => {
		const runtime = await makeRuntime();
		const firstCapture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const firstBody = (await firstCapture.json()) as {
			readonly data: { readonly id: string };
		};
		const firstId = firstBody.data.id;
		await runtime.handler(
			new Request(
				`https://example.test/requests/${firstId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		const secondCapture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-05T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const secondBody = (await secondCapture.json()) as {
			readonly data: { readonly id: string };
		};
		const secondId = secondBody.data.id;
		const statusFiltered = await runtime.handler(
			new Request("https://example.test/requests?status=verification_pending", {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(statusFiltered.status).toBe(200);
		const statusFilteredBody = (await statusFiltered.json()) as {
			readonly data: {
				readonly items: readonly { readonly id: string }[];
			};
		};
		expect(statusFilteredBody.data.items.map((item) => item.id)).toStrictEqual([
			firstId,
		]);
		const sorted = await runtime.handler(
			new Request(
				"https://example.test/requests?sortBy=receivedAt&sortOrder=asc",
				{
					headers: actorHeaders,
					method: "GET",
				}
			)
		);
		expect(sorted.status).toBe(200);
		const sortedBody = (await sorted.json()) as {
			readonly data: {
				readonly items: readonly { readonly id: string }[];
			};
		};
		expect(sortedBody.data.items[0]?.id).toBe(firstId);
		expect(sortedBody.data.items[1]?.id).toBe(secondId);
	});

	it("returns timeline in lifecycle order and enforces refusal rationale", async () => {
		const runtime = await makeRuntime();
		const capture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const captureBody = (await capture.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/approve`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/clarifications/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		const timeline = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/timeline`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(timeline.status).toBe(200);
		const timelineBody = (await timeline.json()) as {
			readonly data: {
				readonly events: readonly { readonly eventType: string }[];
			};
		};
		expect(
			timelineBody.data.events.map((event) => event.eventType)
		).toStrictEqual([
			"captured",
			"verification_requested",
			"verification_resolved",
			"clarification_requested",
		]);
		const missingRationale = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/refusals`, {
				body: JSON.stringify({}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(missingRationale.status).toBe(400);
		const missingRationaleBody = (await missingRationale.json()) as {
			readonly error: { readonly code: string };
		};
		expect(missingRationaleBody.error.code).toBe("REQUEST_VALIDATION_FAILED");
		const refusal = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/refusals`, {
				body: JSON.stringify({ rationale: "third-party exemption" }),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(refusal.status).toBe(202);
	});

	it("closes fulfilled requests via /closures", async () => {
		const runtime = await makeRuntime();
		const capture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const captureBody = (await capture.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/approve`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		const fulfilled = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/fulfilment`, {
				headers: actorHeaders,
				method: "POST",
			})
		);
		expect(fulfilled.status).toBe(202);

		const closed = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/closures`, {
				headers: actorHeaders,
				method: "POST",
			})
		);
		expect(closed.status).toBe(202);
		const closedBody = (await closed.json()) as {
			readonly data: { readonly status: string };
		};
		expect(closedBody.data.status).toBe("closed");
	});

	it("persists appeals and exposes notification status summaries", async () => {
		const runtime = await makeRuntime();
		const capture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const captureBody = (await capture.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;
		const createAppeal = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/appeals`, {
				body: JSON.stringify({ message: "Please reconsider refusal." }),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(createAppeal.status).toBe(202);
		const createAppealBody = (await createAppeal.json()) as {
			readonly data: { readonly appealId: string };
		};
		const { appealId } = createAppealBody.data;
		const listAppeals = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/appeals`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(listAppeals.status).toBe(200);
		const listAppealsBody = (await listAppeals.json()) as {
			readonly data: readonly { readonly id: string }[];
		};
		expect(
			listAppealsBody.data.some((appeal) => appeal.id === appealId)
		).toBeTruthy();
		const decideAppeal = await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/appeals/${appealId}/decide`,
				{
					body: JSON.stringify({
						decision: "approve",
						explanation: "Decision reversed.",
					}),
					headers: {
						"content-type": "application/json",
						...actorHeaders,
					},
					method: "POST",
				}
			)
		);
		expect(decideAppeal.status).toBe(202);
		const notifications = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/notifications`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(notifications.status).toBe(200);
		const notificationsBody = (await notifications.json()) as {
			readonly data: {
				readonly events: readonly {
					readonly eventType: string;
					readonly status: "generated" | "delivered" | "failed" | "skipped";
				}[];
			};
		};
		expect(
			notificationsBody.data.events.some(
				(event) => event.eventType === "appeal_recorded"
			)
		).toBeTruthy();
	});

	it("does not commit appeal decision side effects for closed requests", async () => {
		const runtime = await makeRuntime();
		const capture = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const captureBody = (await capture.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/approve`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/refusals`, {
				body: JSON.stringify({ rationale: "verification mismatch" }),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const createAppeal = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/appeals`, {
				body: JSON.stringify({ message: "Please reconsider refusal." }),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const createAppealBody = (await createAppeal.json()) as {
			readonly data: { readonly appealId: string };
		};
		await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/closures`, {
				headers: actorHeaders,
				method: "POST",
			})
		);

		const decideAppeal = await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/appeals/${createAppealBody.data.appealId}/decide`,
				{
					body: JSON.stringify({
						decision: "approve",
						explanation: "Overturn refusal.",
					}),
					headers: {
						"content-type": "application/json",
						...actorHeaders,
					},
					method: "POST",
				}
			)
		);
		expect(decideAppeal.status).toBe(400);
		const listAppeals = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/appeals`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		const listAppealsBody = (await listAppeals.json()) as {
			readonly data: readonly {
				readonly id: string;
				readonly status: string;
			}[];
		};
		expect(
			listAppealsBody.data.find(
				(appeal) => appeal.id === createAppealBody.data.appealId
			)?.status
		).toBe("submitted");
		const timeline = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/timeline`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		const timelineBody = (await timeline.json()) as {
			readonly data: {
				readonly events: readonly { readonly eventType: string }[];
			};
		};
		expect(
			timelineBody.data.events.map((event) => event.eventType)
		).toStrictEqual([
			"captured",
			"verification_requested",
			"verification_resolved",
			"refused",
			"appeal_submitted",
			"closed",
		]);
	});

	it("hard-gates capture for unmapped jurisdiction", async () => {
		const runtime = await makeRuntime();
		const response = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "zz-unknown",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(response.status).toBe(400);
		const errorBody = (await response.json()) as {
			readonly error: {
				readonly code: string;
				readonly trace?: {
					readonly guidanceKeys?: readonly string[];
					readonly jurisdiction?: string;
				};
			};
		};
		expect(errorBody.error.code).toBe("POLICY_JURISDICTION_UNMAPPED");
		expect(errorBody.error.trace?.jurisdiction).toBe("zz-unknown");
		expect(errorBody.error.trace?.guidanceKeys?.length).toBeGreaterThan(0);
	});

	it("captures resend inbound webhook and dedupes retries", async () => {
		const inbound: InboundAdapterContract = {
			capability: "inbound",
			diagnostics: () =>
				Effect.succeed({
					capability: "inbound",
					key: "resend",
				}),
			healthCheck: () =>
				Effect.succeed({
					ok: true,
					status: "healthy",
				}),
			init: () => Effect.void,
			key: "resend",
			receive: () =>
				Effect.succeed({
					payload: {
						from: "Jane Subject <jane@example.com>",
						fromEmail: "jane@example.com",
						intent: {
							isDsar: true,
							reason: "matched token",
						},
						route: {
							jurisdiction: "uk",
							tenantId: "tenant-default",
						},
						subject: "Subject access request",
						to: ["privacy@tenant.example"],
					},
					receivedAt: "2026-01-01T00:00:00.000Z",
					sourceId: "resend-email-1",
				}),
			validateConfig: () => Effect.void,
		};
		const runtime = await makeRuntime(inbound);
		const webhookHeaders = {
			"content-type": "application/json",
			"svix-id": "svix-id-1",
			"svix-signature": "svix-signature-1",
			"svix-timestamp": "123",
		};

		const first = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/resend", {
				body: JSON.stringify({ type: "email.received" }),
				headers: webhookHeaders,
				method: "POST",
			})
		);
		const second = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/resend", {
				body: JSON.stringify({ type: "email.received" }),
				headers: webhookHeaders,
				method: "POST",
			})
		);
		expect(first.status).toBe(202);
		expect(second.status).toBe(202);
		const firstBody = (await first.json()) as {
			readonly data: { readonly id: string; readonly sourceId: string };
		};
		const secondBody = (await second.json()) as {
			readonly data: { readonly id: string; readonly sourceId: string };
		};
		expect(firstBody.data.sourceId).toBe("resend-email-1");
		expect(secondBody.data.sourceId).toBe("resend-email-1");
		expect(firstBody.data.id).toBe(secondBody.data.id);
	});

	it("captures slack inbound webhook and dedupes retries", async () => {
		const inbound: InboundAdapterContract = {
			capability: "inbound",
			diagnostics: () =>
				Effect.succeed({
					capability: "inbound",
					key: "slack",
				}),
			healthCheck: () =>
				Effect.succeed({
					ok: true,
					status: "healthy",
				}),
			init: () => Effect.void,
			key: "slack",
			receive: () =>
				Effect.succeed({
					payload: {
						intakeSourceChannel: "slack:privacy",
						intent: {
							isDsar: true,
							reason: "slash command",
						},
						kind: "request_capture",
						provider: "slack",
						rawContextRef: "slack:T123:C123:thread-1",
						requestor: {
							email: "jane@example.com",
							id: "U123",
							name: "Jane Subject",
						},
						route: {
							jurisdiction: "uk",
							tenantId: "tenant-default",
						},
						surface: "slash_command",
						teamId: "T123",
						text: "Please create my DSAR",
					},
					receivedAt: "2026-01-01T00:00:00.000Z",
					sourceId: "slack-event-1",
				}),
			validateConfig: () => Effect.void,
		};
		const runtime = await makeRuntime(inbound);
		const webhookHeaders = {
			"content-type": "application/json",
			"x-slack-request-timestamp": "123",
			"x-slack-signature": "v0=test",
		};

		const first = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: webhookHeaders,
				method: "POST",
			})
		);
		const second = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "event_callback" }),
				headers: webhookHeaders,
				method: "POST",
			})
		);
		expect(first.status).toBe(202);
		expect(second.status).toBe(202);
		const firstBody = (await first.json()) as {
			readonly data: { readonly id: string; readonly sourceId: string };
		};
		const secondBody = (await second.json()) as {
			readonly data: { readonly id: string; readonly sourceId: string };
		};
		expect(firstBody.data.sourceId).toBe("slack-event-1");
		expect(secondBody.data.sourceId).toBe("slack-event-1");
		expect(firstBody.data.id).toBe(secondBody.data.id);
	});

	it("returns slack url verification challenges without capturing a request", async () => {
		const inbound: InboundAdapterContract = {
			capability: "inbound",
			diagnostics: () =>
				Effect.succeed({
					capability: "inbound",
					key: "slack",
				}),
			healthCheck: () =>
				Effect.succeed({
					ok: true,
					status: "healthy",
				}),
			init: () => Effect.void,
			key: "slack",
			receive: () =>
				Effect.succeed({
					payload: {
						challenge: "challenge-123",
						kind: "url_verification",
						provider: "slack",
					},
					receivedAt: "2026-01-01T00:00:00.000Z",
					sourceId: "slack-challenge-1",
				}),
			validateConfig: () => Effect.void,
		};
		const runtime = await makeRuntime(inbound);
		const response = await runtime.handler(
			new Request("https://example.test/webhooks/inbound/slack", {
				body: JSON.stringify({ type: "url_verification" }),
				headers: {
					"content-type": "application/json",
					"x-slack-request-timestamp": "123",
					"x-slack-signature": "v0=test",
				},
				method: "POST",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			readonly challenge: string;
		};
		expect(body.challenge).toBe("challenge-123");
		const requests = await Effect.runPromise(
			runtime.context.repos.persistence.requests.list()
		);
		expect(requests).toHaveLength(0);
	});

	it("clock explain includes policy evaluation data", async () => {
		const runtime = await makeRuntime();
		const captureResponse = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "uk",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		expect(captureResponse.status).toBe(202);
		const captureBody = (await captureResponse.json()) as {
			readonly data: { readonly id: string };
		};
		const requestId = captureBody.data.id;

		const explainResponse = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/clock/explain`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(explainResponse.status).toBe(200);
		const explainBody = (await explainResponse.json()) as {
			readonly data: {
				readonly decision: {
					readonly verificationRequired: boolean;
					readonly appealEligible: boolean;
					readonly refusalEligible: boolean;
				};
				readonly requiredActions: readonly string[];
				readonly explainabilityTrace: readonly {
					readonly code: string;
					readonly message: string;
				}[];
				readonly matchedRuleIds: readonly string[];
			};
		};
		expect(explainBody.data.decision).toBeDefined();
		expectTypeOf(explainBody.data.decision.verificationRequired).toBeBoolean();
		expectTypeOf(explainBody.data.decision.appealEligible).toBeBoolean();
		expectTypeOf(explainBody.data.decision.refusalEligible).toBeBoolean();
		expect(Array.isArray(explainBody.data.requiredActions)).toBeTruthy();
		expect(Array.isArray(explainBody.data.explainabilityTrace)).toBeTruthy();
		expect(explainBody.data.explainabilityTrace.length).toBeGreaterThan(0);
	});

	it("lists available policy packs via GET /policies", async () => {
		const runtime = await makeRuntime();
		const response = await runtime.handler(
			new Request("https://example.test/policies", {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			readonly ok: boolean;
			readonly data: readonly { readonly jurisdiction: string }[];
		};
		expect(body.ok).toBeTruthy();
		expect(Array.isArray(body.data)).toBeTruthy();
		expect(body.data.length).toBeGreaterThan(0);
	});
});

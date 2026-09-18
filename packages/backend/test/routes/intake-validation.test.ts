import { describe, expect, it } from "@effect/vitest";

import type { ErrorEnvelope } from "../../src";
import { dsarInstance } from "../../src";
import {
	TEST_ADMIN_HEADERS,
	TEST_MEMBER_HEADERS,
	TEST_RUNTIME_AUTH,
	TEST_TENANT_ID,
} from "../auth";
import { makeMemoryPersistence } from "../e2e/fixtures";

const actorHeaders = TEST_MEMBER_HEADERS;
const adminHeaders = TEST_ADMIN_HEADERS;

const VALID_INTAKE_SOURCE = {
	channel: "api",
	rawText: "please provide my data",
	receivedAt: "2026-01-01T00:00:00.000Z",
	type: "api",
} as const;

const jsonHeaders = {
	"content-type": "application/json",
	...actorHeaders,
} as const;

const makeRuntime = () =>
	dsarInstance({
		...TEST_RUNTIME_AUTH,
		config: {
			...TEST_RUNTIME_AUTH.config,
			notificationWebhook: {
				endpointId: "default",
				retryDelayMs: 1,
				retryMaxAttempts: 1,
				signingSecret: "old-secret",
				tenantScoped: true,
				timeoutMs: 1000,
				url: "https://tenant.example/webhook",
			},
		},
		repos: { persistence: makeMemoryPersistence() },
	});

const post = (
	path: string,
	input: {
		readonly body?: string;
		readonly headers?: HeadersInit;
	}
) =>
	new Request(`https://example.test${path}`, {
		body: input.body,
		headers: input.headers ?? jsonHeaders,
		method: "POST",
	});

const catalog400Cases = [
	{
		body: "{",
		code: "REQUEST_BODY_INVALID_JSON",
		headers: jsonHeaders,
		name: "capture malformed JSON",
		path: "/requests/capture",
	},
	{
		body: "{}",
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture empty object",
		path: "/requests/capture",
	},
	{
		body: "null",
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture JSON null",
		path: "/requests/capture",
	},
	{
		body: JSON.stringify({
			intakeSource: VALID_INTAKE_SOURCE,
			jurisdiction: 12,
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture jurisdiction as number",
		path: "/requests/capture",
	},
	{
		body: JSON.stringify({
			intakeSource: "portal",
			jurisdiction: "uk",
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture intakeSource as string",
		path: "/requests/capture",
	},
	{
		body: JSON.stringify({
			intakeSource: null,
			jurisdiction: "uk",
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture intakeSource null",
		path: "/requests/capture",
	},
	{
		body: JSON.stringify({
			intakeSource: {
				channel: "api",
				rawText: "please provide my data",
			},
			jurisdiction: "uk",
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture missing intakeSource.receivedAt",
		path: "/requests/capture",
	},
	{
		body: JSON.stringify({
			intakeSource: {
				channel: "api",
				rawText: "please provide my data",
				receivedAt: "yesterday",
			},
			jurisdiction: "uk",
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "capture invalid receivedAt timestamp",
		path: "/requests/capture",
	},
	{
		body: "{",
		code: "REQUEST_BODY_INVALID_JSON",
		headers: jsonHeaders,
		name: "extension malformed JSON",
		path: "/requests/req-missing/extensions",
	},
	{
		body: JSON.stringify({
			additionalDays: "seven",
			rationale: "need more time",
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: jsonHeaders,
		name: "extension additionalDays as string",
		path: "/requests/req-missing/extensions",
	},
	{
		body: "{",
		code: "REQUEST_BODY_INVALID_JSON",
		headers: {
			"content-type": "application/json",
			...actorHeaders,
		},
		method: "PUT",
		name: "retention malformed JSON",
		path: `/tenants/${TEST_TENANT_ID}/retention`,
	},
	{
		body: JSON.stringify({
			class: "request_record",
			maxDays: 1,
			minDays: 30,
		}),
		code: "REQUEST_VALIDATION_FAILED",
		headers: {
			"content-type": "application/json",
			...actorHeaders,
		},
		method: "PUT",
		name: "retention minDays greater than maxDays",
		path: `/tenants/${TEST_TENANT_ID}/retention`,
	},
	{
		body: JSON.stringify({ gracePeriodDays: -1 }),
		code: "REQUEST_VALIDATION_FAILED",
		headers: {
			"content-type": "application/json",
			...adminHeaders,
		},
		name: "rotate-key negative gracePeriodDays",
		path: "/webhooks/endpoints/default/rotate-key",
	},
	{
		body: JSON.stringify({ gracePeriodDays: 1.5 }),
		code: "REQUEST_VALIDATION_FAILED",
		headers: {
			"content-type": "application/json",
			...adminHeaders,
		},
		name: "rotate-key fractional gracePeriodDays",
		path: "/webhooks/endpoints/default/rotate-key",
	},
	{
		body: JSON.stringify({ gracePeriodDays: Number.MAX_SAFE_INTEGER }),
		code: "REQUEST_VALIDATION_FAILED",
		headers: {
			"content-type": "application/json",
			...adminHeaders,
		},
		name: "rotate-key out-of-range gracePeriodDays",
		path: "/webhooks/endpoints/default/rotate-key",
	},
] as const;

describe("intake and admin request validation", () => {
	it.each(catalog400Cases)("$name", async (testCase) => {
		const runtime = makeRuntime();
		const method = "method" in testCase ? testCase.method : "POST";
		const response = await runtime.handler(
			new Request(`https://example.test${testCase.path}`, {
				body: testCase.body,
				headers: testCase.headers,
				method,
			})
		);
		const body = (await response.json()) as ErrorEnvelope;
		expect(response.status).toBe(400);
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe(testCase.code);
		expect(body.error.code).not.toBe("INTERNAL_RUNTIME_ERROR");
		expect(body.error.status).toBe(400);
	});

	it("captures unicode requestor names", async () => {
		const runtime = makeRuntime();
		const response = await runtime.handler(
			post("/requests/capture", {
				body: JSON.stringify({
					intakeSource: VALID_INTAKE_SOURCE,
					jurisdiction: "uk",
					requestor: {
						name: "Zalgo ẓ̵̙a̵l̷g̸o̴ \u202Ertl",
						type: "subject",
					},
				}),
			})
		);
		expect(response.status).toBe(202);
	});

	it("keeps tenant identity on capture from context, not the body", async () => {
		const runtime = makeRuntime();
		const response = await runtime.handler(
			post("/requests/capture", {
				body: JSON.stringify({
					intakeSource: VALID_INTAKE_SOURCE,
					jurisdiction: "uk",
					tenantId: "tenant-from-body",
				}),
			})
		);
		expect(response.status).toBe(202);
		const captured = (await response.json()) as {
			readonly data: { readonly id: string };
		};
		const detail = await runtime.handler(
			new Request(`https://example.test/requests/${captured.data.id}`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(detail.status).toBe(200);
	});
});

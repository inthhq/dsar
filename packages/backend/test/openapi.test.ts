import { describe, expect, it } from "@effect/vitest";

import { dsarInstance } from "../src";
import { makeMemoryPersistence } from "./e2e/fixtures";

const requiredCapabilityPaths = [
	"/requests",
	"/webhooks/inbound/resend",
	"/webhooks/inbound/slack",
	"/webhooks/endpoints/{id}/rotate-key",
	"/requests/capture",
	"/requests/{id}/timeline",
	"/requests/{id}/clock/explain",
	"/requests/{id}/refusals",
	"/requests/{id}/closures",
	"/requests/{id}/verification/request",
	"/requests/{id}/fulfilment/callback",
	"/requests/{id}/appeals",
	"/requests/{id}/appeals/{appealId}/decide",
	"/requests/{id}/notifications",
	"/requests/{id}/delivery/prepare",
	"/requests/{id}/delivery/address/verify",
	"/requests/{id}/delivery/step-up/challenge",
	"/requests/{id}/delivery/step-up/complete",
	"/requests/{id}/artifacts/{artifactId}/download",
	"/requests/{id}/delivery/logs",
	"/tenants/{tenantId}/retention",
	"/requests/{id}/audit/export",
	"/requests/{id}/audit/verify",
] as const;

/** Recursively sort object keys so snapshot is stable across runtimes and CI. */
const normalizeForSnapshot = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(normalizeForSnapshot);
	}
	const obj = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).toSorted()) {
		sorted[key] = normalizeForSnapshot(obj[key]);
	}
	return sorted;
};

describe("openAPI and docs surface", () => {
	it("serves generated OpenAPI JSON at /spec.json", async () => {
		const runtime = dsarInstance({
			repos: { persistence: makeMemoryPersistence() },
		});
		const response = await runtime.handler(
			new Request("https://example.test/spec.json", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("application/json");

		const spec = (await response.json()) as {
			readonly components: {
				readonly securitySchemes?: Readonly<Record<string, unknown>>;
			};
			readonly openapi: string;
			readonly paths: Readonly<Record<string, unknown>>;
		};

		expect(spec.openapi).toBe("3.1.0");
		expect(Object.keys(spec.paths)).toStrictEqual(
			expect.arrayContaining(requiredCapabilityPaths)
		);
		expect(spec.components.securitySchemes).toMatchObject({
			BearerAuth: {
				scheme: "bearer",
				type: "http",
			},
		});
	});

	it("serves interactive docs and links to basePath-aware spec url", async () => {
		const runtime = dsarInstance({
			basePath: "/api/v1",
			repos: { persistence: makeMemoryPersistence() },
		});
		const response = await runtime.handler(
			new Request("https://example.test/api/v1/docs", {
				method: "GET",
			})
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");

		const html = await response.text();
		expect(html).toContain('id="api-reference"');
		expect(html).toContain('data-url="/api/v1/spec.json"');
	});

	it("keeps generated spec stable", async () => {
		const runtime = dsarInstance({
			repos: { persistence: makeMemoryPersistence() },
		});
		const response = await runtime.handler(
			new Request("https://example.test/spec.json", {
				method: "GET",
			})
		);
		const spec = (await response.json()) as unknown;
		expect(normalizeForSnapshot(spec)).toMatchSnapshot();
	});
});

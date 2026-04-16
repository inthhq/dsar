import { describe, expect, it } from "@effect/vitest";

import type { ErrorEnvelope } from "../../src";
import { ACTOR_HEADERS, startApiE2eServer } from "./harness";

describe("api e2e runtime HTTP transport", () => {
	it("serves status, OpenAPI spec, and docs over HTTP", async () => {
		const server = await startApiE2eServer();
		try {
			const status = await server.request({
				method: "GET",
				path: "/status",
			});
			const spec = await server.request({
				method: "GET",
				path: "/spec.json",
			});
			const docs = await server.request({
				method: "GET",
				path: "/docs",
			});
			const docsHtml = await docs.text();

			expect([status.status, spec.status, docs.status]).toStrictEqual([
				200, 200, 200,
			]);
			expect([
				status.headers.get("content-type")?.includes("application/json"),
				spec.headers.get("content-type")?.includes("application/json"),
				docs.headers.get("content-type")?.includes("text/html"),
			]).toStrictEqual([true, true, true]);
			expect(docsHtml).toContain('id="api-reference"');
		} finally {
			await server.close();
		}
	});

	it("enforces auth for protected routes over real HTTP", async () => {
		const server = await startApiE2eServer();
		try {
			const unauthorized = await server.request({
				method: "GET",
				path: "/requests/req-1",
			});
			const unauthorizedBody = (await unauthorized.json()) as ErrorEnvelope;

			const authorized = await server.request({
				headers: ACTOR_HEADERS,
				method: "GET",
				path: "/requests/req-1",
			});
			const authorizedBody = (await authorized.json()) as ErrorEnvelope;

			expect([
				unauthorized.status,
				unauthorizedBody.ok,
				unauthorizedBody.error.code,
			]).toStrictEqual([401, false, "AUTH_ACTOR_CONTEXT_MISSING"]);
			expect(unauthorizedBody.error.id).toBe("DSAR-BE-1001");
			expect(unauthorizedBody.error.docsUrl).toContain("/dsar-be-1001");
			expect([
				authorized.status,
				authorizedBody.ok,
				authorizedBody.error.code,
			]).toStrictEqual([400, false, "REQUEST_VALIDATION_FAILED"]);
			expect(authorizedBody.error).toMatchObject({
				docsUrl: expect.stringContaining("/dsar-be-1199"),
				id: "DSAR-BE-1199",
			});
		} finally {
			await server.close();
		}
	});
});

import { describe, expect, it } from "vitest";

import { createDsarBrowserClient } from "../src/client";

describe("createDsarBrowserClient", () => {
	it("unwraps a success envelope", async () => {
		const client = createDsarBrowserClient({
			baseUrl: "https://acme.inth.app/dsar",
			fetch: () =>
				Promise.resolve(
					Response.json({ data: { id: "req_1" }, ok: true }, { status: 200 })
				),
		});
		await expect(
			client.get<{ id: string }>("/requests/req_1")
		).resolves.toEqual({ id: "req_1" });
	});

	it("throws DsarBrowserError on a catalog envelope", async () => {
		const client = createDsarBrowserClient({
			baseUrl: "https://acme.inth.app/dsar",
			fetch: () =>
				Promise.resolve(
					Response.json(
						{
							error: {
								code: "REQUEST_VALIDATION_FAILED",
								message: "bad",
								status: 400,
							},
							ok: false,
						},
						{ status: 400 }
					)
				),
		});
		await expect(client.get("/requests")).rejects.toMatchObject({
			code: "REQUEST_VALIDATION_FAILED",
			name: "DsarBrowserError",
			status: 400,
		});
	});
});

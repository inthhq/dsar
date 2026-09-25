import { describe, expect, it } from "vitest";

import { hosted, LOCAL_SELF_HOST_URL, selfHosted } from "../src/hosted";

describe("hosted", () => {
	it("keeps the full inth.app URL", () => {
		expect(hosted({ url: "https://acme-prod.inth.app/dsar/" })).toEqual({
			baseUrl: "https://acme-prod.inth.app/dsar",
			kind: "hosted",
		});
	});

	it("rejects an empty url", () => {
		expect(() => hosted({ url: "  " })).toThrow(/url/);
	});
});

describe("LOCAL_SELF_HOST_URL", () => {
	it("is the kitchen-sink API prefix", () => {
		expect(LOCAL_SELF_HOST_URL).toBe(
			"http://kitchen-sink.localhost:1355/api/v1"
		);
	});
});

describe("selfHosted", () => {
	it("points at a local kitchen-sink URL", () => {
		expect(
			selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1/" })
		).toEqual({
			baseUrl: "http://kitchen-sink.localhost:1355/api/v1",
			kind: "self-hosted",
		});
	});
});

import { describe, expect, it } from "vitest";

import { hosted, LOCAL_SELF_HOST_URL, selfHosted } from "../src/hosted";

describe("hosted", () => {
	it("builds the inth.app DSAR origin from a project slug", () => {
		expect(hosted({ project: "acme" })).toEqual({
			baseUrl: "https://acme.inth.app/dsar",
			kind: "hosted",
		});
	});

	it("rejects a hostname as a project slug", () => {
		expect(() => hosted({ project: "acme.inth.app" })).toThrow(/slug/);
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

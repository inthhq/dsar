import { describe, expect, it } from "@effect/vitest";

import { parseCliInput } from "#src/config";

describe(parseCliInput, () => {
	it("resolves api url and token from env by default", () => {
		const parsed = parseCliInput({
			argv: ["status"],
			env: {
				DSAR_API_TOKEN: "token-a",
				DSAR_API_URL: "https://example.test",
			},
			fetchImpl: fetch,
		});
		expect(parsed.global.apiUrl).toBe("https://example.test");
		expect(parsed.global.token).toBe("token-a");
		expect(parsed.commandTokens).toStrictEqual(["status"]);
	});

	it("allows flag overrides for api url and output", () => {
		const parsed = parseCliInput({
			argv: [
				"status",
				"--api-url",
				"https://override.test",
				"--output",
				"json",
			],
			env: {
				DSAR_API_URL: "https://example.test",
			},
			fetchImpl: fetch,
		});
		expect(parsed.global.apiUrl).toBe("https://override.test");
		expect(parsed.global.output).toBe("json");
	});

	it("throws when api url is missing", () => {
		expect(() =>
			parseCliInput({
				argv: ["status"],
				env: {},
				fetchImpl: fetch,
			})
		).toThrow("Missing DSAR API URL");
	});
});

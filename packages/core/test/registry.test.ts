import { describe, expect, it } from "@effect/vitest";

import { resolveCoreConfig } from "#src/config";
import { getCoreClientRegistryKey } from "#src/registry";

describe("@dsar/core registry", () => {
	it("does not include raw token values in registry keys", () => {
		const resolved = resolveCoreConfig(
			{
				baseUrl: "https://example.test/api/v1",
				mode: "managed",
				token: "secret-token-value",
			},
			{}
		);
		const key = getCoreClientRegistryKey(resolved);
		expect(key).not.toContain("secret-token-value");
		expect(key).toContain("tokenPresent");
	});

	it("produces distinct registry keys for different token values", () => {
		const resolvedA = resolveCoreConfig(
			{
				baseUrl: "https://example.test/api/v1",
				mode: "managed",
				token: "secret-token-value",
			},
			{}
		);
		const resolvedB = resolveCoreConfig(
			{
				baseUrl: "https://example.test/api/v1",
				mode: "managed",
				token: "other-secret",
			},
			{}
		);
		const keyA = getCoreClientRegistryKey(resolvedA);
		const keyB = getCoreClientRegistryKey(resolvedB);
		expect(keyA).not.toStrictEqual(keyB);
		expect(keyA).not.toContain("secret-token-value");
		expect(keyB).not.toContain("other-secret");
		expect(keyA).toContain("tokenPresent");
		expect(keyB).toContain("tokenPresent");
	});
});

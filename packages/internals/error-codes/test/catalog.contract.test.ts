import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import {
	createErrorCodeSchema,
	createErrorRegistry,
	isKnownErrorCode,
} from "#src";

const demoEntries = [
	{
		code: "DEMO_AUTH_MISSING",
		docsSlug: "dsar-demo-1001",
		id: "DSAR-DEMO-1001",
		namespace: "demo",
		status: 401,
		title: "Missing auth context",
	},
	{
		code: "DEMO_RUNTIME_FAILURE",
		docsSlug: "dsar-demo-1500",
		id: "DSAR-DEMO-1500",
		namespace: "demo",
		status: 500,
		title: "Unhandled runtime failure",
	},
] as const;

describe("error catalog contracts", () => {
	const registry = createErrorRegistry({
		docsBaseUrl: "https://docs.example.dev/errors",
		entries: demoEntries,
		fallbackCode: "DEMO_RUNTIME_FAILURE",
	});
	const codeSet = new Set(registry.codes);

	it("derives unique code and id maps from entries", () => {
		expect(Object.keys(registry.byCode)).toHaveLength(2);
		expect(Object.keys(registry.byId)).toHaveLength(2);
	});

	it("formats docs urls from docs slugs", () => {
		for (const code of registry.codes) {
			const entry = registry.resolve(code);
			expect(entry.docsUrl).toBe(
				`https://docs.example.dev/errors/${entry.docsSlug}`
			);
		}
	});

	it("falls back to configured fallback code for unknown codes", () => {
		const fallback = registry.resolve("NOT_A_REAL_CODE");
		expect(fallback.code).toBe("DEMO_RUNTIME_FAILURE");
		expect(fallback.id).toBe("DSAR-DEMO-1500");
	});

	it("keeps status invariants for created registries", () => {
		for (const code of registry.codes) {
			const entry = registry.byCode[code];
			expect(entry.namespace).toBe("demo");
			expect(entry.status).toBeGreaterThanOrEqual(400);
			expect(entry.status).toBeLessThan(600);
		}
	});

	it("creates reusable code guards for package-owned lists", () => {
		const value = "DEMO_AUTH_MISSING";
		expect(isKnownErrorCode(codeSet, value)).toBeTruthy();
		expect(isKnownErrorCode(codeSet, "NOT_REAL_CODE")).toBeFalsy();
	});

	it("builds Effect schemas from package-owned code arrays", () => {
		const schema = createErrorCodeSchema(
			["DEMO_AUTH_MISSING", "DEMO_RUNTIME_FAILURE"],
			"Invalid demo code."
		);
		const valid = Schema.decodeUnknownExit(schema)("DEMO_AUTH_MISSING");
		const invalid = Schema.decodeUnknownExit(schema)("NOT_REAL_CODE");
		expect(Exit.isSuccess(valid)).toBeTruthy();
		expect(Exit.isFailure(invalid)).toBeTruthy();
	});
});

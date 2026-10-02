import { describe, expect, it } from "@effect/vitest";

import { toErrorResponse } from "../../src/middleware/errors";
import type { LogFields, RequestLog } from "../../src/observability/log";

const recordingLog = () => {
	const errors: { readonly error: Error; readonly fields?: LogFields }[] = [];
	const log: RequestLog = {
		error: (error, extra) => {
			errors.push({ error, fields: extra });
		},
		set: () => {
			/* Catalog fields are covered by the instance tests. */
		},
	};
	return { errors, log };
};

describe(toErrorResponse, () => {
	it("logs a 5xx error without the original error's extra properties", async () => {
		const { errors, log } = recordingLog();
		const failure = Object.assign(new Error("Provider call failed."), {
			data: { email: "jane@example.com", token: "secret-token" },
		});

		const response = await toErrorResponse(
			failure,
			new Request("https://example.test/requests", { method: "POST" }),
			log
		);

		expect(response.status).toBe(500);
		expect(errors).toHaveLength(1);
		const [entry] = errors;
		if (entry === undefined) {
			throw new Error("Expected one logged error.");
		}
		expect(entry.error).not.toBe(failure);
		expect(entry.error.message).toBe("Provider call failed.");
		const ownProperties = Object.fromEntries(
			Object.getOwnPropertyNames(entry.error).map((key) => [
				key,
				Reflect.get(entry.error, key),
			])
		);
		const logged = JSON.stringify({
			error: ownProperties,
			fields: entry.fields,
		});
		expect(logged).not.toContain("jane@example.com");
		expect(logged).not.toContain("secret-token");
	});
});

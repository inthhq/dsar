import { VerificationCaseSchema } from "@dsar/schema";
import type { VerificationCase } from "@dsar/schema";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

const toSdkVerificationState = (verificationCase: VerificationCase): string =>
	verificationCase.status;

describe("node sdk consumer smoke", () => {
	it("consumes verification contracts from @dsar/schema", () => {
		const parsed = Schema.decodeUnknownSync(VerificationCaseSchema)({
			id: "ver_sdk_1",
			method: "existing_auth",
			pauseClock: true,
			requestedAt: "2026-02-17T12:00:00.000Z",
			status: "pending",
		});

		expect(toSdkVerificationState(parsed)).toBe("pending");
	});
});

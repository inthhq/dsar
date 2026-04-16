import { RequestSchema } from "@dsar/schema";
import type { DsarRequest } from "@dsar/schema";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

const acceptRequestFromBackend = (request: DsarRequest): string => request.id;

describe("backend consumer smoke", () => {
	it("consumes request contracts without duplication", () => {
		const parsed = Schema.decodeUnknownSync(RequestSchema)({
			createdAt: "2026-02-17T12:00:00.000Z",
			id: "req_backend_1",
			intakeSource: {
				receivedAt: "2026-02-17T12:00:00.000Z",
				type: "api",
			},
			status: "captured",
			subject: {
				subjectId: "sub_backend_1",
			},
			type: "access",
			updatedAt: "2026-02-17T12:00:00.000Z",
		});

		expect(acceptRequestFromBackend(parsed)).toBe("req_backend_1");
	});
});

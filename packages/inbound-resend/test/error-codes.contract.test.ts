import { describe, expect, it } from "@effect/vitest";

import {
	INBOUND_RESEND_ERROR_CODES,
	INBOUND_RESEND_ERROR_IDS,
	resolveInboundResendErrorCatalogEntry,
} from "#src/types/error-codes";

describe("inbound-resend error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(INBOUND_RESEND_ERROR_CODES).size).toBe(
			INBOUND_RESEND_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(INBOUND_RESEND_ERROR_IDS).size).toBe(
			INBOUND_RESEND_ERROR_IDS.length
		);
	});

	it("resolver fallback returns INBOUND_RESEND_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveInboundResendErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("INBOUND_RESEND_UNCATALOGED_ERROR");
	});
});

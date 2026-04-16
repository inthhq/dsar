import { describe, expect, it } from "@effect/vitest";

import {
	OUTBOUND_RESEND_ERROR_CODES,
	OUTBOUND_RESEND_ERROR_IDS,
	resolveOutboundResendErrorCatalogEntry,
} from "#src/types/error-codes";

describe("outbound-resend error codes contract", () => {
	it("codes are unique", () => {
		expect(new Set(OUTBOUND_RESEND_ERROR_CODES).size).toBe(
			OUTBOUND_RESEND_ERROR_CODES.length
		);
	});

	it("ids are unique", () => {
		expect(new Set(OUTBOUND_RESEND_ERROR_IDS).size).toBe(
			OUTBOUND_RESEND_ERROR_IDS.length
		);
	});

	it("resolver fallback returns OUTBOUND_RESEND_UNCATALOGED_ERROR for unknown code", () => {
		const entry = resolveOutboundResendErrorCatalogEntry("UNKNOWN_FAKE_CODE");
		expect(entry.code).toBe("OUTBOUND_RESEND_UNCATALOGED_ERROR");
	});
});

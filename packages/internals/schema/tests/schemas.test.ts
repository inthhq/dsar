import {
	ErrorEnvelopeSchema,
	FulfillmentManifestSchema,
	LifecycleTransitionSchema,
	RequestSchema,
	VerificationCaseSchema,
} from "@dsar/schema";
import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

describe("schema contracts", () => {
	it("validates request payloads with intake source", () => {
		const result = Schema.decodeUnknownExit(RequestSchema)({
			createdAt: "2026-02-17T12:00:00.000Z",
			id: "req_1",
			intakeSource: {
				receivedAt: "2026-02-17T12:00:00.000Z",
				type: "portal",
			},
			status: "captured",
			subject: {
				subjectId: "sub_1",
			},
			type: "access",
			updatedAt: "2026-02-17T12:00:00.000Z",
		});

		expect(Exit.isSuccess(result)).toBeTruthy();
	});

	it("rejects verification payloads with invalid status", () => {
		const result = Schema.decodeUnknownExit(VerificationCaseSchema)({
			id: "ver_1",
			method: "email_link",
			pauseClock: true,
			requestedAt: "2026-02-17T12:00:00.000Z",
			status: "invalid",
		});

		expect(Exit.isFailure(result)).toBeTruthy();
	});

	it("validates lifecycle transitions", () => {
		const result = Schema.decodeUnknownExit(LifecycleTransitionSchema)({
			from: "captured",
			occurredAt: "2026-02-17T12:00:00.000Z",
			reasonCode: "verification_requested",
			to: "verification_pending",
		});

		expect(Exit.isSuccess(result)).toBeTruthy();
	});

	it("validates fulfilment manifests", () => {
		const result = Schema.decodeUnknownExit(FulfillmentManifestSchema)({
			artifacts: [
				{
					id: "artifact_1",
					mediaType: "application/json",
					sha256: "abc123",
					sizeBytes: 1024,
					sourceSystem: "core-db",
					title: "Profile export",
					type: "profile_data",
				},
			],
			dataCategories: ["profile"],
			redactionsApplied: [],
			thirdPartyExclusions: [],
		});

		expect(Exit.isSuccess(result)).toBeTruthy();
	});

	it("validates error envelope metadata", () => {
		const result = Schema.decodeUnknownExit(ErrorEnvelopeSchema)({
			error: {
				code: "REQUEST_VALIDATION_FAILED",
				message: "Invalid payload",
			},
			meta: {
				generatedAt: "2026-02-17T12:00:00.000Z",
			},
		});

		expect(Exit.isSuccess(result)).toBeTruthy();
	});
});

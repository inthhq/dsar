import { isDeepStrictEqual } from "node:util";

import {
	AppealSchema,
	FulfillmentManifestSchema,
	LifecycleTransitionSchema,
	RetentionPolicySchema,
	VerificationCaseSchema,
} from "@dsar/schema";
import { describe, expect, it } from "@effect/vitest";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import * as fc from "fast-check";

const isoTimestampArb = fc
	.date({
		max: new Date("2030-12-31T23:59:59Z"),
		min: new Date("2020-01-01T00:00:00Z"),
	})
	.filter((d) => !Number.isNaN(d.getTime()))
	.map((d) => d.toISOString());

const optionalIsoTimestampArb = fc.option(isoTimestampArb, { nil: undefined });

const verificationMethods = ["existing_auth", "email_link", "manual"] as const;

const verificationCaseArb = fc.record({
	evidenceArtifacts: fc.option(
		fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
		{ nil: undefined }
	),
	id: fc.string({ minLength: 1 }),
	level: fc.option(fc.constantFrom("none", "reasonable", "reasonably_high"), {
		nil: undefined,
	}),
	method: fc.constantFrom(...verificationMethods),
	methodsAllowed: fc.option(
		fc.array(fc.constantFrom(...verificationMethods), { maxLength: 3 }),
		{ nil: undefined }
	),
	pauseClock: fc.boolean(),
	reasonForDoubt: fc.option(fc.string(), { nil: undefined }),
	requestedAt: isoTimestampArb,
	resolvedAt: optionalIsoTimestampArb,
	retentionExpiresAt: optionalIsoTimestampArb,
	status: fc.constantFrom("pending", "approved", "rejected"),
});

const appealArb = fc.record({
	createdAt: isoTimestampArb,
	decidedAt: optionalIsoTimestampArb,
	decision: fc.option(fc.constantFrom("approve", "deny", "partial"), {
		nil: undefined,
	}),
	dueAt: optionalIsoTimestampArb,
	escalationInstructions: fc.option(fc.string(), { nil: undefined }),
	explanation: fc.option(fc.string(), { nil: undefined }),
	grounds: fc.option(fc.string(), { nil: undefined }),
	id: fc.string({ minLength: 1 }),
	message: fc.string({ minLength: 1 }),
	status: fc.constantFrom(
		"submitted",
		"in_review",
		"approved",
		"denied",
		"closed"
	),
	submittedAt: optionalIsoTimestampArb,
});

const retentionClasses = [
	"request_record",
	"audit_event",
	"verification_evidence",
	"fulfilment_artifact",
	"delivery_log",
	"notification_log",
] as const;

const retentionPolicyArb = fc
	.record({
		class: fc.constantFrom(...retentionClasses),
		legalHoldEnabled: fc.boolean(),
		minDays: fc.integer({ max: 3650, min: 0 }),
		purgeEnabled: fc.boolean(),
	})
	.chain((base) =>
		fc
			.option(fc.integer({ max: base.minDays + 3650, min: base.minDays }), {
				nil: undefined,
			})
			.map((maxDays) => ({ ...base, maxDays }))
	);

const artifactTypeArb = fc.constantFrom(
	"profile_data",
	"account_data",
	"support_tickets",
	"audit_logs",
	"other"
);

const fulfillmentArtifactArb = fc.record({
	description: fc.option(fc.string(), { nil: undefined }),
	id: fc.string({ minLength: 1 }),
	mediaType: fc.string({ minLength: 1 }),
	sha256: fc
		.array(fc.constantFrom(..."0123456789abcdef"), {
			maxLength: 64,
			minLength: 64,
		})
		.map((chars) => chars.join("")),
	sizeBytes: fc.integer({ max: 100_000_000, min: 0 }),
	sourceSystem: fc.string({ minLength: 1 }),
	title: fc.string({ minLength: 1 }),
	type: artifactTypeArb,
});

const fulfillmentManifestArb = fc.record({
	artifacts: fc.array(fulfillmentArtifactArb, { maxLength: 5 }),
	dataCategories: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
	redactionsApplied: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
	thirdPartyExclusions: fc.array(fc.string({ minLength: 1 }), {
		maxLength: 3,
	}),
});

const actorTypeArb = fc.constantFrom(
	"system",
	"admin",
	"subject",
	"agent",
	"webhook"
);

const actorArb = fc.record({
	actorId: fc.string({ minLength: 1 }),
	actorType: actorTypeArb,
});

const reasonCodeArb = fc.constantFrom(
	"captured",
	"verification_requested",
	"verification_completed",
	"policy_extension",
	"fulfilled",
	"refused",
	"appeal_updated",
	"closed"
);

const lifecycleTransitionArb = fc.record({
	actor: fc.option(actorArb, { nil: undefined }),
	approval: fc.option(
		fc.record({
			approvalId: fc.string({ minLength: 1 }),
			required: fc.boolean(),
		}),
		{ nil: undefined }
	),
	from: fc.string({ minLength: 1 }),
	legalClockMutation: fc.option(
		fc.record({
			changed: fc.boolean(),
			field: fc.option(fc.string(), { nil: undefined }),
			from: fc.option(fc.string(), { nil: undefined }),
			to: fc.option(fc.string(), { nil: undefined }),
		}),
		{ nil: undefined }
	),
	occurredAt: isoTimestampArb,
	rationale: fc.option(fc.string(), { nil: undefined }),
	reasonCode: reasonCodeArb,
	to: fc.string({ minLength: 1 }),
});

const roundtrip = <A, I>(
	schema: Schema.Schema<A, I>,
	value: unknown
): boolean => {
	const decoded = Schema.decodeUnknownExit(schema)(value);
	if (Exit.isFailure(decoded)) {
		return false;
	}
	const encoded = Schema.encodeExit(schema)(decoded.value);
	if (Exit.isFailure(encoded)) {
		return false;
	}
	const reDecoded = Schema.decodeUnknownExit(schema)(encoded.value);
	if (Exit.isFailure(reDecoded)) {
		return false;
	}
	return isDeepStrictEqual(decoded.value, reDecoded.value);
};

describe("property-based schema roundtrip tests", () => {
	it("verificationCaseSchema roundtrips through encode/decode", () => {
		expect(() =>
			fc.assert(
				fc.property(verificationCaseArb, (value) =>
					roundtrip(VerificationCaseSchema, value)
				),
				{ numRuns: 100 }
			)
		).not.toThrow();
	});

	it("appealSchema roundtrips through encode/decode", () => {
		expect(() =>
			fc.assert(
				fc.property(appealArb, (value) => roundtrip(AppealSchema, value)),
				{ numRuns: 100 }
			)
		).not.toThrow();
	});

	it("retentionPolicySchema roundtrips through encode/decode", () => {
		expect(() =>
			fc.assert(
				fc.property(retentionPolicyArb, (value) =>
					roundtrip(RetentionPolicySchema, value)
				),
				{ numRuns: 100 }
			)
		).not.toThrow();
	});

	it("retentionPolicySchema rejects maxDays < minDays", () => {
		const invalidPairArb = fc
			.tuple(
				fc.integer({ max: 3650, min: 1 }),
				fc.integer({ max: 3650, min: 0 })
			)
			.filter(([minDays, maxDays]) => maxDays < minDays);

		expect(() =>
			fc.assert(
				fc.property(invalidPairArb, ([minDays, maxDays]) => {
					const result = Schema.decodeUnknownExit(RetentionPolicySchema)({
						class: "request_record",
						legalHoldEnabled: false,
						maxDays,
						minDays,
						purgeEnabled: false,
					});
					return Exit.isFailure(result);
				}),
				{ numRuns: 50 }
			)
		).not.toThrow();
	});

	it("fulfillmentManifestSchema roundtrips through encode/decode", () => {
		expect(() =>
			fc.assert(
				fc.property(fulfillmentManifestArb, (value) =>
					roundtrip(FulfillmentManifestSchema, value)
				),
				{ numRuns: 100 }
			)
		).not.toThrow();
	});

	it("lifecycleTransitionSchema roundtrips through encode/decode", () => {
		expect(() =>
			fc.assert(
				fc.property(lifecycleTransitionArb, (value) =>
					roundtrip(LifecycleTransitionSchema, value)
				),
				{ numRuns: 100 }
			)
		).not.toThrow();
	});

	it("verificationCaseSchema rejects invalid status", () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc
						.string()
						.filter((s) => !["pending", "approved", "rejected"].includes(s)),
					(invalidStatus) => {
						const result = Schema.decodeUnknownExit(VerificationCaseSchema)({
							id: "test",
							method: "manual",
							pauseClock: true,
							requestedAt: "2026-01-01T00:00:00.000Z",
							status: invalidStatus,
						});
						return Exit.isFailure(result);
					}
				),
				{ numRuns: 50 }
			)
		).not.toThrow();
	});

	it("appealSchema rejects invalid appeal status", () => {
		expect(() =>
			fc.assert(
				fc.property(
					fc
						.string()
						.filter(
							(s) =>
								![
									"submitted",
									"in_review",
									"approved",
									"denied",
									"closed",
								].includes(s)
						),
					(invalidStatus) => {
						const result = Schema.decodeUnknownExit(AppealSchema)({
							createdAt: "2026-01-01T00:00:00.000Z",
							id: "appeal-1",
							message: "test",
							status: invalidStatus,
						});
						return Exit.isFailure(result);
					}
				),
				{ numRuns: 50 }
			)
		).not.toThrow();
	});

	it("encode then decode preserves all FulfillmentManifest fields", () => {
		fc.assert(
			fc.property(fulfillmentManifestArb, (value) => {
				const encoded = Schema.encodeExit(FulfillmentManifestSchema)(value);
				expect(Exit.isSuccess(encoded)).toBeTruthy();

				const decoded = Schema.decodeUnknownExit(FulfillmentManifestSchema)(
					(encoded as Exit.Exit<unknown, unknown> & { readonly value: unknown })
						.value
				);
				expect(Exit.isSuccess(decoded)).toBeTruthy();

				const decodedValue = (
					decoded as Exit.Exit<unknown, unknown> & { readonly value: unknown }
				).value;
				expect(decodedValue).toEqual(value);
			}),
			{ numRuns: 50 }
		);
	});
});

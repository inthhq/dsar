import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	PolicyChecksumMismatchError,
	PolicyPacksLive,
	PolicyRegistry,
	PolicyVersionMetadataError,
	createPolicyPackVersionRecord,
	publishPolicyPackVersion,
} from "../src";

const makePack = (version: string) => ({
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "global",
	packId: "global-record",
	sections: {
		appeals: {
			deadlineDays: 45,
			extensionDays: 30,
			mustBeEasyAsOriginalRequest: true,
			mustIncludeAGContactIfDenied: true,
			required: true,
		},
		audit: {
			requireClockExplainability: true,
			requireRuleTrace: true,
		},
		clock: {
			ackDeadlineBusinessDays: 10,
			ackRequired: true,
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 45,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
			rules: [],
			start: "receipt",
			verificationEffect: "stop_clock",
		},
		delivery: {
			allowedChannels: ["portal", "email", "secure_remote_access"],
			securityLevel: "token",
			stepUpRequired: false,
			tokenTtlSeconds: 86_400,
		},
		representation: {
			authorityEvidenceRequiredFor: ["representative", "authorised_agent"],
			enableDeliveryTargeting: true,
		},
		response: {
			allowedMediaTypes: ["application/json"],
			preferredFormatCapture: true,
			requireDownloadableCopyForRemoteAccess: true,
			requireManifest: true,
		},
		retention: {
			minimums: {
				audit_event: 365,
				delivery_log: 365,
				fulfilment_artifact: 365,
				notification_log: 365,
				request_record: 365,
				verification_evidence: 90,
			},
			verificationDeleteAfterProcessing: true,
		},
		verification: {
			allowedMethods: ["existing_auth", "email_link", "manual"],
			deleteCollectedDataAfterProcessing: true,
			redactionSupported: true,
			requiredWhen: "policy_controlled",
		},
	},
	version,
});

describe("policy registry validation", () => {
	it.effect("preloads launch policy packs at startup", () =>
		Effect.gen(function* _() {
			const registry = yield* Effect.service(PolicyRegistry);
			const result = yield* registry.listByJurisdiction("uk");
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]?.metadata.changelog.length).toBeGreaterThan(0);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("rejects mismatched checksums during publish", () =>
		Effect.gen(function* _() {
			const built = yield* createPolicyPackVersionRecord({
				jurisdiction: "global",
				metadata: {
					changelog: "Release 3.0.0",
					compatibilityNotes: "Major release",
					releaseType: "major",
				},
				name: "global-validation",
				pack: makePack("3.0.0"),
				publishedAt: "2026-01-10T00:00:00.000Z",
				version: "3.0.0",
			});

			const result = yield* Effect.result(
				publishPolicyPackVersion(
					{
						...built,
						checksum: "sha256:not-real",
					},
					"policy-admin"
				)
			);

			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				PolicyChecksumMismatchError
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("enforces semantic release metadata discipline", () =>
		Effect.gen(function* _() {
			const v1 = yield* createPolicyPackVersionRecord({
				jurisdiction: "global",
				metadata: {
					changelog: "Release 1.0.0",
					compatibilityNotes: "Initial release",
					releaseType: "major",
				},
				name: "global-semver",
				pack: makePack("1.0.0"),
				publishedAt: "2026-01-01T00:00:00.000Z",
				version: "1.0.0",
			});
			yield* publishPolicyPackVersion(v1, "policy-admin");

			const invalidMinor = yield* createPolicyPackVersionRecord({
				jurisdiction: "global",
				metadata: {
					changelog: "Release 1.1.0",
					compatibilityNotes: "Incorrectly labeled release type",
					releaseType: "patch",
				},
				name: "global-semver",
				pack: makePack("1.1.0"),
				publishedAt: "2026-01-02T00:00:00.000Z",
				version: "1.1.0",
			});

			const result = yield* Effect.result(
				publishPolicyPackVersion(invalidMinor, "policy-admin")
			);

			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				PolicyVersionMetadataError
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);
});

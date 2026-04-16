import type { PolicyPack } from "@dsar/policy-engine";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
	PolicyActivationNotFoundError,
	PolicyPacksLive,
	UnauthorizedApproverError,
	UnmappedJurisdictionError,
	activateCustomPolicyPack,
	deactivateCustomPolicyPack,
	registerCustomPolicyPack,
	resolveActivePolicyPack,
	resolveEffectivePolicyVersion,
} from "../src";

const makePack = (version: string): PolicyPack => ({
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "uk",
	packId: "uk-custom",
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

describe("custom policy services", () => {
	it.effect("requires admin/compliance roles to register", () =>
		Effect.gen(function* _() {
			const result = yield* Effect.result(
				registerCustomPolicyPack({
					actor: "member-1",
					jurisdiction: "uk",
					metadata: {
						changelog: "Initial",
						compatibilityNotes: "Compatible",
						releaseType: "major",
					},
					name: "uk-custom",
					pack: makePack("1.0.0"),
					publishedAt: "2026-02-01T00:00:00.000Z",
					role: "member",
					version: "1.0.0",
				})
			);
			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				UnauthorizedApproverError
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect(
		"registers, activates, and deactivates custom policies by scope",
		() =>
			Effect.gen(function* _() {
				yield* registerCustomPolicyPack({
					actor: "admin-1",
					jurisdiction: "uk",
					metadata: {
						changelog: "Initial custom release",
						compatibilityNotes: "Compatible with launch contracts",
						releaseType: "major",
					},
					name: "uk-custom",
					pack: makePack("2.0.0"),
					publishedAt: "2026-02-02T00:00:00.000Z",
					role: "admin",
					version: "2.0.0",
				});

				yield* activateCustomPolicyPack({
					actor: "admin-1",
					jurisdiction: "uk",
					now: "2026-02-03T00:00:00.000Z",
					role: "admin",
					scope: { tenantId: "tenant-1", workspaceId: "workspace-1" },
					version: "2.0.0",
				});

				const pinned = yield* resolveEffectivePolicyVersion({
					tenantId: "tenant-1",
					workspaceId: "workspace-1",
				});

				yield* deactivateCustomPolicyPack({
					actor: "admin-1",
					now: "2026-02-04T00:00:00.000Z",
					role: "admin",
					scope: { tenantId: "tenant-1", workspaceId: "workspace-1" },
				});

				const afterDeactivate = yield* resolveEffectivePolicyVersion({
					tenantId: "tenant-1",
					workspaceId: "workspace-1",
				});
				expect(pinned).toBe("2.0.0");
				expect(afterDeactivate).toBeUndefined();
			}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("errors when deactivating a scope with no pin", () =>
		Effect.gen(function* _() {
			const result = yield* Effect.result(
				deactivateCustomPolicyPack({
					actor: "admin-1",
					now: "2026-02-05T00:00:00.000Z",
					role: "admin",
					scope: { tenantId: "tenant-2" },
				})
			);
			expect(result._tag).toBe("Failure");
			expect((result as { readonly failure: unknown }).failure).toBeInstanceOf(
				PolicyActivationNotFoundError
			);
		}).pipe(Effect.provide(PolicyPacksLive))
	);

	it.effect("resolves launch packs and hard-gates unmapped jurisdictions", () =>
		Effect.gen(function* _() {
			const resolved = yield* resolveActivePolicyPack({
				jurisdiction: "uk",
				scope: { tenantId: "tenant-3" },
			});
			expect(resolved.jurisdiction).toBe("uk");

			const unmapped = yield* Effect.result(
				resolveActivePolicyPack({
					jurisdiction: "zz-unknown",
					scope: { tenantId: "tenant-3" },
				})
			);
			expect(unmapped._tag).toBe("Failure");
			expect(
				(unmapped as { readonly failure: unknown }).failure
			).toBeInstanceOf(UnmappedJurisdictionError);
		}).pipe(Effect.provide(PolicyPacksLive))
	);
});

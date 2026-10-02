import type { PolicyPack } from "@dsar/policy-engine";
import { PolicyPackDiff, PolicyPackDiffLive } from "@dsar/policy-packs";
import type { PolicyUpgradeDiff } from "@dsar/policy-packs";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dsarInstance } from "../../src";
import { TEST_ADMIN_HEADERS, TEST_RUNTIME_AUTH, TEST_TENANT_ID } from "../auth";
import { makeMemoryPersistence } from "../e2e/fixtures";

const jsonHeaders = {
	"content-type": "application/json",
	...TEST_ADMIN_HEADERS,
};

const makePolicyPack = (
	version: string,
	overrides?: Partial<PolicyPack>
): PolicyPack => ({
	effectiveAt: "2026-01-01T00:00:00.000Z",
	jurisdiction: "global",
	packId: "pack-global",
	sections: {
		appeals: {
			deadlineDays: 30,
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
			ackDeadlineBusinessDays: 3,
			ackRequired: true,
			clarificationEffect: "stop_clock",
			extension: {
				enabled: true,
				maxAdditionalDays: 60,
				requiresJustification: true,
			},
			responseDeadlineDays: 30,
			rules: [],
			start: "receipt",
			verificationEffect: "stop_clock",
		},
		delivery: {
			allowedChannels: ["portal"],
			securityLevel: "token",
			stepUpRequired: true,
			tokenTtlSeconds: 900,
		},
		representation: {
			authorityEvidenceRequiredFor: ["representative"],
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
				verification_evidence: 365,
			},
			verificationDeleteAfterProcessing: true,
		},
		verification: {
			allowedMethods: ["existing_auth"],
			deleteCollectedDataAfterProcessing: true,
			redactionSupported: true,
			requiredWhen: "policy_controlled",
		},
	},
	version,
	...overrides,
});

const postJson = (
	runtime: ReturnType<typeof dsarInstance>,
	path: string,
	body: unknown
) =>
	runtime.handler(
		new Request(`https://example.test${path}`, {
			body: JSON.stringify(body),
			headers: jsonHeaders,
			method: "POST",
		})
	);

const registerPack = (
	runtime: ReturnType<typeof dsarInstance>,
	pack: PolicyPack,
	releaseType: "major" | "minor"
) =>
	postJson(runtime, "/policies/custom/register", {
		jurisdiction: "global",
		metadata: {
			changelog: `Release ${pack.version}`,
			compatibilityNotes: `Compatibility reviewed for ${pack.version}`,
			releaseType,
		},
		name: "global-default",
		pack,
		publishedAt: "2026-01-01T00:00:00.000Z",
		version: pack.version,
	});

interface SuccessEnvelope<T> {
	readonly ok: boolean;
	readonly data: T;
}

describe("policy upgrade HTTP workflow", () => {
	it("admin HTTP propose-approve-apply then clock explain uses applied pack version", async () => {
		const runtime = dsarInstance({
			...TEST_RUNTIME_AUTH,
			repos: { persistence: makeMemoryPersistence() },
		});
		const fromPack = makePolicyPack("1.0.0");
		const toPack = makePolicyPack("1.1.0", {
			sections: {
				...fromPack.sections,
				clock: {
					...fromPack.sections.clock,
					verificationEffect: "no_stop_clock",
				},
			},
		});

		const registeredFrom = await registerPack(runtime, fromPack, "major");
		expect(registeredFrom.status).toBe(202);
		const registeredTo = await registerPack(runtime, toPack, "minor");
		expect(registeredTo.status).toBe(202);

		const expectedDiff = await Effect.runPromise(
			Effect.flatMap(Effect.service(PolicyPackDiff), (diff) =>
				diff.diff(fromPack, toPack)
			).pipe(Effect.provide(PolicyPackDiffLive))
		);

		const proposed = await postJson(runtime, "/policies/upgrades/propose", {
			fromVersion: "1.0.0",
			tenantId: TEST_TENANT_ID,
			toVersion: "1.1.0",
		});
		expect(proposed.status).toBe(202);
		const proposedBody = (await proposed.json()) as SuccessEnvelope<{
			readonly id: string;
			readonly status: string;
			readonly diff: PolicyUpgradeDiff;
		}>;
		expect(proposedBody.ok).toBe(true);
		expect(proposedBody.data.status).toBe("pending_approval");
		expect(proposedBody.data.diff).toEqual(expectedDiff);
		expect(proposedBody.data.diff.clockBehaviorSummary.length).toBeGreaterThan(
			0
		);

		const proposalId = proposedBody.data.id;
		const approved = await postJson(
			runtime,
			`/policies/upgrades/${proposalId}/approve`,
			{}
		);
		expect(approved.status).toBe(202);
		const approvedBody = (await approved.json()) as SuccessEnvelope<{
			readonly status: string;
		}>;
		expect(approvedBody.data.status).toBe("approved");

		const applied = await postJson(
			runtime,
			`/policies/upgrades/${proposalId}/apply`,
			{}
		);
		expect(applied.status).toBe(202);
		const appliedBody = (await applied.json()) as SuccessEnvelope<{
			readonly status: string;
			readonly toVersion: string;
		}>;
		expect(appliedBody.data.status).toBe("applied");
		expect(appliedBody.data.toVersion).toBe("1.1.0");

		const captured = await postJson(runtime, "/requests/capture", {
			intakeSource: {
				channel: "api",
				rawText: "please provide my data",
				receivedAt: "2026-01-01T00:00:00.000Z",
				type: "api",
			},
			jurisdiction: "global",
		});
		expect(captured.status).toBe(202);
		const capturedBody = (await captured.json()) as SuccessEnvelope<{
			readonly id: string;
		}>;
		const requestId = capturedBody.data.id;

		const explained = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/clock/explain`, {
				headers: TEST_ADMIN_HEADERS,
				method: "GET",
			})
		);
		expect(explained.status).toBe(200);
		const explainedBody = (await explained.json()) as SuccessEnvelope<{
			readonly policyVersion: string;
			readonly clock: {
				readonly segments: readonly {
					readonly policyVersion: string;
				}[];
			};
		}>;
		expect(explainedBody.data.policyVersion).toBe("1.1.0");
		expect(explainedBody.data.clock.segments.length).toBeGreaterThan(0);
		expect(
			explainedBody.data.clock.segments.every(
				(segment) => segment.policyVersion === "1.1.0"
			)
		).toBe(true);
	});
});

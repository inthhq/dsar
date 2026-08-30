// oxlint-disable vitest/no-importing-vitest-globals
import { dsarInstance } from "@dsar/backend";
import { makeMinimalPersistenceSync } from "@dsar/backend/testing/minimal-persistence";
import { describe, expect, it } from "@effect/vitest";
import { expectTypeOf } from "vitest";

/* oxlint-disable max-statements */
/* oxlint-disable require-await */
/* oxlint-disable unicorn/prefer-response-static-json */
import { createNodeSdk } from "#src/client";

const requiredPaths = [
	"/requests",
	"/requests/capture",
	"/requests/{id}/timeline",
	"/requests/{id}/clock/explain",
	"/requests/{id}/refusals",
	"/requests/{id}/closures",
	"/requests/{id}/verification/request",
	"/requests/{id}/verification/evidence",
	"/requests/{id}/verification/approve",
	"/requests/{id}/verification/reject",
	"/requests/{id}/verification-case",
	"/requests/{id}/delivery/prepare",
	"/requests/{id}/delivery/address/verify",
	"/requests/{id}/delivery/step-up/challenge",
	"/requests/{id}/delivery/step-up/complete",
	"/requests/{id}/artifacts/{artifactId}/download",
	"/requests/{id}/manifest",
	"/requests/{id}/manifest/validate",
	"/requests/{id}/appeals",
	"/requests/{id}/appeals/{appealId}/decide",
	"/requests/{id}/notifications",
	"/requests/{id}/notifications/{eventId}/replay",
	"/tenants/{tenantId}/retention",
	"/requests/{id}/audit/export",
	"/requests/{id}/audit/verify",
	"/policies/custom/register",
	"/policies/custom/activate",
	"/policies/custom/deactivate",
	"/webhooks/inbound/resend",
	"/webhooks/endpoints/{id}/rotate-key",
	"/webhooks/dispatches",
	"/webhooks/dispatches/replay",
	"/webhooks/dispatches/{id}/replay",
] as const;

describe("@dsar/node-sdk parity checks", () => {
	it("matches capability paths in generated OpenAPI", async () => {
		const runtime = dsarInstance({
			repos: { persistence: makeMinimalPersistenceSync() },
		});
		const response = await runtime.handler(
			new Request("https://example.test/spec.json", { method: "GET" })
		);
		expect(response.status).toBe(200);
		const spec = (await response.json()) as {
			readonly paths: Readonly<Record<string, unknown>>;
		};
		expect(Object.keys(spec.paths)).toStrictEqual(
			expect.arrayContaining(requiredPaths as unknown as string[])
		);
	});

	it("exposes SDK namespaces for parity surfaces", () => {
		const sdk = createNodeSdk({
			baseUrl: "https://example.test",
			fetch: async () =>
				new Response(
					JSON.stringify({
						data: { initialized: true },
						ok: true,
					}),
					{
						headers: { "content-type": "application/json" },
						status: 200,
					}
				),
		});
		expectTypeOf(sdk.requests.create).toBeFunction();
		expectTypeOf(sdk.requests.list).toBeFunction();
		expectTypeOf(sdk.requests.clockExplain).toBeFunction();
		expectTypeOf(sdk.requests.timeline).toBeFunction();
		expectTypeOf(sdk.requests.refuse).toBeFunction();
		expectTypeOf(sdk.requests.close).toBeFunction();
		expectTypeOf(sdk.requests.verificationRequest).toBeFunction();
		expectTypeOf(sdk.requests.deliveryPrepare).toBeFunction();
		expectTypeOf(sdk.requests.manifestValidate).toBeFunction();
		expectTypeOf(sdk.requests.appealsCreate).toBeFunction();
		expectTypeOf(sdk.requests.notifications).toBeFunction();
		expectTypeOf(sdk.requests.notificationReplay).toBeFunction();
		expectTypeOf(sdk.retention.get).toBeFunction();
		expectTypeOf(sdk.audit.export).toBeFunction();
		expectTypeOf(sdk.policies.list).toBeFunction();
		expectTypeOf(sdk.policies.customRegister).toBeFunction();
		expectTypeOf(sdk.policies.customActivate).toBeFunction();
		expectTypeOf(sdk.policies.customDeactivate).toBeFunction();
		expectTypeOf(sdk.subjects.getProfile).toBeFunction();
		expectTypeOf(sdk.status).toBeFunction();
		expectTypeOf(sdk.init).toBeFunction();
		expectTypeOf(sdk.webhooks.inboundResend).toBeFunction();
		expectTypeOf(sdk.webhooks.listDispatches).toBeFunction();
		expectTypeOf(sdk.webhooks.replayDispatch).toBeFunction();
		expectTypeOf(sdk.webhooks.replayDispatches).toBeFunction();
		expectTypeOf(sdk.webhooks.rotateKey).toBeFunction();
	});
});

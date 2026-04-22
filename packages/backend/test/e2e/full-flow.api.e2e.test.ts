import { describe, expect, it } from "@effect/vitest";

import type { SuccessEnvelope } from "../../src";
import { BASE_JSON_BODY } from "./fixtures";
import { ACTOR_HEADERS, startApiE2eServer } from "./harness";

const E2E_TEST_TIMEOUT_MS = 15_000;

const asEnvelope = async <T>(response: Response): Promise<SuccessEnvelope<T>> =>
	(await response.json()) as SuccessEnvelope<T>;

describe("api e2e full flow over real HTTP", () => {
	it(
		"runs lifecycle endpoints using the created request id",
		async () => {
			const server = await startApiE2eServer();
			try {
				const create = await server.request({
					headers: ACTOR_HEADERS,
					json: {
						intakeSource: BASE_JSON_BODY.intakeSource,
						jurisdiction: "uk",
					},
					method: "POST",
					path: "/requests",
				});
				const createBody = await asEnvelope<{
					readonly id: string;
				}>(create);
				const createdId = createBody.data.id;

				const authoritySubmit = await server.request({
					headers: ACTOR_HEADERS,
					json: BASE_JSON_BODY,
					method: "POST",
					path: `/requests/${createdId}/authority/submit`,
				});
				const authoritySubmitBody = await asEnvelope<{
					readonly requestId: string;
					readonly authority: unknown;
				}>(authoritySubmit);

				const authorityApprove = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${createdId}/authority/approve`,
				});
				const verificationRequest = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${createdId}/verification/request`,
				});

				const verificationEvidence = await server.request({
					headers: ACTOR_HEADERS,
					json: { ...BASE_JSON_BODY, level: "reasonable" },
					method: "POST",
					path: `/requests/${createdId}/verification/evidence`,
				});
				const verificationEvidenceBody = await asEnvelope<{
					readonly surface: string;
				}>(verificationEvidence);

				const verificationApprove = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${createdId}/verification/approve`,
				});
				const fulfilmentCallback = await server.request({
					headers: ACTOR_HEADERS,
					json: { manifest: { artifacts: [] } },
					method: "POST",
					path: `/requests/${createdId}/fulfilment/callback`,
				});
				const deliveryPrepare = await server.request({
					headers: ACTOR_HEADERS,
					json: BASE_JSON_BODY,
					method: "POST",
					path: `/requests/${createdId}/delivery/prepare`,
				});
				const deliveryPrepareBody = await asEnvelope<{
					readonly surface: string;
				}>(deliveryPrepare);

				const manifestValidate = await server.request({
					headers: ACTOR_HEADERS,
					json: { action: "approved" },
					method: "POST",
					path: `/requests/${createdId}/manifest/validate`,
				});
				const manifestValidateBody = await asEnvelope<{
					readonly requestId: string;
					readonly status: string;
				}>(manifestValidate);

				const auditExport = await server.request({
					headers: ACTOR_HEADERS,
					method: "GET",
					path: `/requests/${createdId}/audit/export?format=jsonl`,
				});
				const auditExportBody = await asEnvelope<{
					readonly requestId: string;
					readonly format: string;
				}>(auditExport);

				const auditVerify = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${createdId}/audit/verify`,
				});
				const auditVerifyBody = await asEnvelope<{
					readonly verified: boolean;
					readonly status: string;
				}>(auditVerify);

				expect([create.status, typeof createdId]).toStrictEqual([
					202,
					"string",
				]);
				expect([
					authoritySubmit.status,
					authorityApprove.status,
					verificationRequest.status,
					verificationEvidence.status,
					verificationApprove.status,
					fulfilmentCallback.status,
					deliveryPrepare.status,
					manifestValidate.status,
					auditExport.status,
					auditVerify.status,
				]).toStrictEqual([202, 202, 202, 202, 202, 202, 202, 202, 202, 202]);
				expect(authoritySubmitBody.data.requestId).toBe(createdId);
				expect([
					verificationEvidenceBody.data.surface,
					deliveryPrepareBody.data.surface,
				]).toStrictEqual(["verification_evidence", "delivery_prepare"]);
				expect([
					manifestValidateBody.data.requestId,
					manifestValidateBody.data.status,
					auditExportBody.data.requestId,
					auditExportBody.data.format,
					auditVerifyBody.data.status,
					auditVerifyBody.data.verified,
				]).toStrictEqual([
					createdId,
					"approved",
					createdId,
					"jsonl",
					"verified",
					true,
				]);
			} finally {
				await server.close();
			}
		},
		E2E_TEST_TIMEOUT_MS
	);
});

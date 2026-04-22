import { describe, expect, it } from "@effect/vitest";

import type { SuccessEnvelope } from "../../src";
import { BASE_JSON_BODY } from "./fixtures";
import { ACTOR_HEADERS, startApiE2eServer } from "./harness";

const E2E_TEST_TIMEOUT_MS = 15_000;

const asEnvelope = async <T>(response: Response): Promise<SuccessEnvelope<T>> =>
	(await response.json()) as SuccessEnvelope<T>;

const DAY_MS = 24 * 60 * 60 * 1000;
const CALIFORNIA_APPEAL_DEADLINE_DAYS = 45;
const CALIFORNIA_BASE_DUE_AT = "2026-04-15T00:00:00.000Z";

interface AppealSummary {
	readonly decidedAt?: string;
	readonly decision?: string;
	readonly dueAt?: string;
	readonly id: string;
	readonly status: string;
	readonly submittedAt?: string;
}

interface AuditEventSummary {
	readonly eventType: string;
	readonly metadata: {
		readonly after: { readonly status?: string };
		readonly before: { readonly status?: string };
		readonly reason: { readonly rationale?: string };
	};
}

const requireAppeal = (
	appeals: readonly AppealSummary[],
	appealId: string
): AppealSummary => {
	const appeal = appeals.find((candidate) => candidate.id === appealId);
	if (!appeal) {
		throw new Error(`Expected appeal ${appealId} to exist.`);
	}
	return appeal;
};

const requireAuditEvent = (
	events: readonly AuditEventSummary[],
	eventType: string
): AuditEventSummary => {
	const event = events.find((candidate) => candidate.eventType === eventType);
	if (!event) {
		throw new Error(`Expected audit event ${eventType} to exist.`);
	}
	return event;
};

const requireString = (value: string | undefined, label: string): string => {
	if (value === undefined) {
		throw new Error(`Expected ${label} to be present.`);
	}
	return value;
};

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

	it(
		"runs refused appeal overturn lifecycle through fulfilment",
		async () => {
			const server = await startApiE2eServer();
			try {
				const create = await server.request({
					headers: ACTOR_HEADERS,
					json: {
						intakeSource: {
							channel: "api",
							receivedAt: "2026-03-01T00:00:00.000Z",
							type: "api",
						},
						jurisdiction: "us-ca",
						requestType: "access",
						requestor: {
							email: "subject@example.test",
							type: "subject",
						},
						requiresVerification: true,
					},
					method: "POST",
					path: "/requests/capture",
				});
				const createBody = await asEnvelope<{
					readonly dueAt: string;
					readonly id: string;
					readonly status: string;
				}>(create);
				const requestId = createBody.data.id;

				const getRequest = async () => {
					const response = await server.request({
						headers: ACTOR_HEADERS,
						method: "GET",
						path: `/requests/${requestId}`,
					});
					return asEnvelope<{
						readonly appeals: readonly AppealSummary[];
						readonly dueAt: string;
						readonly status: string;
					}>(response);
				};

				const captured = await getRequest();
				const verificationRequest = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${requestId}/verification/request`,
				});
				const verificationRequestBody = await asEnvelope<{
					readonly status: string;
				}>(verificationRequest);
				const verificationApprove = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${requestId}/verification/approve`,
				});
				const verificationApproveBody = await asEnvelope<{
					readonly status: string;
				}>(verificationApprove);
				const refusal = await server.request({
					headers: ACTOR_HEADERS,
					json: { rationale: "identity mismatch exemption" },
					method: "POST",
					path: `/requests/${requestId}/refusals`,
				});
				const refusalBody = await asEnvelope<{ readonly status: string }>(
					refusal
				);
				const refusedClock = await server.request({
					headers: ACTOR_HEADERS,
					method: "GET",
					path: `/requests/${requestId}/clock/explain`,
				});
				const refusedClockBody = await asEnvelope<{
					readonly finalDueAt: string;
				}>(refusedClock);

				const createAppeal = await server.request({
					headers: ACTOR_HEADERS,
					json: {
						grounds: "Additional identity documents attached.",
						message: "Please review the refusal.",
					},
					method: "POST",
					path: `/requests/${requestId}/appeals`,
				});
				const createAppealBody = await asEnvelope<{
					readonly appealId: string;
					readonly dueAt: string;
					readonly status: string;
				}>(createAppeal);
				const appealFiled = await getRequest();
				const submittedAppeal = requireAppeal(
					appealFiled.data.appeals,
					createAppealBody.data.appealId
				);
				const submittedAppealDueAt = requireString(
					submittedAppeal.dueAt,
					"submitted appeal dueAt"
				);
				const submittedAppealSubmittedAt = requireString(
					submittedAppeal.submittedAt,
					"submitted appeal submittedAt"
				);

				const decideAppeal = await server.request({
					headers: ACTOR_HEADERS,
					json: {
						decision: "approve",
						explanation: "Appeal approved; original refusal overturned.",
					},
					method: "POST",
					path: `/requests/${requestId}/appeals/${createAppealBody.data.appealId}/decide`,
				});
				const decideAppealBody = await asEnvelope<{
					readonly decision: string;
					readonly status: string;
				}>(decideAppeal);
				const appealOverturned = await getRequest();
				const decidedAppeal = requireAppeal(
					appealOverturned.data.appeals,
					createAppealBody.data.appealId
				);
				const fulfil = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${requestId}/fulfilment`,
				});
				const fulfilBody = await asEnvelope<{ readonly status: string }>(
					fulfil
				);
				const fulfilled = await getRequest();

				const timeline = await server.request({
					headers: ACTOR_HEADERS,
					method: "GET",
					path: `/requests/${requestId}/timeline`,
				});
				const timelineBody = await asEnvelope<{
					readonly events: readonly { readonly eventType: string }[];
				}>(timeline);

				const clock = await server.request({
					headers: ACTOR_HEADERS,
					method: "GET",
					path: `/requests/${requestId}/clock/explain`,
				});
				const clockBody = await asEnvelope<{
					readonly baseDeadline: string;
					readonly clock: {
						readonly segments: readonly {
							readonly countsTowardDeadline: boolean;
							readonly reason: string;
						}[];
					};
					readonly finalDueAt: string;
					readonly pauses: readonly { readonly reason: string }[];
					readonly policyPack: string;
					readonly policyVersion: string;
				}>(clock);

				const auditExport = await server.request({
					headers: ACTOR_HEADERS,
					method: "GET",
					path: `/requests/${requestId}/audit/export?format=jsonl`,
				});
				const auditExportBody = await asEnvelope<{
					readonly events: readonly AuditEventSummary[];
				}>(auditExport);
				const auditVerify = await server.request({
					headers: ACTOR_HEADERS,
					method: "POST",
					path: `/requests/${requestId}/audit/verify`,
				});
				const auditVerifyBody = await asEnvelope<{
					readonly verified: boolean;
				}>(auditVerify);
				const requestOverturnAudit = requireAuditEvent(
					auditExportBody.data.events,
					"request_appeal_overturn"
				);
				const refusalAudit = requireAuditEvent(
					auditExportBody.data.events,
					"request_refuse"
				);

				expect([
					create.status,
					createBody.data.status,
					captured.data.status,
				]).toStrictEqual([202, "captured", "captured"]);
				expect(createBody.data.dueAt).toBe(CALIFORNIA_BASE_DUE_AT);
				expect([
					verificationRequest.status,
					verificationRequestBody.data.status,
					verificationApprove.status,
					verificationApproveBody.data.status,
					refusal.status,
					refusalBody.data.status,
				]).toStrictEqual([
					202,
					"verification_pending",
					202,
					"in_progress",
					202,
					"refused",
				]);
				expect(refusedClockBody.data.finalDueAt).toBe(CALIFORNIA_BASE_DUE_AT);
				expect([
					createAppeal.status,
					createAppealBody.data.status,
					appealFiled.data.status,
					submittedAppeal.status,
				]).toStrictEqual([202, "submitted", "refused", "submitted"]);
				expect(
					Date.parse(submittedAppealDueAt) -
						Date.parse(submittedAppealSubmittedAt)
				).toBe(CALIFORNIA_APPEAL_DEADLINE_DAYS * DAY_MS);
				expect(createAppealBody.data.dueAt).toBe(submittedAppealDueAt);
				expect([
					decideAppeal.status,
					decideAppealBody.data.status,
					decideAppealBody.data.decision,
					appealOverturned.data.status,
					decidedAppeal.status,
					decidedAppeal.decision,
					fulfil.status,
					fulfilBody.data.status,
					fulfilled.data.status,
				]).toStrictEqual([
					202,
					"decided",
					"approve",
					"in_progress",
					"approved",
					"approve",
					202,
					"fulfilled",
					"fulfilled",
				]);
				expect(
					timelineBody.data.events.map((event) => event.eventType)
				).toStrictEqual([
					"captured",
					"verification_requested",
					"verification_resolved",
					"refused",
					"appeal_submitted",
					"appeal_decided",
					"appeal_overturned",
					"fulfilled",
				]);
				expect([
					clockBody.data.policyPack,
					clockBody.data.policyVersion,
					clockBody.data.baseDeadline,
					clockBody.data.finalDueAt,
				]).toStrictEqual([
					"launch-us-california-us-ca",
					"1.0.0",
					CALIFORNIA_BASE_DUE_AT,
					CALIFORNIA_BASE_DUE_AT,
				]);
				expect(
					clockBody.data.pauses.map((pause) => pause.reason)
				).toStrictEqual(["verification"]);
				expect(
					clockBody.data.clock.segments.map((segment) => ({
						countsTowardDeadline: segment.countsTowardDeadline,
						reason: segment.reason,
					}))
				).toStrictEqual([{ countsTowardDeadline: true, reason: "base" }]);
				expect(
					auditExportBody.data.events.map((event) => event.eventType)
				).toEqual(
					expect.arrayContaining([
						"request_captured",
						"request_verification_request",
						"request_verification_approve",
						"request_refuse",
						"appeal_submitted",
						"appeal_decided",
						"request_appeal_overturn",
						"request_fulfil",
					])
				);
				expect(refusalAudit.metadata.reason.rationale).toBe(
					"identity mismatch exemption"
				);
				expect(requestOverturnAudit.metadata.before.status).toBe("refused");
				expect(requestOverturnAudit.metadata.after.status).toBe("in_progress");
				expect(requestOverturnAudit.metadata.reason.rationale).toBe(
					"Appeal approved; original refusal overturned."
				);
				expect(auditVerifyBody.data.verified).toBeTruthy();
			} finally {
				await server.close();
			}
		},
		E2E_TEST_TIMEOUT_MS
	);
});

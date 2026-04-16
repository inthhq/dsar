import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

import { protectedOperation, s202 } from "../common";
import {
	AppealSchema,
	AuthoritySchema,
	ArtifactManifestSchema,
	AuditExportSchema,
	AuditVerifyPayloadSchema,
	BinaryOctetStreamSchema,
	ClockExplainSchema,
	DeliveryAddressVerifySchema,
	DeliveryLogSchema,
	DeliveryPrepareSchema,
	FulfillmentManifestSchema,
	IntakePayloadSchema,
	LifecycleResultSchema,
	ManifestArtifactDownloadResponseSchema,
	ManifestArtifactReplaceResponseSchema,
	ManifestArtifactUploadResponseSchema,
	NotificationSummaryResponseSchema,
	RequestDetailSchema,
	RequestQueueResponseSchema,
	RequestQueueSortBySchema,
	RequestQueueSortOrderSchema,
	RequestTimelineResponseSchema,
	RequestorSchema,
	RetentionPolicySchema,
	RefusalPayloadSchema,
	StepUpChallengeSchema,
	StepUpCompleteSchema,
	TokenGatedDownloadSchema,
	VerificationCaseSchema,
	VerificationEvidenceUploadResponseSchema,
	VerificationPayloadSchema,
} from "../request-schemas";
import { successEnvelope } from "../schemas";

/** OpenAPI group describing request lifecycle, verification, delivery, and audit endpoints. */
export const requestsGroup = HttpApiGroup.make("requests", { topLevel: true })
	.add(
		protectedOperation(
			HttpApiEndpoint.post("requests_create", "/requests", {
				payload: IntakePayloadSchema,
				success: successEnvelope(
					Schema.Struct({
						id: Schema.String,
						receivedAt: Schema.String,
						status: Schema.String,
					})
				).pipe(s202),
			}),
			"Create request"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post("requests_capture", "/requests/capture", {
				payload: IntakePayloadSchema,
				success: successEnvelope(
					Schema.Struct({
						dueAt: Schema.String,
						id: Schema.String,
						receivedAt: Schema.String,
						status: Schema.String,
					})
				).pipe(s202),
			}),
			"Capture request intake"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("requests_list", "/requests", {
				query: {
					atRiskDays: Schema.optional(Schema.NumberFromString),
					limit: Schema.optional(Schema.NumberFromString),
					offset: Schema.optional(Schema.NumberFromString),
					sortBy: Schema.optional(RequestQueueSortBySchema),
					sortOrder: Schema.optional(RequestQueueSortOrderSchema),
					status: Schema.optional(Schema.String),
				},
				success: successEnvelope(RequestQueueResponseSchema),
			}),
			"List requests queue"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("requests_get", "/requests/:id", {
				params: { id: Schema.String },
				success: successEnvelope(RequestDetailSchema),
			}),
			"Get request"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("requests_timeline", "/requests/:id/timeline", {
				params: { id: Schema.String },
				success: successEnvelope(RequestTimelineResponseSchema),
			}),
			"Get request timeline"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_clock_explain",
				"/requests/:id/clock/explain",
				{
					params: { id: Schema.String },
					success: successEnvelope(ClockExplainSchema),
				}
			),
			"Explain legal clock"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_clarifications_request",
				"/requests/:id/clarifications/request",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Request clarification"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_clarifications_receive",
				"/requests/:id/clarifications/receive",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Receive clarification"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_extensions_create",
				"/requests/:id/extensions",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Extend deadline"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_refusals_create",
				"/requests/:id/refusals",
				{
					params: { id: Schema.String },
					payload: RefusalPayloadSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Refuse request"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_closures_create",
				"/requests/:id/closures",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Close request"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_acknowledgements_create",
				"/requests/:id/acknowledgements",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Create acknowledgement"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.put("requests_requestor_set", "/requests/:id/requestor", {
				params: { id: Schema.String },
				payload: RequestorSchema,
				success: successEnvelope(LifecycleResultSchema).pipe(s202),
			}),
			"Set requestor"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_authority_submit",
				"/requests/:id/authority/submit",
				{
					params: { id: Schema.String },
					payload: AuthoritySchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Submit authority evidence"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_authority_approve",
				"/requests/:id/authority/approve",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Approve authority evidence"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_authority_reject",
				"/requests/:id/authority/reject",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Reject authority evidence"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_verification_request",
				"/requests/:id/verification/request",
				{
					params: { id: Schema.String },
					payload: VerificationPayloadSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Create verification case"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_verification_evidence",
				"/requests/:id/verification/evidence",
				{
					params: { id: Schema.String },
					payload: VerificationCaseSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Attach verification evidence"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_verification_evidence_upload",
				"/requests/:id/verification/evidence/upload",
				{
					headers: {
						"x-evidence-content-type": Schema.optional(Schema.String),
						"x-evidence-filename": Schema.optional(Schema.String),
						"x-evidence-level": Schema.optional(Schema.String),
					},
					params: { id: Schema.String },
					payload: BinaryOctetStreamSchema,
					success: successEnvelope(
						VerificationEvidenceUploadResponseSchema
					).pipe(s202),
				}
			),
			"Upload verification evidence file"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_verification_approve",
				"/requests/:id/verification/approve",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Approve verification"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_verification_reject",
				"/requests/:id/verification/reject",
				{
					params: { id: Schema.String },
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Reject verification"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_verification_case",
				"/requests/:id/verification-case",
				{
					params: { id: Schema.String },
					success: successEnvelope(VerificationCaseSchema),
				}
			),
			"Read verification case"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_delivery_prepare",
				"/requests/:id/delivery/prepare",
				{
					params: { id: Schema.String },
					payload: DeliveryPrepareSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Prepare delivery"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_delivery_address_verify",
				"/requests/:id/delivery/address/verify",
				{
					params: { id: Schema.String },
					payload: DeliveryAddressVerifySchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Verify delivery address"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_delivery_step_up_challenge",
				"/requests/:id/delivery/step-up/challenge",
				{
					params: { id: Schema.String },
					payload: StepUpChallengeSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Start step-up challenge"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_delivery_step_up_complete",
				"/requests/:id/delivery/step-up/complete",
				{
					params: { id: Schema.String },
					payload: StepUpCompleteSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Complete step-up challenge"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_artifacts_download",
				"/requests/:id/artifacts/:artifactId/download",
				{
					headers: { "x-delivery-token": Schema.String },
					params: { artifactId: Schema.String, id: Schema.String },
					success: successEnvelope(TokenGatedDownloadSchema).pipe(s202),
				}
			),
			"Download delivery artifact"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_delivery_logs",
				"/requests/:id/delivery/logs",
				{
					params: { id: Schema.String },
					success: successEnvelope(Schema.Array(DeliveryLogSchema)).pipe(s202),
				}
			),
			"Get delivery logs"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post("requests_fulfilment", "/requests/:id/fulfilment", {
				params: { id: Schema.String },
				success: successEnvelope(LifecycleResultSchema).pipe(s202),
			}),
			"Fulfil request"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_fulfilment_callback",
				"/requests/:id/fulfilment/callback",
				{
					params: { id: Schema.String },
					payload: Schema.Struct({
						manifest: ArtifactManifestSchema,
					}),
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Fulfilment callback with manifest"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("requests_manifest_get", "/requests/:id/manifest", {
				params: { id: Schema.String },
				success: successEnvelope(FulfillmentManifestSchema),
			}),
			"Get fulfilment manifest"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_manifest_validate",
				"/requests/:id/manifest/validate",
				{
					params: { id: Schema.String },
					payload: FulfillmentManifestSchema,
					success: successEnvelope(LifecycleResultSchema).pipe(s202),
				}
			),
			"Validate fulfilment manifest"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_manifest_artifact_upload",
				"/requests/:id/manifest/artifact/upload",
				{
					headers: {
						"x-artifact-content-type": Schema.optional(Schema.String),
						"x-artifact-filename": Schema.optional(Schema.String),
						"x-artifact-title": Schema.optional(Schema.String),
						"x-artifact-type": Schema.optional(Schema.String),
					},
					params: { id: Schema.String },
					payload: BinaryOctetStreamSchema,
					success: successEnvelope(ManifestArtifactUploadResponseSchema).pipe(
						s202
					),
				}
			),
			"Upload manifest artifact"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_manifest_artifact_download",
				"/requests/:id/manifest/artifact/download",
				{
					params: { id: Schema.String },
					query: { artifactId: Schema.String },
					success: ManifestArtifactDownloadResponseSchema,
				}
			),
			"Download manifest artifact"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.put(
				"requests_manifest_artifact_replace",
				"/requests/:id/manifest/artifact/:artifactId/replace",
				{
					headers: {
						"x-artifact-content-type": Schema.optional(Schema.String),
						"x-artifact-filename": Schema.optional(Schema.String),
					},
					params: { artifactId: Schema.String, id: Schema.String },
					payload: BinaryOctetStreamSchema,
					success: successEnvelope(ManifestArtifactReplaceResponseSchema).pipe(
						s202
					),
				}
			),
			"Replace manifest artifact"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post("requests_appeals_create", "/requests/:id/appeals", {
				params: { id: Schema.String },
				payload: AppealSchema,
				success: successEnvelope(
					Schema.Struct({
						appealId: Schema.String,
						requestId: Schema.String,
						status: Schema.String,
					})
				).pipe(s202),
			}),
			"Create appeal"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get("requests_appeals_list", "/requests/:id/appeals", {
				params: { id: Schema.String },
				success: successEnvelope(Schema.Array(AppealSchema)),
			}),
			"List appeals"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_appeals_decide",
				"/requests/:id/appeals/:appealId/decide",
				{
					params: { appealId: Schema.String, id: Schema.String },
					payload: Schema.Struct({
						decision: Schema.Literals(["approve", "deny", "partial"]),
						explanation: Schema.optional(Schema.String),
					}),
					success: successEnvelope(
						Schema.Struct({
							appealId: Schema.String,
							decision: Schema.Literals(["approve", "deny", "partial"]),
							requestId: Schema.String,
							status: Schema.String,
						})
					).pipe(s202),
				}
			),
			"Decide appeal"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_notifications_list",
				"/requests/:id/notifications",
				{
					params: { id: Schema.String },
					success: successEnvelope(NotificationSummaryResponseSchema),
				}
			),
			"List notification delivery status"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_notifications_replay",
				"/requests/:id/notifications/:eventId/replay",
				{
					params: { eventId: Schema.String, id: Schema.String },
					success: successEnvelope(
						Schema.Struct({
							eventId: Schema.String,
							status: Schema.Literal("replayed"),
						})
					).pipe(s202),
				}
			),
			"Replay a notification event"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"tenants_retention_get",
				"/tenants/:tenantId/retention",
				{
					params: { tenantId: Schema.String },
					success: successEnvelope(Schema.Array(RetentionPolicySchema)),
				}
			),
			"Get tenant retention policies"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.put(
				"tenants_retention_put",
				"/tenants/:tenantId/retention",
				{
					params: { tenantId: Schema.String },
					payload: RetentionPolicySchema,
					success: successEnvelope(RetentionPolicySchema).pipe(s202),
				}
			),
			"Update tenant retention policy"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.get(
				"requests_audit_export",
				"/requests/:id/audit/export",
				{
					params: { id: Schema.String },
					query: {
						format: Schema.optional(Schema.Literals(["jsonl", "csv"])),
					},
					success: successEnvelope(AuditExportSchema).pipe(s202),
				}
			),
			"Export audit events"
		)
	)
	.add(
		protectedOperation(
			HttpApiEndpoint.post(
				"requests_audit_verify",
				"/requests/:id/audit/verify",
				{
					params: { id: Schema.String },
					payload: AuditVerifyPayloadSchema,
					success: successEnvelope(
						Schema.Struct({
							mismatches: Schema.Array(
								Schema.Struct({
									actualHash: Schema.String,
									eventId: Schema.String,
									expectedHash: Schema.String,
								})
							),
							status: Schema.Literals(["verified", "failed"]),
							verified: Schema.Boolean,
						})
					).pipe(s202),
				}
			),
			"Verify audit chain"
		)
	);

import {
	AppealSchema,
	ArtifactManifestSchema,
	AuditExportSchema,
	AuthoritySchema,
	CapturedIntakeSchema,
	ClockSegmentSchema,
	DeliveryAddressVerifySchema,
	DeliveryLogSchema,
	DeliveryPrepareSchema,
	FulfillmentManifestSchema,
	RequestClockSchema,
	RequestorSchema,
	RetentionPolicySchema,
	StepUpChallengeSchema,
	StepUpCompleteSchema,
	TokenGatedDownloadSchema,
	VerificationCaseSchema,
} from "@dsar/schema";
import * as Schema from "effect/Schema";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

import { s200, s202 } from "./common";
import { successEnvelope } from "./schemas";

/** Common lifecycle transition response payload used by request actions. */
export const LifecycleResultSchema = Schema.Struct({
	dueAt: Schema.optional(Schema.String),
	id: Schema.String,
	status: Schema.String,
});

/** Request-intake payload schema accepted by create and capture endpoints. */
export const IntakePayloadSchema = Schema.Struct({
	authority: Schema.optional(AuthoritySchema),
	intakeSource: CapturedIntakeSchema,
	jurisdiction: Schema.String,
	receivedAt: Schema.optional(Schema.String),
	requestor: Schema.optional(RequestorSchema),
});

/** Legal-clock explanation schema returned by request explainability endpoints. */
export const ClockExplainSchema = Schema.Struct({
	baseDeadline: Schema.String,
	clock: RequestClockSchema,
	extensions: Schema.Array(
		Schema.Struct({
			additionalDays: Schema.Number,
			justification: Schema.String,
		})
	),
	finalDueAt: Schema.String,
	pauses: Schema.Array(
		Schema.Struct({
			duration: Schema.String,
			reason: Schema.String,
		})
	),
	policyPack: Schema.String,
	policyVersion: Schema.String,
	segments: Schema.Array(ClockSegmentSchema),
});

/** Allowed sort fields for request queue queries. */
export const RequestQueueSortBySchema = Schema.Literals([
	"receivedAt",
	"dueAt",
	"status",
]);
/** Allowed sort directions for request queue queries. */
export const RequestQueueSortOrderSchema = Schema.Literals(["asc", "desc"]);

/** Intake source summary schema embedded in queue and detail responses. */
export const IntakeSourceSummarySchema = Schema.Struct({
	rawContextRef: Schema.optional(Schema.String),
	receivedAt: Schema.String,
	type: Schema.String,
});

/** Request queue row schema returned by list endpoints. */
export const RequestQueueItemSchema = Schema.Struct({
	authority: AuthoritySchema,
	dueAt: Schema.String,
	id: Schema.String,
	intakeSource: Schema.optional(IntakeSourceSummarySchema),
	receivedAt: Schema.String,
	requestor: RequestorSchema,
	status: Schema.String,
});

/** Paginated request queue response schema. */
export const RequestQueueResponseSchema = Schema.Struct({
	items: Schema.Array(RequestQueueItemSchema),
	limit: Schema.Number,
	offset: Schema.Number,
	sortBy: RequestQueueSortBySchema,
	sortOrder: RequestQueueSortOrderSchema,
	total: Schema.Number,
});

/** Request detail schema returned by request lookup endpoints. */
export const RequestDetailSchema = Schema.Struct({
	appeals: Schema.Array(AppealSchema),
	authority: AuthoritySchema,
	capture: Schema.optional(CapturedIntakeSchema),
	clockMode: Schema.optional(Schema.String),
	dueAt: Schema.String,
	id: Schema.String,
	intakeSource: Schema.optional(CapturedIntakeSchema),
	receivedAt: Schema.optional(Schema.String),
	requestor: RequestorSchema,
	status: Schema.String,
});

/** Individual request timeline event schema. */
export const RequestTimelineEventSchema = Schema.Struct({
	createdAt: Schema.String,
	eventType: Schema.String,
	id: Schema.String,
	payload: Schema.Unknown,
});

/** Request timeline response schema. */
export const RequestTimelineResponseSchema = Schema.Struct({
	events: Schema.Array(RequestTimelineEventSchema),
	requestId: Schema.String,
});

/** Notification delivery-attempt schema used in notification history responses. */
export const NotificationAttemptSchema = Schema.Struct({
	attempt: Schema.Number,
	channel: Schema.String,
	createdAt: Schema.String,
	destination: Schema.String,
	error: Schema.optional(Schema.String),
	responseCode: Schema.optional(Schema.Number),
	status: Schema.Literals(["pending", "delivered", "failed", "skipped"]),
});

/** Notification event summary schema grouped by originating event. */
export const NotificationEventSummarySchema = Schema.Struct({
	attempts: Schema.Array(NotificationAttemptSchema),
	createdAt: Schema.String,
	eventId: Schema.String,
	eventType: Schema.String,
	status: Schema.Literals(["generated", "delivered", "failed", "skipped"]),
});

/** Notification history response schema scoped to a request. */
export const NotificationSummaryResponseSchema = Schema.Struct({
	events: Schema.Array(NotificationEventSummarySchema),
	requestId: Schema.String,
});

/** Raw binary payload schema used for artifact download endpoints. */
export const BinaryOctetStreamSchema = Schema.Uint8Array.pipe(
	HttpApiSchema.asUint8Array({
		contentType: "application/octet-stream",
	})
);

/** Manifest artifact download response schema. */
export const ManifestArtifactDownloadResponseSchema = BinaryOctetStreamSchema;

/** Verification evidence upload response schema. */
export const VerificationEvidenceUploadResponseSchema = Schema.Struct({
	artifactKey: Schema.String,
	evidenceId: Schema.String,
	requestId: Schema.String,
	status: Schema.String,
});

/** Manifest artifact upload response schema. */
export const ManifestArtifactUploadResponseSchema = Schema.Struct({
	artifactId: Schema.String,
	artifactKey: Schema.String,
	requestId: Schema.String,
});

/** Manifest artifact replace response schema. */
export const ManifestArtifactReplaceResponseSchema = Schema.Struct({
	artifactId: Schema.String,
	artifactKey: Schema.String,
	replaced: Schema.Boolean,
	requestId: Schema.String,
});

/** Refusal payload schema accepted by refusal endpoints. */
export const RefusalPayloadSchema = Schema.Struct({
	message: Schema.optional(Schema.String),
	rationale: Schema.optional(Schema.String),
	reason: Schema.optional(Schema.String),
});

/** Verification payload schema accepted by verification request endpoints. */
export const VerificationPayloadSchema = Schema.Struct({
	level: Schema.optional(Schema.String),
	method: Schema.optional(Schema.String),
	reasonForDoubt: Schema.optional(Schema.String),
});

/** Audit-chain verification input payload schema. */
export const AuditVerifyPayloadSchema = Schema.Struct({
	hash: Schema.String,
	prevHash: Schema.optional(Schema.String),
	sequence: Schema.Number,
});

/** Exported bundle of schemas referenced across HTTP API group modules. */
export const HttpApiSchemaCoverage = {
	AppealSchema,
	ArtifactManifestSchema,
	AuditExportSchema,
	AuthoritySchema,
	CapturedIntakeSchema,
	ClockSegmentSchema,
	DeliveryAddressVerifySchema,
	DeliveryLogSchema,
	DeliveryPrepareSchema,
	FulfillmentManifestSchema,
	ManifestArtifactDownloadResponseSchema,
	ManifestArtifactReplaceResponseSchema,
	ManifestArtifactUploadResponseSchema,
	RequestClockSchema,
	RequestorSchema,
	RetentionPolicySchema,
	VerificationCaseSchema,
	VerificationEvidenceUploadResponseSchema,
};

export {
	AppealSchema,
	ArtifactManifestSchema,
	AuditExportSchema,
	AuthoritySchema,
	CapturedIntakeSchema,
	DeliveryAddressVerifySchema,
	DeliveryLogSchema,
	DeliveryPrepareSchema,
	FulfillmentManifestSchema,
	RequestorSchema,
	RetentionPolicySchema,
	StepUpChallengeSchema,
	StepUpCompleteSchema,
	TokenGatedDownloadSchema,
	VerificationCaseSchema,
};

/** Slack URL-verification challenge response schema. */
export const SlackWebhookChallengeResponseSchema = Schema.Struct({
	challenge: Schema.String,
}).pipe(s200);

/** Slack webhook accepted response schema for captured or ignored events. */
export const SlackWebhookAcceptedResponseSchema = successEnvelope(
	Schema.Struct({
		callbackId: Schema.optional(Schema.String),
		channelId: Schema.optional(Schema.String),
		id: Schema.optional(Schema.String),
		jurisdiction: Schema.optional(Schema.String),
		reason: Schema.optional(Schema.String),
		receivedAt: Schema.optional(Schema.String),
		sourceId: Schema.String,
		status: Schema.Literals(["captured", "ignored_non_dsar"]),
		surface: Schema.optional(Schema.String),
		teamId: Schema.optional(Schema.String),
		tenantId: Schema.optional(Schema.String),
		workspaceId: Schema.optional(Schema.String),
	})
).pipe(s202);

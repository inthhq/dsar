import type {
	Appeal,
	Authority,
	DeliveryPackage,
	FulfillmentManifest,
	Requestor,
	VerificationCase,
} from "@dsar/schema";

import type { DsarResult, RequestOptions } from "../types";
import { makeAppealRequestsApi } from "./requests/appeals";
import { makeAuthorityRequestsApi } from "./requests/authority";
import { makeCoreRequestsApi } from "./requests/core";
import { makeDeliveryRequestsApi } from "./requests/delivery";
import { makeManifestRequestsApi } from "./requests/manifest";
import { makeNotificationRequestsApi } from "./requests/notifications";
import { makeVerificationRequestsApi } from "./requests/verification";
import type {
	AppealDecisionPayload,
	ArtifactDownloadPayload,
	ClockExplainPayload,
	DeliveryAddressVerifyPayload,
	DeliveryLogPayload,
	EndpointContext,
	FulfilmentCallbackPayload,
	IntakePayload,
	ManifestValidatePayload,
	NotificationReplayResponse,
	RefusalPayload,
	RequestDetailResponse,
	RequestListQuery,
	RequestNotificationsPayload,
	RequestQueueResponse,
	RequestRecord,
	RequestTimelinePayload,
	StepUpChallengePayload,
	StepUpCompletePayload,
	VerificationPayload,
} from "./types";

/**
 * SDK surface for DSAR request lifecycle operations.
 */
export interface RequestsApi {
	/** List requests with optional filters. */
	readonly list: (
		query?: RequestListQuery,
		options?: RequestOptions
	) => Promise<DsarResult<RequestQueueResponse>>;
	/** Create a new DSAR request. */
	readonly create: (
		payload: IntakePayload,
		options?: RequestOptions
	) => Promise<DsarResult<RequestRecord>>;
	/** Capture an intake without triggering the lifecycle. */
	readonly capture: (
		payload: IntakePayload,
		options?: RequestOptions
	) => Promise<DsarResult<RequestRecord>>;
	/** Get request details by ID. */
	readonly get: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<RequestDetailResponse>>;
	/** Get the event timeline for a request. */
	readonly timeline: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<RequestTimelinePayload>>;
	/** Explain the legal-clock state for a request. */
	readonly clockExplain: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<ClockExplainPayload>>;
	/** Send a clarification request to the subject. */
	readonly clarificationRequest: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Record receipt of a clarification from the subject. */
	readonly clarificationReceive: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Create a deadline extension for a request. */
	readonly createExtension: (
		requestId: string,
		payload: { readonly additionalDays?: number; readonly rationale?: string },
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Refuse a request with a rationale. */
	readonly refuse: (
		requestId: string,
		payload: RefusalPayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Mark a request as fulfilled. */
	readonly fulfil: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Close a fulfilled or refused request. */
	readonly close: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Create an acknowledgement for a request. */
	readonly createAcknowledgement: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Set the requestor identity on a request. */
	readonly setRequestor: (
		requestId: string,
		payload: Requestor,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; requestor: unknown }>>;
	/** Submit authority evidence for a request. */
	readonly submitAuthority: (
		requestId: string,
		payload: Authority,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; authority: unknown }>>;
	/** Approve the submitted authority for a request. */
	readonly approveAuthority: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; authority: unknown }>>;
	/** Reject the submitted authority for a request. */
	readonly rejectAuthority: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; authority: unknown }>>;
	/** Initiate identity verification for a request. */
	readonly verificationRequest: (
		requestId: string,
		payload: VerificationPayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Submit verification evidence for a request. */
	readonly verificationEvidence: (
		requestId: string,
		payload: VerificationCase,
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			requestId: string;
			evidenceId: string;
			level: string;
			status: string;
			surface: string;
		}>
	>;
	/** Upload a verification evidence file for a request. */
	readonly verificationEvidenceUpload: (
		requestId: string,
		payload: {
			readonly bytes: Uint8Array;
			readonly contentType: string;
			readonly fileName: string;
			readonly level?: string;
		},
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			artifactKey: string;
			evidenceId: string;
			requestId: string;
			status: string;
		}>
	>;
	/** Approve identity verification for a request. */
	readonly verificationApprove: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Reject identity verification for a request. */
	readonly verificationReject: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Get the verification case for a request. */
	readonly verificationCase: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<VerificationCase>>;
	/** Prepare a delivery package for a request. */
	readonly deliveryPrepare: (
		requestId: string,
		payload: DeliveryPackage,
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			requestId: string;
			artifactId: string;
			deliveryPrepare: unknown;
			surface: string;
		}>
	>;
	/** Verify the delivery address for a request. */
	readonly deliveryAddressVerify: (
		requestId: string,
		payload: DeliveryAddressVerifyPayload,
		options?: RequestOptions
	) => Promise<
		DsarResult<{ requestId: string; email?: string; verified: boolean }>
	>;
	/** Issue a step-up authentication challenge for delivery. */
	readonly deliveryStepUpChallenge: (
		requestId: string,
		payload: StepUpChallengePayload,
		options?: RequestOptions
	) => Promise<
		DsarResult<{ requestId: string; token: string; expiresAt: string }>
	>;
	/** Complete a step-up authentication challenge for delivery. */
	readonly deliveryStepUpComplete: (
		requestId: string,
		payload: StepUpCompletePayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Downloads a delivery artifact by ID using a required delivery token. */
	readonly artifactDownload: (
		requestId: string,
		artifactId: string,
		deliveryToken: string,
		options?: RequestOptions
	) => Promise<DsarResult<ArtifactDownloadPayload>>;
	/** List delivery log entries for a request. */
	readonly deliveryLogs: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<readonly DeliveryLogPayload[]>>;
	/** Get notification history for a request. */
	readonly notifications: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<RequestNotificationsPayload>>;
	/** Submit a fulfilment callback for a request. */
	readonly fulfilmentCallback: (
		requestId: string,
		payload: FulfilmentCallbackPayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Get the fulfilment manifest for a request. */
	readonly manifestGet: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<FulfillmentManifest>>;
	/** Validate the fulfilment manifest for a request. */
	readonly manifestValidate: (
		requestId: string,
		payload: ManifestValidatePayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Upload an artifact to the fulfilment manifest. */
	readonly manifestArtifactUpload: (
		requestId: string,
		payload: {
			readonly bytes: Uint8Array;
			readonly contentType: string;
			readonly fileName: string;
			readonly title?: string;
			readonly artifactType?: string;
		},
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			artifactId: string;
			artifactKey: string;
			requestId: string;
		}>
	>;
	/** Download an artifact from the fulfilment manifest. */
	readonly manifestArtifactDownload: (
		requestId: string,
		artifactId: string,
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			bytes: Uint8Array;
			contentType: string;
			artifactId: string;
		}>
	>;
	/** Replace an existing artifact in the fulfilment manifest. */
	readonly manifestArtifactReplace: (
		requestId: string,
		artifactId: string,
		payload: {
			readonly bytes: Uint8Array;
			readonly contentType: string;
			readonly fileName: string;
		},
		options?: RequestOptions
	) => Promise<
		DsarResult<{
			artifactId: string;
			artifactKey: string;
			replaced: boolean;
			requestId: string;
		}>
	>;
	/** Create an appeal for a request. */
	readonly appealsCreate: (
		requestId: string,
		payload: Appeal,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** List appeals for a request. */
	readonly appealsList: (
		requestId: string,
		options?: RequestOptions
	) => Promise<DsarResult<readonly Appeal[]>>;
	/** Decide (approve or reject) an appeal. */
	readonly appealsDecide: (
		requestId: string,
		appealId: string,
		payload: AppealDecisionPayload,
		options?: RequestOptions
	) => Promise<DsarResult<{ requestId: string; status: string }>>;
	/** Replay a notification event for a request. */
	readonly notificationReplay: (
		requestId: string,
		eventId: string,
		options?: RequestOptions
	) => Promise<DsarResult<NotificationReplayResponse>>;
}

/**
 * Create the requests API surface from the given endpoint context.
 *
 * @param ctx - Shared endpoint context providing the HTTP caller.
 * @returns A {@link RequestsApi} instance bound to `ctx`.
 */
export const makeRequestsApi = (ctx: EndpointContext): RequestsApi => ({
	...makeCoreRequestsApi(ctx),
	...makeAuthorityRequestsApi(ctx),
	...makeVerificationRequestsApi(ctx),
	...makeDeliveryRequestsApi(ctx),
	...makeManifestRequestsApi(ctx),
	...makeAppealRequestsApi(ctx),
	...makeNotificationRequestsApi(ctx),
});

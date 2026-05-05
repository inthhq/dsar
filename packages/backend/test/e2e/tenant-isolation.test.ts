import { TenantContext, withTenant } from "@dsar/persistence";
import type {
	AuditEventRecord,
	ChatStateRecord,
	ChatThreadLockRecord,
	ChatThreadSubscriptionRecord,
	ClockSegmentRecord,
	CreateAuditEventInput,
	CreateClockSegmentInput,
	CreateFulfillmentArtifactInput,
	CreateNotificationDeliveryAttemptInput,
	CreateNotificationEventInput,
	CreatePolicyAssignmentInput,
	CreateRequestInput,
	CreateRequestTimelineEventInput,
	CreateVerificationEvidenceInput,
	FulfillmentArtifactRecord,
	JsonValue,
	NotificationDeliveryAttemptRecord,
	NotificationEventRecord,
	PaginationInput,
	PersistenceService,
	PolicyAssignmentRecord,
	RequestRecord,
	RequestTimelineEventRecord,
	RetentionPolicyRecord,
	UpdateFulfillmentArtifactInput,
	UpdateRequestInput,
	UpsertRetentionPolicyInput,
	VerificationEvidenceRecord,
	WebhookEndpointRecord,
	WebhookSigningKeyRecord,
} from "@dsar/persistence";
import { ukDefaultPack } from "@dsar/policy-packs";
/* oxlint-disable jest/max-expects -- adversarial route matrix intentionally asserts every protected surface */
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type {
	AdapterContractError,
	InboundAdapterContract,
	StorageAdapterContract,
} from "../../src";
import { coreRoutes } from "../../src/routes";
import { BASE_JSON_BODY } from "./fixtures";
import { startApiE2eServer } from "./harness";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const TOKEN_A = "tenant-a-token";
const TOKEN_B = "tenant-b-token";
const TENANT_A_SECRET = "tenant-a-private-marker";
const TENANT_B_SECRET = "tenant-b-private-marker";
const OVERLAP_REQUEST_ID = "req-overlap";
const TENANT_B_ONLY_REQUEST_ID = "req-tenant-b-only";
const OVERLAP_ARTIFACT_ID = "artifact-overlap";
const TENANT_B_ARTIFACT_ID = "artifact-tenant-b-only";
const OVERLAP_EVENT_ID = "event-overlap";
const TENANT_B_EVENT_ID = "event-tenant-b-only";
const OVERLAP_APPEAL_ID = "appeal-overlap";
const FUTURE_ISO = "2099-01-01T00:00:00.000Z";
const E2E_TEST_TIMEOUT_MS = 15_000;

const tenantAHeaders = {
	authorization: `Bearer ${TOKEN_A}`,
	"x-tenant-id": TENANT_B,
} as const;

const tenantBHeaders = {
	authorization: `Bearer ${TOKEN_B}`,
} as const;

const authConfig = {
	staticBearerTokens: {
		[TOKEN_A]: {
			actorId: "operator-a",
			principalKind: "operator",
			role: "admin",
			tenantId: TENANT_A,
		},
		[TOKEN_B]: {
			actorId: "operator-b",
			principalKind: "operator",
			role: "admin",
			tenantId: TENANT_B,
		},
	},
} as const;

type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RouteProbe {
	readonly key: string;
	readonly method?: RouteMethod;
	readonly path: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly json?: unknown;
	readonly body?: BodyInit;
}

const routeKey = (method: string, path: string): string => `${method} ${path}`;

const currentTenantId = Effect.service(TenantContext).pipe(
	Effect.map((context) => context.tenantId)
);

const scopedKey = (tenantId: string, id: string): string => `${tenantId}:${id}`;

const compareActiveWebhookKeys = (
	left: WebhookSigningKeyRecord,
	right: WebhookSigningKeyRecord
): number => {
	if (left.role !== right.role) {
		return left.role === "primary" ? -1 : 1;
	}
	return left.createdAt === right.createdAt
		? left.id.localeCompare(right.id)
		: right.createdAt.localeCompare(left.createdAt);
};

const notFound = (entity: string, id: string): Error =>
	new Error(`Missing ${entity} ${id}`);

const withDefinedPatch = <T extends Record<string, unknown>>(
	current: T,
	patch: Record<string, unknown>
): T => {
	const next: Record<string, unknown> = { ...current };
	for (const [key, value] of Object.entries(patch)) {
		if (value !== undefined) {
			next[key] = value;
		}
	}
	return next as T;
};

const paginate = <T>(
	items: readonly T[],
	pagination?: PaginationInput
): readonly T[] => {
	const offset = pagination?.offset ?? 0;
	const limit = pagination?.limit ?? items.length;
	return items.slice(offset, offset + limit);
};

const makeTenantScopedMemoryPersistence = (): PersistenceService => {
	const requests = new Map<string, RequestRecord>();
	const timeline: RequestTimelineEventRecord[] = [];
	const clockSegments: ClockSegmentRecord[] = [];
	const policyAssignments: PolicyAssignmentRecord[] = [];
	const verificationEvidence: VerificationEvidenceRecord[] = [];
	const fulfillmentArtifacts = new Map<string, FulfillmentArtifactRecord>();
	const retentionPolicies = new Map<string, RetentionPolicyRecord>();
	const auditEvents: AuditEventRecord[] = [];
	const notificationEvents = new Map<string, NotificationEventRecord>();
	const notificationAttempts: NotificationDeliveryAttemptRecord[] = [];
	const webhookEndpoints = new Map<string, WebhookEndpointRecord>();
	const webhookSigningKeys: WebhookSigningKeyRecord[] = [];
	const chatState = new Map<string, ChatStateRecord>();
	const chatSubscriptions = new Map<string, ChatThreadSubscriptionRecord>();
	const chatLocks = new Map<string, ChatThreadLockRecord>();

	return {
		auditEvents: {
			append: (input: CreateAuditEventInput) =>
				Effect.gen(function* appendAuditEvent() {
					const tenantId = yield* currentTenantId;
					const record: AuditEventRecord = {
						...input,
						tenantId,
					};
					auditEvents.push(record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listAuditEvents() {
					const tenantId = yield* currentTenantId;
					return auditEvents
						.filter(
							(event) =>
								event.tenantId === tenantId && event.requestId === requestId
						)
						.toSorted((left, right) => left.sequence - right.sequence);
				}),
		},
		chatRuntimeState: {
			acquireLock: (input) =>
				Effect.gen(function* acquireLock() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, input.threadId);
					const current = chatLocks.get(key);
					if (current) {
						return null;
					}
					const record: ChatThreadLockRecord = { ...input, tenantId };
					chatLocks.set(key, record);
					return record;
				}),
			delete: (key: string) =>
				Effect.gen(function* deleteState() {
					const tenantId = yield* currentTenantId;
					chatState.delete(scopedKey(tenantId, key));
				}),
			extendLock: (input) =>
				Effect.gen(function* extendLock() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, input.threadId);
					const current = chatLocks.get(key);
					if (!current || current.token !== input.token) {
						return false;
					}
					chatLocks.set(key, { ...current, expiresAt: input.expiresAt });
					return true;
				}),
			get: (key: string) =>
				Effect.gen(function* getState() {
					const tenantId = yield* currentTenantId;
					return chatState.get(scopedKey(tenantId, key)) ?? null;
				}),
			isSubscribed: (threadId: string) =>
				Effect.gen(function* isSubscribed() {
					const tenantId = yield* currentTenantId;
					return chatSubscriptions.has(scopedKey(tenantId, threadId));
				}),
			releaseLock: (input) =>
				Effect.gen(function* releaseLock() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, input.threadId);
					const current = chatLocks.get(key);
					if (current?.token === input.token) {
						chatLocks.delete(key);
					}
				}),
			set: (input) =>
				Effect.gen(function* setState() {
					const tenantId = yield* currentTenantId;
					const record: ChatStateRecord = { ...input, tenantId };
					chatState.set(scopedKey(tenantId, input.key), record);
					return record;
				}),
			setIfNotExists: (input) =>
				Effect.gen(function* setStateIfMissing() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, input.key);
					if (chatState.has(key)) {
						return false;
					}
					chatState.set(key, { ...input, tenantId });
					return true;
				}),
			subscribe: (input) =>
				Effect.gen(function* subscribe() {
					const tenantId = yield* currentTenantId;
					const record: ChatThreadSubscriptionRecord = { ...input, tenantId };
					chatSubscriptions.set(scopedKey(tenantId, input.threadId), record);
					return record;
				}),
			unsubscribe: (threadId: string) =>
				Effect.gen(function* unsubscribe() {
					const tenantId = yield* currentTenantId;
					chatSubscriptions.delete(scopedKey(tenantId, threadId));
				}),
		},
		clockSegments: {
			append: (input: CreateClockSegmentInput) =>
				Effect.gen(function* appendClockSegment() {
					const tenantId = yield* currentTenantId;
					const record: ClockSegmentRecord = { ...input, tenantId };
					clockSegments.push(record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listClockSegments() {
					const tenantId = yield* currentTenantId;
					return clockSegments.filter(
						(segment) =>
							segment.tenantId === tenantId && segment.requestId === requestId
					);
				}),
		},
		fulfillmentArtifacts: {
			create: (input: CreateFulfillmentArtifactInput) =>
				Effect.gen(function* createFulfillmentArtifact() {
					const tenantId = yield* currentTenantId;
					const record: FulfillmentArtifactRecord = {
						...input,
						tenantId,
						updatedAt: input.updatedAt ?? input.createdAt,
					};
					fulfillmentArtifacts.set(scopedKey(tenantId, record.id), record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listFulfillmentArtifacts() {
					const tenantId = yield* currentTenantId;
					return [...fulfillmentArtifacts.values()]
						.filter(
							(artifact) =>
								artifact.tenantId === tenantId &&
								artifact.requestId === requestId
						)
						.toSorted((left, right) =>
							right.createdAt.localeCompare(left.createdAt)
						);
				}),
			update: (id: string, input: UpdateFulfillmentArtifactInput) =>
				Effect.gen(function* updateFulfillmentArtifact() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, id);
					const current = fulfillmentArtifacts.get(key);
					if (!current) {
						return yield* Effect.fail(notFound("fulfillment artifact", id));
					}
					const updated = withDefinedPatch(current, input);
					fulfillmentArtifacts.set(key, updated);
					return updated;
				}),
		},
		notificationDeliveryAttempts: {
			append: (input: CreateNotificationDeliveryAttemptInput) =>
				Effect.gen(function* appendNotificationAttempt() {
					const tenantId = yield* currentTenantId;
					const record: NotificationDeliveryAttemptRecord = {
						...input,
						tenantId,
					};
					notificationAttempts.push(record);
					return record;
				}),
			listByNotificationEventId: (notificationEventId: string) =>
				Effect.gen(function* listNotificationAttempts() {
					const tenantId = yield* currentTenantId;
					return notificationAttempts.filter(
						(attempt) =>
							attempt.tenantId === tenantId &&
							attempt.notificationEventId === notificationEventId
					);
				}),
		},
		notificationEvents: {
			append: (input: CreateNotificationEventInput) =>
				Effect.gen(function* appendNotificationEvent() {
					const tenantId = yield* currentTenantId;
					const record: NotificationEventRecord = { ...input, tenantId };
					notificationEvents.set(scopedKey(tenantId, record.id), record);
					return record;
				}),
			getById: (id: string) =>
				Effect.gen(function* getNotificationEvent() {
					const tenantId = yield* currentTenantId;
					const record = notificationEvents.get(scopedKey(tenantId, id));
					if (!record) {
						return yield* Effect.fail(notFound("notification event", id));
					}
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listNotificationEvents() {
					const tenantId = yield* currentTenantId;
					return [...notificationEvents.values()]
						.filter(
							(event) =>
								event.tenantId === tenantId && event.requestId === requestId
						)
						.toSorted((left, right) =>
							left.createdAt === right.createdAt
								? left.id.localeCompare(right.id)
								: left.createdAt.localeCompare(right.createdAt)
						);
				}),
		},
		policyAssignments: {
			assign: (input: CreatePolicyAssignmentInput) =>
				Effect.gen(function* assignPolicy() {
					const tenantId = yield* currentTenantId;
					const record: PolicyAssignmentRecord = { ...input, tenantId };
					policyAssignments.push(record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listPolicyAssignments() {
					const tenantId = yield* currentTenantId;
					return policyAssignments.filter(
						(assignment) =>
							assignment.tenantId === tenantId &&
							assignment.requestId === requestId
					);
				}),
		},
		requests: {
			create: (input: CreateRequestInput) =>
				Effect.gen(function* createRequest() {
					const tenantId = yield* currentTenantId;
					const record: RequestRecord = {
						...input,
						createdAt: input.receivedAt,
						tenantId,
						updatedAt: input.receivedAt,
					};
					requests.set(scopedKey(tenantId, record.id), record);
					return record;
				}),
			getById: (id: string) =>
				Effect.gen(function* getRequest() {
					const tenantId = yield* currentTenantId;
					const record = requests.get(scopedKey(tenantId, id));
					if (!record) {
						return yield* Effect.fail(notFound("request", id));
					}
					return record;
				}),
			list: (pagination?: PaginationInput) =>
				Effect.gen(function* listRequests() {
					const tenantId = yield* currentTenantId;
					const tenantRequests = [...requests.values()].filter(
						(request) => request.tenantId === tenantId
					);
					return paginate(tenantRequests, pagination);
				}),
			remove: (id: string) =>
				Effect.gen(function* removeRequest() {
					const tenantId = yield* currentTenantId;
					requests.delete(scopedKey(tenantId, id));
				}),
			update: (id: string, input: UpdateRequestInput) =>
				Effect.gen(function* updateRequest() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, id);
					const current = requests.get(key);
					if (!current) {
						return yield* Effect.fail(notFound("request", id));
					}
					const updated = withDefinedPatch(current, input);
					requests.set(key, updated);
					return updated;
				}),
		},
		retentionPolicies: {
			list: () =>
				Effect.gen(function* listRetentionPolicies() {
					const tenantId = yield* currentTenantId;
					return [...retentionPolicies.values()].filter(
						(policy) => policy.tenantId === tenantId
					);
				}),
			upsert: (input: UpsertRetentionPolicyInput) =>
				Effect.gen(function* upsertRetentionPolicy() {
					const tenantId = yield* currentTenantId;
					const record: RetentionPolicyRecord = { ...input, tenantId };
					retentionPolicies.set(scopedKey(tenantId, record.id), record);
					return record;
				}),
		},
		timeline: {
			append: (input: CreateRequestTimelineEventInput) =>
				Effect.gen(function* appendTimeline() {
					const tenantId = yield* currentTenantId;
					const record: RequestTimelineEventRecord = { ...input, tenantId };
					timeline.push(record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listTimeline() {
					const tenantId = yield* currentTenantId;
					return timeline
						.filter(
							(event) =>
								event.tenantId === tenantId && event.requestId === requestId
						)
						.toSorted((left, right) =>
							left.createdAt === right.createdAt
								? left.id.localeCompare(right.id)
								: left.createdAt.localeCompare(right.createdAt)
						);
				}),
		},
		verificationEvidence: {
			create: (input: CreateVerificationEvidenceInput) =>
				Effect.gen(function* createVerificationEvidence() {
					const tenantId = yield* currentTenantId;
					const record: VerificationEvidenceRecord = {
						...input,
						tenantId,
						updatedAt: input.updatedAt ?? input.createdAt,
					};
					verificationEvidence.push(record);
					return record;
				}),
			listByRequestId: (requestId: string) =>
				Effect.gen(function* listVerificationEvidence() {
					const tenantId = yield* currentTenantId;
					return verificationEvidence.filter(
						(evidence) =>
							evidence.tenantId === tenantId && evidence.requestId === requestId
					);
				}),
		},
		webhookEndpoints: {
			ensureConfigured: (input) =>
				Effect.gen(function* ensureConfiguredWebhookEndpoint() {
					const tenantId = yield* currentTenantId;
					const key = scopedKey(tenantId, input.id);
					const current = webhookEndpoints.get(key);
					const endpoint: WebhookEndpointRecord = {
						createdAt: current?.createdAt ?? input.createdAt,
						id: input.id,
						tenantId,
						updatedAt: input.createdAt,
						url: input.url,
					};
					webhookEndpoints.set(key, endpoint);
					let primaryKey = webhookSigningKeys.find(
						(signingKey) =>
							signingKey.tenantId === tenantId &&
							signingKey.endpointId === input.id &&
							signingKey.role === "primary"
					);
					if (!primaryKey) {
						primaryKey = {
							createdAt: input.createdAt,
							endpointId: input.id,
							id: input.keyId ?? `${input.id}:primary`,
							role: "primary",
							secret: input.signingSecret,
							tenantId,
						};
						webhookSigningKeys.push(primaryKey);
					}
					return { endpoint, primaryKey };
				}),
			getById: (id) =>
				Effect.gen(function* getWebhookEndpointById() {
					const tenantId = yield* currentTenantId;
					const endpoint = webhookEndpoints.get(scopedKey(tenantId, id));
					if (!endpoint) {
						return yield* Effect.fail(
							new Error(`Missing webhook endpoint ${id}`)
						);
					}
					return endpoint;
				}),
			listActiveKeys: (endpointId, now) =>
				Effect.gen(function* listActiveWebhookKeys() {
					const tenantId = yield* currentTenantId;
					return webhookSigningKeys
						.filter(
							(signingKey) =>
								signingKey.tenantId === tenantId &&
								signingKey.endpointId === endpointId &&
								(signingKey.role === "primary" ||
									signingKey.expiresAt === undefined ||
									signingKey.expiresAt > now)
						)
						.toSorted(compareActiveWebhookKeys);
				}),
			rollbackSigningKeyRotation: (input) =>
				Effect.gen(function* rollbackSigningKeyRotation() {
					const tenantId = yield* currentTenantId;
					const removedPrimary = webhookSigningKeys.some(
						(signingKey) =>
							signingKey.tenantId === tenantId &&
							signingKey.endpointId === input.endpointId &&
							signingKey.id === input.newKeyId &&
							signingKey.role === "primary"
					);
					const retainedKeys = webhookSigningKeys.filter(
						(signingKey) =>
							!(
								signingKey.tenantId === tenantId &&
								signingKey.endpointId === input.endpointId &&
								signingKey.id === input.newKeyId &&
								signingKey.role === "primary"
							)
					);
					webhookSigningKeys.splice(
						0,
						webhookSigningKeys.length,
						...retainedKeys
					);
					if (!(removedPrimary && input.previousPrimary)) {
						return;
					}
					const previousIndex = webhookSigningKeys.findIndex(
						(signingKey) =>
							signingKey.tenantId === tenantId &&
							signingKey.endpointId === input.endpointId &&
							signingKey.id === input.previousPrimary?.id
					);
					if (previousIndex !== -1) {
						webhookSigningKeys[previousIndex] = {
							...input.previousPrimary,
							expiresAt: undefined,
							role: "primary",
						};
					}
				}),
			rotateSigningKey: (input) =>
				Effect.gen(function* rotateWebhookSigningKey() {
					const tenantId = yield* currentTenantId;
					const endpoint = webhookEndpoints.get(
						scopedKey(tenantId, input.endpointId)
					);
					if (!endpoint) {
						return yield* Effect.fail(
							new Error(`Missing webhook endpoint ${input.endpointId}`)
						);
					}
					const previousIndex = webhookSigningKeys.findIndex(
						(signingKey) =>
							signingKey.tenantId === tenantId &&
							signingKey.endpointId === input.endpointId &&
							signingKey.role === "primary"
					);
					const previousPrimary =
						previousIndex === -1
							? undefined
							: {
									...(webhookSigningKeys[
										previousIndex
									] as WebhookSigningKeyRecord),
									expiresAt: input.graceExpiresAt,
									role: "secondary" as const,
								};
					if (previousPrimary) {
						webhookSigningKeys[previousIndex] = previousPrimary;
					}
					const newPrimary: WebhookSigningKeyRecord = {
						createdAt: input.rotatedAt,
						endpointId: input.endpointId,
						id: input.newKeyId,
						role: "primary",
						secret: input.newSecret,
						tenantId,
					};
					webhookSigningKeys.push(newPrimary);
					return {
						activeKeys: webhookSigningKeys
							.filter(
								(signingKey) =>
									signingKey.tenantId === tenantId &&
									signingKey.endpointId === input.endpointId &&
									(signingKey.role === "primary" ||
										signingKey.expiresAt === undefined ||
										signingKey.expiresAt > input.rotatedAt)
							)
							.toSorted(compareActiveWebhookKeys),
						endpoint,
						newPrimary,
						previousPrimary,
					};
				}),
		},
	};
};

interface MemoryStorageAdapter extends StorageAdapterContract {
	readonly seed: (key: string, bytes: Uint8Array, contentType?: string) => void;
}

const missingObject = (key: string): AdapterContractError => ({
	category: "not_found",
	message: `Missing object ${key}`,
	retriable: false,
});

const makeMemoryStorage = (): MemoryStorageAdapter => {
	const objects = new Map<
		string,
		{
			readonly bytes: Uint8Array;
			readonly contentType: string;
		}
	>();
	const seed = (
		key: string,
		bytes: Uint8Array,
		contentType = "text/plain"
	): void => {
		objects.set(key, { bytes, contentType });
	};
	return {
		capability: "storage",
		deleteObject: (key) =>
			Effect.succeed({
				deleted: objects.delete(key),
				key,
			}),
		diagnostics: () =>
			Effect.succeed({
				capability: "storage",
				key: "tenant-isolation-memory-storage",
			}),
		getObject: (key) =>
			Effect.gen(function* getObject() {
				const object = objects.get(key);
				if (!object) {
					return yield* Effect.fail(missingObject(key));
				}
				return {
					bytes: object.bytes,
					contentType: object.contentType,
					key,
					metadata: {
						contentType: object.contentType,
						key,
						sizeBytes: object.bytes.byteLength,
					},
				};
			}),
		headObject: (key) =>
			Effect.gen(function* headObject() {
				const object = objects.get(key);
				if (!object) {
					return yield* Effect.fail(missingObject(key));
				}
				return {
					contentType: object.contentType,
					key,
					sizeBytes: object.bytes.byteLength,
				};
			}),
		healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
		init: () => Effect.void,
		key: "tenant-isolation-memory-storage",
		putObject: (input) => {
			seed(input.key, input.bytes, input.contentType);
			return Effect.succeed({
				key: input.key,
				metadata: {
					contentType: input.contentType,
					key: input.key,
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
					sizeBytes: input.bytes.byteLength,
				},
				reference: {
					key: input.key,
					manifestHash: input.manifestHash,
					manifestId: input.manifestId,
					manifestSignature: input.manifestSignature,
					requestId: input.requestId,
				},
			});
		},
		seed,
		validateConfig: () => Effect.void,
	};
};

const makeInboundAdapter = (
	key: "resend" | "slack",
	payload: Readonly<Record<string, unknown>>
): InboundAdapterContract => ({
	capability: "inbound",
	diagnostics: () =>
		Effect.succeed({
			capability: "inbound",
			key,
		}),
	healthCheck: () => Effect.succeed({ ok: true, status: "healthy" }),
	init: () => Effect.void,
	key,
	receive: () =>
		Effect.succeed({
			payload,
			receivedAt: "2026-02-20T00:00:00.000Z",
			sourceId: `${key}-source-id`,
		}),
	validateConfig: () => Effect.void,
});

const requestInput = (input: {
	readonly id: string;
	readonly marker: string;
	readonly subjectId: string;
}): CreateRequestInput => ({
	appeals: [
		{
			createdAt: "2026-02-20T00:00:00.000Z",
			id: OVERLAP_APPEAL_ID,
			message: `${input.marker} appeal`,
			status: "submitted",
		},
	],
	authority: {
		marker: input.marker,
		status: "pending",
		type: "subject",
	},
	capture: {
		intakeSource: {
			channel: "api",
			rawText: input.marker,
			receivedAt: "2026-02-20T00:00:00.000Z",
			type: "api",
		},
		jurisdiction: "uk",
		policy: {
			policyPack: "uk-default",
			policyVersion: "1.0.0",
		},
		policyEvaluation: {
			decision: {
				appealEligible: true,
			},
		},
		subject: {
			externalRef: `${input.subjectId}-external`,
			subjectId: input.subjectId,
		},
	},
	clockMode: "calendar_days",
	dueAt: "2026-03-22T00:00:00.000Z",
	id: input.id,
	receivedAt: "2026-02-20T00:00:00.000Z",
	requestor: {
		email: `${input.subjectId}@example.test`,
		marker: input.marker,
		type: "subject",
	},
	status: "received",
});

const artifactManifest = (input: {
	readonly artifactId: string;
	readonly emptyStorageKey?: boolean;
	readonly legacyStorageKey?: boolean;
	readonly marker: string;
	readonly requestId: string;
	readonly tenantId: string;
}) => {
	let storageKey = `tenants/${input.tenantId}/requests/${input.requestId}/manifest/${input.artifactId}/data.txt`;
	if (input.legacyStorageKey) {
		storageKey = `manifest/${input.requestId}/${input.artifactId}/data.txt`;
	}
	if (input.emptyStorageKey) {
		storageKey = "";
	}
	return {
		artifacts: [
			{
				description: input.marker,
				id: input.artifactId,
				mediaType: "text/plain",
				sha256: "",
				sizeBytes: input.marker.length,
				sourceSystem: "tenant-isolation-test",
				storageKey,
				title: input.marker,
				type: "export",
			},
		],
		dataCategories: [input.marker],
		redactionsApplied: [],
		thirdPartyExclusions: [],
	} as const satisfies JsonValue;
};

const seedTenant = async (
	persistence: PersistenceService,
	storage: MemoryStorageAdapter,
	tenantId: string,
	input: {
		readonly artifactId: string;
		readonly emptyStorageKey?: boolean;
		readonly eventId: string;
		readonly legacyStorageKey?: boolean;
		readonly marker: string;
		readonly requestId: string;
		readonly subjectId: string;
		readonly token: string;
	}
): Promise<void> => {
	const manifest = artifactManifest({ ...input, tenantId });
	const artifact = Array.isArray(manifest.artifacts)
		? manifest.artifacts[0]
		: undefined;
	const storageKey =
		typeof artifact === "object" &&
		artifact !== null &&
		"storageKey" in artifact &&
		typeof artifact.storageKey === "string"
			? artifact.storageKey
			: "";
	if (storageKey) {
		storage.seed(storageKey, new TextEncoder().encode(input.marker));
	}
	await Effect.runPromise(
		Effect.gen(function* seedTenantData() {
			yield* persistence.requests.create(
				requestInput({
					id: input.requestId,
					marker: input.marker,
					subjectId: input.subjectId,
				})
			);
			yield* persistence.timeline.append({
				createdAt: "2026-02-20T00:00:00.000Z",
				eventType: "captured",
				id: `timeline-${input.requestId}`,
				payload: { marker: input.marker },
				requestId: input.requestId,
			});
			yield* persistence.clockSegments.append({
				actor: "seed",
				countsTowardDeadline: true,
				from: "2026-02-20T00:00:00.000Z",
				id: `clock-${input.requestId}`,
				policyVersion: "1.0.0",
				reason: input.marker,
				requestId: input.requestId,
				to: "2026-03-22T00:00:00.000Z",
			});
			yield* persistence.fulfillmentArtifacts.create({
				artifactManifest: manifest,
				createdAt: "2026-02-20T00:00:00.000Z",
				deliveryLogs: [{ marker: input.marker }],
				deliveryPrepare: {
					email: `${input.subjectId}@example.test`,
					marker: input.marker,
				},
				id: `manifest-${input.requestId}`,
				requestId: input.requestId,
				tokenGate: {
					expiresAt: FUTURE_ISO,
					status: "completed",
					token: input.token,
				},
				updatedAt: "2026-02-20T00:00:00.000Z",
				validationState: "approved",
			});
			yield* persistence.notificationEvents.append({
				correlationId: `corr-${input.eventId}`,
				createdAt: "2026-02-20T00:00:00.000Z",
				eventType: "delivery_prepared",
				id: input.eventId,
				idempotencyKey: `idem-${input.eventId}`,
				locale: "en-GB",
				payload: { marker: input.marker },
				policyVersion: "1.0.0",
				requestId: input.requestId,
			});
			yield* persistence.notificationDeliveryAttempts.append({
				attempt: 1,
				channel: "webhook",
				createdAt: "2026-02-20T00:00:00.000Z",
				destination: `https://${tenantId}.example.test/webhook`,
				id: `attempt-${input.eventId}`,
				notificationEventId: input.eventId,
				requestId: input.requestId,
				responseCode: 202,
				status: "delivered",
			});
			yield* persistence.auditEvents.append({
				action: "seeded",
				actor: "seed",
				after: { marker: input.marker },
				before: {},
				createdAt: "2026-02-20T00:00:00.000Z",
				hash: `hash-${input.requestId}`,
				hashAlg: "sha256",
				id: `audit-${input.requestId}`,
				object: "request",
				reason: { marker: input.marker },
				requestId: input.requestId,
				sequence: 1,
			});
			yield* persistence.retentionPolicies.upsert({
				class: "request_record",
				id: "retention-overlap",
				legalHoldEnabled: false,
				maxDays: 365,
				minDays: 30,
				purgeEnabled: true,
				updatedAt: "2026-02-20T00:00:00.000Z",
			});
		}).pipe(withTenant(tenantId))
	);
};

const makeRouteProbes = (): readonly RouteProbe[] => [
	{
		key: "POST /init",
		method: "POST",
		path: "/init",
	},
	{
		body: "{}",
		headers: { "content-type": "application/json" },
		key: "POST /webhooks/inbound/resend",
		method: "POST",
		path: "/webhooks/inbound/resend",
	},
	{
		body: "{}",
		headers: { "content-type": "application/json" },
		key: "POST /webhooks/inbound/slack",
		method: "POST",
		path: "/webhooks/inbound/slack",
	},
	{
		headers: tenantAHeaders,
		json: { gracePeriodDays: 7 },
		key: "POST /webhooks/endpoints/:id/rotate-key",
		method: "POST",
		path: "/webhooks/endpoints/default/rotate-key",
	},
	{
		headers: tenantAHeaders,
		json: {
			intakeSource: BASE_JSON_BODY.intakeSource,
			jurisdiction: "uk",
		},
		key: "POST /requests",
		method: "POST",
		path: "/requests",
	},
	{
		headers: tenantAHeaders,
		json: {
			intakeSource: BASE_JSON_BODY.intakeSource,
			jurisdiction: "uk",
		},
		key: "POST /requests/capture",
		method: "POST",
		path: "/requests/capture",
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests",
		method: "GET",
		path: "/requests?limit=500&sortBy=receivedAt&sortOrder=asc",
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/timeline",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/timeline`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/clock/explain",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/clock/explain`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/clarifications/request",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/clarifications/request`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/clarifications/receive",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/clarifications/receive`,
	},
	{
		headers: tenantAHeaders,
		json: { additionalDays: 7, rationale: "Need more time" },
		key: "POST /requests/:id/extensions",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/extensions`,
	},
	{
		headers: tenantAHeaders,
		json: { rationale: "Out of scope" },
		key: "POST /requests/:id/refusals",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/refusals`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/closures",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/closures`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/fulfilment",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/fulfilment`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/acknowledgements",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/acknowledgements`,
	},
	{
		headers: tenantAHeaders,
		json: { email: "attacker@example.test", type: "subject" },
		key: "PUT /requests/:id/requestor",
		method: "PUT",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/requestor`,
	},
	{
		headers: tenantAHeaders,
		json: { evidenceArtifacts: ["forged-evidence"] },
		key: "POST /requests/:id/authority/submit",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/authority/submit`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/authority/approve",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/authority/approve`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/authority/reject",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/authority/reject`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/verification/request",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification/request`,
	},
	{
		headers: tenantAHeaders,
		json: { level: "reasonable" },
		key: "POST /requests/:id/verification/evidence",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification/evidence`,
	},
	{
		body: new Uint8Array([1, 2, 3]),
		headers: {
			...tenantAHeaders,
			"content-type": "application/octet-stream",
			"x-evidence-filename": "evidence.txt",
		},
		key: "POST /requests/:id/verification/evidence/upload",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification/evidence/upload`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/verification/approve",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification/approve`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/verification/reject",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification/reject`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/verification-case",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/verification-case`,
	},
	{
		headers: tenantAHeaders,
		json: { channel: "portal", securityLevel: "standard" },
		key: "POST /requests/:id/delivery/prepare",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/delivery/prepare`,
	},
	{
		headers: tenantAHeaders,
		json: { email: "subject-b@example.test" },
		key: "POST /requests/:id/delivery/address/verify",
		method: "POST",
		path: `/requests/${OVERLAP_REQUEST_ID}/delivery/address/verify`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/delivery/step-up/challenge",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/delivery/step-up/challenge`,
	},
	{
		headers: tenantAHeaders,
		json: { token: "tenant-b-token-gate" },
		key: "POST /requests/:id/delivery/step-up/complete",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/delivery/step-up/complete`,
	},
	{
		headers: {
			...tenantAHeaders,
			"x-delivery-token": "tenant-b-token-gate",
		},
		key: "GET /requests/:id/artifacts/:artifactId/download",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/artifacts/${TENANT_B_ARTIFACT_ID}/download`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/delivery/logs",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/delivery/logs`,
	},
	{
		headers: tenantAHeaders,
		json: { manifest: { artifacts: [] } },
		key: "POST /requests/:id/fulfilment/callback",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/fulfilment/callback`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/manifest",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/manifest`,
	},
	{
		headers: tenantAHeaders,
		json: { action: "approved" },
		key: "POST /requests/:id/manifest/validate",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/manifest/validate`,
	},
	{
		body: new Uint8Array([4, 5, 6]),
		headers: {
			...tenantAHeaders,
			"content-type": "application/octet-stream",
			"x-artifact-filename": "artifact.txt",
		},
		key: "POST /requests/:id/manifest/artifact/upload",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/manifest/artifact/upload`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/manifest/artifact/download",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/manifest/artifact/download?artifactId=${TENANT_B_ARTIFACT_ID}`,
	},
	{
		body: new Uint8Array([7, 8, 9]),
		headers: {
			...tenantAHeaders,
			"content-type": "application/octet-stream",
			"x-artifact-filename": "replacement.txt",
		},
		key: "PUT /requests/:id/manifest/artifact/:artifactId/replace",
		method: "PUT",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/manifest/artifact/${TENANT_B_ARTIFACT_ID}/replace`,
	},
	{
		headers: tenantAHeaders,
		json: { message: "I appeal" },
		key: "POST /requests/:id/appeals",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/appeals`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/appeals",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/appeals`,
	},
	{
		headers: tenantAHeaders,
		json: { decision: "approve", explanation: "test" },
		key: "POST /requests/:id/appeals/:appealId/decide",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/appeals/${OVERLAP_APPEAL_ID}/decide`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/notifications",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/notifications`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/notifications/:eventId/replay",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/notifications/${TENANT_B_EVENT_ID}/replay`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /tenants/:tenantId/retention",
		method: "GET",
		path: `/tenants/${TENANT_B}/retention`,
	},
	{
		headers: tenantAHeaders,
		json: {
			class: "request_record",
			id: "retention-overlap",
			maxDays: 365,
			minDays: 30,
		},
		key: "PUT /tenants/:tenantId/retention",
		method: "PUT",
		path: `/tenants/${TENANT_B}/retention`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /requests/:id/audit/export",
		method: "GET",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/audit/export?format=jsonl`,
	},
	{
		headers: tenantAHeaders,
		key: "POST /requests/:id/audit/verify",
		method: "POST",
		path: `/requests/${TENANT_B_ONLY_REQUEST_ID}/audit/verify`,
	},
	{
		headers: tenantAHeaders,
		key: "GET /subjects/:subjectId",
		method: "GET",
		path: "/subjects/subject-b",
	},
	{
		headers: tenantAHeaders,
		key: "GET /policies",
		method: "GET",
		path: "/policies",
	},
	{
		headers: tenantAHeaders,
		json: {
			fromVersion: "1.0.0",
			tenantId: TENANT_B,
			toVersion: "1.0.1",
		},
		key: "POST /policies/upgrades/propose",
		method: "POST",
		path: "/policies/upgrades/propose",
	},
	{
		headers: tenantAHeaders,
		json: {
			jurisdiction: "uk",
			metadata: {
				changelog: "test",
				compatibilityNotes: "test",
				releaseType: "patch",
			},
			name: "tenant-isolation-test-pack",
			pack: ukDefaultPack.pack,
			version: "9.9.9",
		},
		key: "POST /policies/custom/register",
		method: "POST",
		path: "/policies/custom/register",
	},
	{
		headers: tenantAHeaders,
		json: {
			jurisdiction: "uk",
			tenantId: TENANT_B,
			version: "1.0.0",
		},
		key: "POST /policies/custom/activate",
		method: "POST",
		path: "/policies/custom/activate",
	},
	{
		headers: tenantAHeaders,
		json: {
			tenantId: TENANT_B,
		},
		key: "POST /policies/custom/deactivate",
		method: "POST",
		path: "/policies/custom/deactivate",
	},
	{
		headers: tenantAHeaders,
		key: "POST /policies/upgrades/:proposalId/approve",
		method: "POST",
		path: "/policies/upgrades/proposal-tenant-b/approve",
	},
	{
		headers: tenantAHeaders,
		key: "POST /policies/upgrades/:proposalId/apply",
		method: "POST",
		path: "/policies/upgrades/proposal-tenant-b/apply",
	},
	{
		key: "GET /status",
		method: "GET",
		path: "/status",
	},
];

const assertNoTenantBMarker = async (
	label: string,
	response: Response
): Promise<string> => {
	const text = await response.text();
	expect(
		response.status,
		`${label} returned ${response.status}: ${text}`
	).toBeLessThan(500);
	expect({
		label,
		status: response.status,
		text,
	}).not.toEqual(
		expect.objectContaining({
			text: expect.stringContaining(TENANT_B_SECRET),
		})
	);
	return text;
};

const expectedRouteKeys = (): readonly string[] =>
	coreRoutes.map((route) => routeKey(route.method, route.path));

describe("api e2e tenant isolation", () => {
	it(
		"exercises every backend route without leaking sibling tenant data",
		async () => {
			const persistence = makeTenantScopedMemoryPersistence();
			const storage = makeMemoryStorage();
			await seedTenant(persistence, storage, TENANT_A, {
				artifactId: OVERLAP_ARTIFACT_ID,
				eventId: OVERLAP_EVENT_ID,
				marker: TENANT_A_SECRET,
				requestId: OVERLAP_REQUEST_ID,
				subjectId: "subject-a",
				token: "tenant-a-token-gate",
			});
			await seedTenant(persistence, storage, TENANT_B, {
				artifactId: OVERLAP_ARTIFACT_ID,
				eventId: OVERLAP_EVENT_ID,
				marker: TENANT_B_SECRET,
				requestId: OVERLAP_REQUEST_ID,
				subjectId: "subject-overlap",
				token: "tenant-b-overlap-token-gate",
			});
			await seedTenant(persistence, storage, TENANT_B, {
				artifactId: TENANT_B_ARTIFACT_ID,
				eventId: TENANT_B_EVENT_ID,
				marker: TENANT_B_SECRET,
				requestId: TENANT_B_ONLY_REQUEST_ID,
				subjectId: "subject-b",
				token: "tenant-b-token-gate",
			});

			const server = await startApiE2eServer({
				adapters: {
					inbound: [
						makeInboundAdapter("resend", {
							content: { text: "inbound resend request" },
							from: "Inbound Resend",
							fromEmail: "resend-subject@example.test",
							intent: { isDsar: true },
							route: { jurisdiction: "uk", tenantId: TENANT_B },
							subject: "DSAR request",
							to: ["privacy@example.test"],
						}),
						makeInboundAdapter("slack", {
							intakeSourceChannel: "slack:message",
							intent: { isDsar: true },
							kind: "request_capture",
							requestor: {
								email: "slack-subject@example.test",
								name: "Slack Subject",
							},
							route: { jurisdiction: "uk", tenantId: TENANT_B },
							surface: "message",
							text: "inbound slack request",
						}),
					],
					notifications: "stub",
					storage,
				},
				config: {
					auth: authConfig,
					notificationWebhook: {
						endpointId: "default",
						retryDelayMs: 1,
						retryMaxAttempts: 1,
						signingSecret: "tenant-a-webhook-secret",
						timeoutMs: 1000,
						url: "https://tenant-a.example.test/webhook",
					},
				},
				persistence,
			});

			try {
				const probes = makeRouteProbes();
				const exercised = new Set(probes.map((probe) => probe.key));
				const missingRoutes = expectedRouteKeys().filter(
					(key) => !exercised.has(key)
				);
				expect(missingRoutes).toStrictEqual([]);

				for (const probe of probes) {
					const response = await server.request({
						body: probe.body,
						headers: probe.headers,
						json: probe.json,
						method: probe.method,
						path: probe.path,
					});
					await assertNoTenantBMarker(probe.key, response);
				}

				const tenantAList = await server.request({
					headers: tenantAHeaders,
					method: "GET",
					path: "/requests?limit=500",
				});
				const tenantAListText = await assertNoTenantBMarker(
					"tenant A list after probes",
					tenantAList
				);
				expect(tenantAListText).toContain(TENANT_A_SECRET);

				const tenantBList = await server.request({
					headers: tenantBHeaders,
					method: "GET",
					path: "/requests?limit=500",
				});
				const tenantBListText = await tenantBList.text();
				expect(tenantBListText).toContain(TENANT_B_SECRET);
			} finally {
				await server.close();
			}
		},
		E2E_TEST_TIMEOUT_MS
	);

	it("resolves overlapping ids to the authenticated tenant only", async () => {
		const persistence = makeTenantScopedMemoryPersistence();
		const storage = makeMemoryStorage();
		await seedTenant(persistence, storage, TENANT_A, {
			artifactId: OVERLAP_ARTIFACT_ID,
			eventId: OVERLAP_EVENT_ID,
			marker: TENANT_A_SECRET,
			requestId: OVERLAP_REQUEST_ID,
			subjectId: "subject-overlap",
			token: "tenant-a-token-gate",
		});
		await seedTenant(persistence, storage, TENANT_B, {
			artifactId: OVERLAP_ARTIFACT_ID,
			eventId: OVERLAP_EVENT_ID,
			marker: TENANT_B_SECRET,
			requestId: OVERLAP_REQUEST_ID,
			subjectId: "subject-overlap",
			token: "tenant-b-token-gate",
		});

		const server = await startApiE2eServer({
			adapters: {
				inbound: "stub",
				notifications: "stub",
				storage,
			},
			config: {
				auth: authConfig,
			},
			persistence,
		});

		try {
			const detail = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: `/requests/${OVERLAP_REQUEST_ID}`,
			});
			const detailText = await assertNoTenantBMarker(
				"overlapping request detail",
				detail
			);
			expect(detail.status).toBe(200);
			expect(detailText).toContain(TENANT_A_SECRET);

			const manifestDownload = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: `/requests/${OVERLAP_REQUEST_ID}/manifest/artifact/download?artifactId=${OVERLAP_ARTIFACT_ID}`,
			});
			const manifestDownloadText = await assertNoTenantBMarker(
				"overlapping manifest artifact download",
				manifestDownload
			);
			expect(manifestDownload.status).toBe(200);
			expect(manifestDownloadText).toContain(TENANT_A_SECRET);

			const notificationReplay = await server.request({
				headers: tenantAHeaders,
				method: "POST",
				path: `/requests/${OVERLAP_REQUEST_ID}/notifications/${OVERLAP_EVENT_ID}/replay`,
			});
			await assertNoTenantBMarker(
				"overlapping notification replay",
				notificationReplay
			);
			expect(notificationReplay.status).toBe(202);

			const subjectLookup = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: "/subjects/subject-overlap",
			});
			const subjectLookupText = await assertNoTenantBMarker(
				"overlapping subject lookup",
				subjectLookup
			);
			expect(subjectLookup.status).toBe(200);
			expect(subjectLookupText).toContain(OVERLAP_REQUEST_ID);
		} finally {
			await server.close();
		}
	});

	it("keeps legacy manifest artifact keys readable during rollout", async () => {
		const persistence = makeTenantScopedMemoryPersistence();
		const storage = makeMemoryStorage();
		const requestId = "req-legacy-manifest";
		const artifactId = "artifact-legacy-manifest";
		const marker = "tenant-a-legacy-marker";
		const replacementMarker = "tenant-a-legacy-replacement";
		await seedTenant(persistence, storage, TENANT_A, {
			artifactId,
			eventId: "event-legacy-manifest",
			legacyStorageKey: true,
			marker,
			requestId,
			subjectId: "subject-legacy",
			token: "tenant-a-legacy-token-gate",
		});

		const server = await startApiE2eServer({
			adapters: {
				inbound: "stub",
				notifications: "stub",
				storage,
			},
			config: {
				auth: authConfig,
			},
			persistence,
		});

		try {
			const initialDownload = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: `/requests/${requestId}/manifest/artifact/download?artifactId=${artifactId}`,
			});
			const initialDownloadText = await assertNoTenantBMarker(
				"legacy manifest artifact download",
				initialDownload
			);
			expect(initialDownload.status).toBe(200);
			expect(initialDownloadText).toContain(marker);

			const replacement = await server.request({
				body: new TextEncoder().encode(replacementMarker),
				headers: {
					...tenantAHeaders,
					"content-type": "text/plain",
					"x-artifact-filename": "legacy.txt",
				},
				method: "PUT",
				path: `/requests/${requestId}/manifest/artifact/${artifactId}/replace`,
			});
			await assertNoTenantBMarker(
				"legacy manifest artifact replace",
				replacement
			);
			expect(replacement.status).toBe(202);

			const replacedDownload = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: `/requests/${requestId}/manifest/artifact/download?artifactId=${artifactId}`,
			});
			const replacedDownloadText = await assertNoTenantBMarker(
				"legacy manifest artifact download after replace",
				replacedDownload
			);
			expect(replacedDownload.status).toBe(200);
			expect(replacedDownloadText).toContain(replacementMarker);
		} finally {
			await server.close();
		}
	});

	it("persists generated manifest keys when replacing artifacts without one", async () => {
		const persistence = makeTenantScopedMemoryPersistence();
		const storage = makeMemoryStorage();
		const requestId = "req-missing-manifest-key";
		const artifactId = "artifact-missing-manifest-key";
		const replacementMarker = "tenant-a-generated-key-replacement";
		await seedTenant(persistence, storage, TENANT_A, {
			artifactId,
			emptyStorageKey: true,
			eventId: "event-missing-manifest-key",
			marker: "tenant-a-missing-key-marker",
			requestId,
			subjectId: "subject-missing-key",
			token: "tenant-a-missing-key-token-gate",
		});

		const server = await startApiE2eServer({
			adapters: {
				inbound: "stub",
				notifications: "stub",
				storage,
			},
			config: {
				auth: authConfig,
			},
			persistence,
		});

		try {
			const replacement = await server.request({
				body: new TextEncoder().encode(replacementMarker),
				headers: {
					...tenantAHeaders,
					"content-type": "text/plain",
					"x-artifact-filename": "generated.txt",
				},
				method: "PUT",
				path: `/requests/${requestId}/manifest/artifact/${artifactId}/replace`,
			});
			const replacementText = await assertNoTenantBMarker(
				"missing storage key manifest artifact replace",
				replacement
			);
			expect(replacement.status).toBe(202);
			expect(replacementText).toContain(
				`tenants/${TENANT_A}/requests/${requestId}/manifest/${artifactId}/generated.txt`
			);

			const download = await server.request({
				headers: tenantAHeaders,
				method: "GET",
				path: `/requests/${requestId}/manifest/artifact/download?artifactId=${artifactId}`,
			});
			const downloadText = await assertNoTenantBMarker(
				"generated manifest artifact key download",
				download
			);
			expect(download.status).toBe(200);
			expect(downloadText).toContain(replacementMarker);
		} finally {
			await server.close();
		}
	});
});

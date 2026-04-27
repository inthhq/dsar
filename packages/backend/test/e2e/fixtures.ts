import type {
	AuditEventRecord,
	ChatStateRecord,
	ClockSegmentRecord,
	CreateAuditEventInput,
	CreateClockSegmentInput,
	CreateFulfillmentArtifactInput,
	CreateNotificationDeliveryAttemptInput,
	CreateNotificationEventInput,
	CreateRequestInput,
	CreateRequestTimelineEventInput,
	CreateVerificationEvidenceInput,
	FulfillmentArtifactRecord,
	JsonValue,
	NotificationDeliveryAttemptRecord,
	NotificationEventRecord,
	PersistenceService,
	RequestRecord,
	RequestTimelineEventRecord,
	UpdateFulfillmentArtifactInput,
	UpdateRequestInput,
	UpsertRetentionPolicyInput,
	RetentionPolicyRecord,
	VerificationEvidenceRecord,
	WebhookEndpointRecord,
	WebhookSigningKeyRecord,
} from "@dsar/persistence";
import * as Effect from "effect/Effect";

const isExpired = (expiresAt: string | undefined, nowMs: number): boolean =>
	expiresAt !== undefined && Date.parse(expiresAt) <= nowMs;

export const BASE_JSON_BODY = {
	challengeId: "challenge-1",
	channel: "email",
	class: "general",
	decision: "approve",
	id: "retention-general",
	intakeSource: {
		channel: "api",
		receivedAt: "2026-02-20T00:00:00.000Z",
		type: "api",
	},
	jurisdiction: "uk",
	legalHoldEnabled: false,
	level: "standard",
	manifest: {
		artifacts: [],
	},
	maxDays: 30,
	metadata: {
		jurisdiction: "uk",
		name: "pack",
		version: "1.0.0",
	},
	method: "document",
	minDays: 1,
	pack: {
		rules: [],
	},
	purgeEnabled: true,
	response: "123456",
	tenantId: "tenant-default",
	updatedAt: "2026-02-20T00:00:00.000Z",
} as const;

export const DEFAULT_IDS = {
	appealId: "appeal-1",
	artifactId: "artifact-1",
	id: "req-1",
	proposalId: "proposal-1",
	subjectId: "subject-1",
	tenantId: "tenant-default",
} as const;

export const makeMemoryPersistence = (): PersistenceService => {
	const requests = new Map<string, RequestRecord>();
	const timeline: RequestTimelineEventRecord[] = [];
	const notificationEvents: NotificationEventRecord[] = [];
	const notificationAttempts: NotificationDeliveryAttemptRecord[] = [];
	const clockSegments: ClockSegmentRecord[] = [];
	const auditEvents: AuditEventRecord[] = [];
	const webhookEndpoints = new Map<string, WebhookEndpointRecord>();
	const webhookSigningKeys: WebhookSigningKeyRecord[] = [];
	const chatState = new Map<string, ChatStateRecord>();
	const chatSubscriptions = new Set<string>();
	const chatLocks = new Map<
		string,
		{
			readonly acquiredAt: string;
			readonly expiresAt: string;
			readonly token: string;
		}
	>();
	return {
		auditEvents: {
			append: (input: CreateAuditEventInput) => {
				const record: AuditEventRecord = {
					...input,
					after: input.after as JsonValue,
					before: input.before as JsonValue,
					reason: input.reason as JsonValue,
					tenantId: "tenant-default",
				};
				auditEvents.push(record);
				return Effect.succeed(record);
			},
			listByRequestId: (requestId: string) =>
				Effect.succeed(
					auditEvents
						.filter((event) => event.requestId === requestId)
						.toSorted((left, right) => left.sequence - right.sequence)
				),
		},
		chatRuntimeState: {
			acquireLock: (input) => {
				const nowMs = Date.now();
				const current = chatLocks.get(input.threadId);
				if (current && !isExpired(current.expiresAt, nowMs)) {
					return Effect.succeed(null);
				}
				if (current) {
					chatLocks.delete(input.threadId);
				}
				const record = {
					...input,
					tenantId: "tenant-default",
				};
				chatLocks.set(input.threadId, {
					acquiredAt: input.acquiredAt,
					expiresAt: input.expiresAt,
					token: input.token,
				});
				return Effect.succeed(record);
			},
			delete: (key: string) => {
				chatState.delete(key);
				return Effect.void;
			},
			extendLock: (input) => {
				const nowMs = Date.now();
				const current = chatLocks.get(input.threadId);
				if (
					!current ||
					current.token !== input.token ||
					isExpired(current.expiresAt, nowMs)
				) {
					if (current && isExpired(current.expiresAt, nowMs)) {
						chatLocks.delete(input.threadId);
					}
					return Effect.succeed(false);
				}
				chatLocks.set(input.threadId, {
					...current,
					expiresAt: input.expiresAt,
				});
				return Effect.succeed(true);
			},
			get: (key: string) =>
				Effect.succeed(
					(() => {
						const record = chatState.get(key) ?? null;
						if (!record) {
							return null;
						}
						if (isExpired(record.expiresAt, Date.now())) {
							chatState.delete(key);
							return null;
						}
						return record;
					})()
				),
			isSubscribed: (threadId: string) =>
				Effect.succeed(chatSubscriptions.has(threadId)),
			releaseLock: (input) => {
				const current = chatLocks.get(input.threadId);
				if (current?.token === input.token) {
					chatLocks.delete(input.threadId);
				}
				return Effect.void;
			},
			set: (input) => {
				const current = chatState.get(input.key);
				const record: ChatStateRecord = {
					createdAt: current?.createdAt ?? input.createdAt,
					expiresAt: input.expiresAt,
					key: input.key,
					tenantId: "tenant-default",
					updatedAt: input.updatedAt,
					value: input.value,
				};
				chatState.set(input.key, record);
				return Effect.succeed(record);
			},
			setIfNotExists: (input) => {
				const current = chatState.get(input.key);
				if (current && !isExpired(current.expiresAt, Date.now())) {
					return Effect.succeed(false);
				}
				if (current) {
					chatState.delete(input.key);
				}
				chatState.set(input.key, {
					createdAt: input.createdAt,
					expiresAt: input.expiresAt,
					key: input.key,
					tenantId: "tenant-default",
					updatedAt: input.updatedAt,
					value: input.value,
				});
				return Effect.succeed(true);
			},
			subscribe: (input) => {
				chatSubscriptions.add(input.threadId);
				return Effect.succeed({
					...input,
					tenantId: "tenant-default",
				});
			},
			unsubscribe: (threadId: string) => {
				chatSubscriptions.delete(threadId);
				return Effect.void;
			},
		},
		clockSegments: {
			append: (input: CreateClockSegmentInput) => {
				const record: ClockSegmentRecord = {
					...input,
					tenantId: "tenant-default",
				};
				clockSegments.push(record);
				return Effect.succeed(record);
			},
			listByRequestId: (requestId: string) =>
				Effect.succeed(
					clockSegments
						.filter((segment) => segment.requestId === requestId)
						.toSorted((left, right) =>
							left.from === right.from
								? left.id.localeCompare(right.id)
								: left.from.localeCompare(right.from)
						)
				),
		},
		fulfillmentArtifacts: (() => {
			const artifacts = new Map<string, FulfillmentArtifactRecord>();
			return {
				create: (input: CreateFulfillmentArtifactInput) => {
					const record: FulfillmentArtifactRecord = {
						...input,
						artifactManifest: input.artifactManifest as JsonValue,
						deliveryLogs: input.deliveryLogs as JsonValue,
						deliveryPrepare: input.deliveryPrepare as JsonValue,
						tenantId: "tenant-default",
						tokenGate: input.tokenGate as JsonValue,
					};
					artifacts.set(record.id, record);
					return Effect.succeed(record);
				},
				listByRequestId: (requestId: string) =>
					Effect.succeed(
						[...artifacts.values()]
							.filter((a) => a.requestId === requestId)
							.toSorted((left, right) =>
								right.createdAt.localeCompare(left.createdAt)
							)
					),
				update: (id: string, input: UpdateFulfillmentArtifactInput) => {
					const current = artifacts.get(id);
					if (!current) {
						return Effect.fail(new Error(`Missing fulfillment artifact ${id}`));
					}
					const updated: FulfillmentArtifactRecord = {
						...current,
						artifactManifest: (input.artifactManifest ??
							current.artifactManifest) as JsonValue,
						deliveryLogs: (input.deliveryLogs ??
							current.deliveryLogs) as JsonValue,
						deliveryPrepare: (input.deliveryPrepare ??
							current.deliveryPrepare) as JsonValue,
						tokenGate: (input.tokenGate ?? current.tokenGate) as JsonValue,
						updatedAt: input.updatedAt,
						validationState: input.validationState ?? current.validationState,
					};
					artifacts.set(id, updated);
					return Effect.succeed(updated);
				},
			};
		})(),
		notificationDeliveryAttempts: {
			append: (input: CreateNotificationDeliveryAttemptInput) => {
				const record: NotificationDeliveryAttemptRecord = {
					...input,
					tenantId: "tenant-default",
				};
				notificationAttempts.push(record);
				return Effect.succeed(record);
			},
			listByNotificationEventId: (notificationEventId: string) =>
				Effect.succeed(
					notificationAttempts.filter(
						(attempt) => attempt.notificationEventId === notificationEventId
					)
				),
		},
		notificationEvents: {
			append: (input: CreateNotificationEventInput) => {
				const record: NotificationEventRecord = {
					...input,
					payload: input.payload as JsonValue,
					tenantId: "tenant-default",
				};
				notificationEvents.push(record);
				return Effect.succeed(record);
			},
			getById: (id: string) =>
				Effect.fromNullishOr(
					notificationEvents.find((event) => event.id === id)
				).pipe(
					Effect.mapError(() => new Error(`Missing notification event ${id}`))
				),
			listByRequestId: (requestId: string) =>
				Effect.succeed(
					notificationEvents
						.filter((event) => event.requestId === requestId)
						.toSorted((left, right) =>
							left.createdAt === right.createdAt
								? left.id.localeCompare(right.id)
								: left.createdAt.localeCompare(right.createdAt)
						)
				),
		},
		policyAssignments: {
			assign: () =>
				Effect.fail(
					new Error(
						"Not implemented in memory test persistence: policyAssignments.assign"
					)
				),
			listByRequestId: () => Effect.succeed([]),
		},
		requests: {
			create: (input: CreateRequestInput) => {
				const record: RequestRecord = {
					...input,
					createdAt: input.receivedAt,
					tenantId: "tenant-default",
					updatedAt: input.receivedAt,
				};
				requests.set(record.id, record);
				return Effect.succeed(record);
			},
			getById: (id: string) =>
				Effect.fromNullishOr(requests.get(id)).pipe(
					Effect.mapError(() => new Error(`Missing request ${id}`))
				),
			list: () => Effect.succeed([...requests.values()]),
			remove: (id: string) =>
				Effect.sync(() => {
					requests.delete(id);
				}),
			update: (id: string, input: UpdateRequestInput) => {
				const current = requests.get(id);
				if (!current) {
					return Effect.fail(new Error(`Missing request ${id}`));
				}
				const updated: RequestRecord = {
					...current,
					appeals: input.appeals ?? current.appeals,
					authority: input.authority ?? current.authority,
					capture: input.capture ?? current.capture,
					clockMode: input.clockMode ?? current.clockMode,
					dueAt: input.dueAt ?? current.dueAt,
					requestor: input.requestor ?? current.requestor,
					status: input.status ?? current.status,
					updatedAt: input.updatedAt,
				};
				requests.set(id, updated);
				return Effect.succeed(updated);
			},
		},
		retentionPolicies: (() => {
			const policies = new Map<string, RetentionPolicyRecord>();
			return {
				list: () =>
					Effect.succeed(
						[...policies.values()].filter(
							(p) => p.tenantId === "tenant-default"
						)
					),
				upsert: (input: UpsertRetentionPolicyInput) => {
					const record = { ...input, tenantId: "tenant-default" };
					policies.set(record.id, record);
					return Effect.succeed(record);
				},
			};
		})(),
		timeline: {
			append: (input: CreateRequestTimelineEventInput) => {
				const record: RequestTimelineEventRecord = {
					...input,
					tenantId: "tenant-default",
				};
				timeline.push(record);
				return Effect.succeed(record);
			},
			listByRequestId: (requestId: string) =>
				Effect.succeed(
					timeline
						.filter((event) => event.requestId === requestId)
						.toSorted((left, right) =>
							left.createdAt === right.createdAt
								? left.id.localeCompare(right.id)
								: left.createdAt.localeCompare(right.createdAt)
						)
				),
		},
		verificationEvidence: (() => {
			const evidence: VerificationEvidenceRecord[] = [];
			return {
				create: (input: CreateVerificationEvidenceInput) => {
					const record = { ...input, tenantId: "tenant-default" };
					evidence.push(record);
					return Effect.succeed(record);
				},
				listByRequestId: (requestId: string) =>
					Effect.succeed(evidence.filter((e) => e.requestId === requestId)),
			};
		})(),
		webhookEndpoints: {
			ensureConfigured: (input) => {
				const current = webhookEndpoints.get(input.id);
				const endpoint: WebhookEndpointRecord = {
					createdAt: current?.createdAt ?? input.createdAt,
					id: input.id,
					tenantId: "tenant-default",
					updatedAt: input.createdAt,
					url: input.url,
				};
				webhookEndpoints.set(input.id, endpoint);
				let primaryKey = webhookSigningKeys.find(
					(key) => key.endpointId === input.id && key.role === "primary"
				);
				if (!primaryKey) {
					primaryKey = {
						createdAt: input.createdAt,
						endpointId: input.id,
						id: input.keyId ?? `${input.id}:primary`,
						role: "primary",
						secret: input.signingSecret,
						tenantId: "tenant-default",
					};
					webhookSigningKeys.push(primaryKey);
				}
				return Effect.succeed({ endpoint, primaryKey });
			},
			getById: (id) =>
				Effect.fromNullishOr(webhookEndpoints.get(id)).pipe(
					Effect.mapError(() => new Error(`Missing webhook endpoint ${id}`))
				),
			listActiveKeys: (endpointId, now) =>
				Effect.succeed(
					webhookSigningKeys
						.filter(
							(key) =>
								key.endpointId === endpointId &&
								(key.role === "primary" ||
									key.expiresAt === undefined ||
									key.expiresAt > now)
						)
						.toSorted((left, right) => {
							if (left.role === right.role) {
								return right.createdAt.localeCompare(left.createdAt);
							}
							return left.role === "primary" ? -1 : 1;
						})
				),
			rotateSigningKey: (input) => {
				const endpoint = webhookEndpoints.get(input.endpointId);
				if (!endpoint) {
					return Effect.fail(
						new Error(`Missing webhook endpoint ${input.endpointId}`)
					);
				}
				const previousIndex = webhookSigningKeys.findIndex(
					(key) => key.endpointId === input.endpointId && key.role === "primary"
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
					tenantId: "tenant-default",
				};
				webhookSigningKeys.push(newPrimary);
				return Effect.succeed({
					activeKeys: webhookSigningKeys
						.filter(
							(key) =>
								key.endpointId === input.endpointId &&
								(key.role === "primary" ||
									key.expiresAt === undefined ||
									key.expiresAt > input.rotatedAt)
						)
						.toSorted((left, right) => {
							if (left.role === right.role) {
								return right.createdAt.localeCompare(left.createdAt);
							}
							return left.role === "primary" ? -1 : 1;
						}),
					endpoint,
					newPrimary,
					previousPrimary,
				});
			},
		},
	};
};

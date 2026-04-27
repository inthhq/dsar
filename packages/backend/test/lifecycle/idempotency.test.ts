import type {
	CreateAuditEventInput,
	CreateClockSegmentInput,
	CreateRequestInput,
	CreateRequestTimelineEventInput,
	CreateVerificationEvidenceInput,
	PersistenceService,
	RequestRecord,
	RequestTimelineEventRecord,
	UpdateRequestInput,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { dsarInstance } from "../../src";
import { TEST_MEMBER_HEADERS, TEST_RUNTIME_AUTH } from "../auth";

const actorHeaders = TEST_MEMBER_HEADERS;

const makeMemoryPersistence = (): PersistenceService => {
	const requests = new Map<string, RequestRecord>();
	const timeline: RequestTimelineEventRecord[] = [];
	const notificationEvents: {
		readonly id: string;
		readonly tenantId: string;
		readonly requestId: string;
		readonly eventType: string;
		readonly payload: unknown;
		readonly correlationId: string;
		readonly idempotencyKey: string;
		readonly policyVersion: string;
		readonly locale: string;
		readonly createdAt: string;
	}[] = [];
	const notificationAttempts: {
		readonly id: string;
		readonly tenantId: string;
		readonly notificationEventId: string;
		readonly requestId: string;
		readonly channel: string;
		readonly destination: string;
		readonly attempt: number;
		readonly status: "pending" | "delivered" | "failed" | "skipped";
		readonly responseCode?: number;
		readonly error?: string;
		readonly createdAt: string;
	}[] = [];
	const clockSegments: {
		readonly id: string;
		readonly tenantId: string;
		readonly requestId: string;
		readonly from: string;
		readonly to: string;
		readonly reason: string;
		readonly countsTowardDeadline: boolean;
		readonly policyVersion: string;
		readonly actor: string;
	}[] = [];
	const auditEvents: {
		readonly id: string;
		readonly tenantId: string;
		readonly requestId?: string;
		readonly actor: string;
		readonly action: string;
		readonly object: string;
		readonly before: unknown;
		readonly after: unknown;
		readonly reason: unknown;
		readonly prevHash?: string;
		readonly hash: string;
		readonly hashAlg: string;
		readonly sequence: number;
		readonly createdAt: string;
	}[] = [];
	const chatState = new Map<string, unknown>();
	const webhookEndpoints = new Map<string, Record<string, unknown>>();
	const webhookSigningKeys: Record<string, unknown>[] = [];
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
				const record = { ...input, tenantId: "tenant-default" };
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
				if (chatLocks.has(input.threadId)) {
					return Effect.succeed(null);
				}
				const record = { ...input, tenantId: "tenant-default" };
				chatLocks.set(input.threadId, {
					acquiredAt: input.acquiredAt,
					expiresAt: input.expiresAt,
					token: input.token,
				});
				return Effect.succeed(record);
			},
			delete: (key) => {
				chatState.delete(key);
				return Effect.void;
			},
			extendLock: (input) => {
				const current = chatLocks.get(input.threadId);
				if (!current || current.token !== input.token) {
					return Effect.succeed(false);
				}
				chatLocks.set(input.threadId, {
					...current,
					expiresAt: input.expiresAt,
				});
				return Effect.succeed(true);
			},
			get: (key) =>
				Effect.succeed(
					chatState.has(key)
						? {
								createdAt: "2026-01-01T00:00:00.000Z",
								key,
								tenantId: "tenant-default",
								updatedAt: "2026-01-01T00:00:00.000Z",
								value: chatState.get(key) as never,
							}
						: null
				),
			isSubscribed: (threadId) =>
				Effect.succeed(chatSubscriptions.has(threadId)),
			releaseLock: (input) => {
				const current = chatLocks.get(input.threadId);
				if (current?.token === input.token) {
					chatLocks.delete(input.threadId);
				}
				return Effect.void;
			},
			set: (input) => {
				chatState.set(input.key, input.value);
				return Effect.succeed({ ...input, tenantId: "tenant-default" });
			},
			setIfNotExists: (input) => {
				if (chatState.has(input.key)) {
					return Effect.succeed(false);
				}
				chatState.set(input.key, input.value);
				return Effect.succeed(true);
			},
			subscribe: (input) => {
				chatSubscriptions.add(input.threadId);
				return Effect.succeed({ ...input, tenantId: "tenant-default" });
			},
			unsubscribe: (threadId) => {
				chatSubscriptions.delete(threadId);
				return Effect.void;
			},
		},
		clockSegments: {
			append: (input: CreateClockSegmentInput) => {
				const record = { ...input, tenantId: "tenant-default" };
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
		fulfillmentArtifacts: {
			create: () =>
				Effect.fail(
					new Error(
						"Not implemented in memory test persistence: fulfillment.create"
					)
				),
			listByRequestId: () => Effect.succeed([]),
		},
		notificationDeliveryAttempts: {
			append: (input) => {
				const record = { ...input, tenantId: "tenant-default" };
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
			append: (input) => {
				const record = { ...input, tenantId: "tenant-default" };
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
		retentionPolicies: {
			list: () => Effect.succeed([]),
			upsert: () =>
				Effect.fail(
					new Error(
						"Not implemented in memory test persistence: retention.upsert"
					)
				),
		},
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
		verificationEvidence: {
			create: (_input: CreateVerificationEvidenceInput) =>
				Effect.fail(
					new Error(
						"Not implemented in memory test persistence: verificationEvidence.create"
					)
				),
			listByRequestId: () => Effect.succeed([]),
		},
		webhookEndpoints: {
			ensureConfigured: (input) => {
				const endpoint = {
					createdAt: input.createdAt,
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
				return Effect.succeed({ endpoint, primaryKey } as never);
			},
			getById: (id) =>
				Effect.fromNullishOr(webhookEndpoints.get(id)).pipe(
					Effect.mapError(() => new Error(`Missing webhook endpoint ${id}`))
				) as never,
			listActiveKeys: (endpointId, now) =>
				Effect.succeed(
					webhookSigningKeys
						.filter(
							(key) =>
								key.endpointId === endpointId &&
								(key.role === "primary" ||
									typeof key.expiresAt !== "string" ||
									key.expiresAt > now)
						)
						.toSorted((left, right) => {
							if (left.role === right.role) {
								return String(right.createdAt).localeCompare(
									String(left.createdAt)
								);
							}
							return left.role === "primary" ? -1 : 1;
						})
				) as never,
			rotateSigningKey: (input) => {
				const endpoint = webhookEndpoints.get(input.endpointId);
				if (!endpoint) {
					return Effect.fail(
						new Error(`Missing webhook endpoint ${input.endpointId}`)
					) as never;
				}
				const previousPrimary = webhookSigningKeys.find(
					(key) => key.endpointId === input.endpointId && key.role === "primary"
				);
				if (previousPrimary) {
					previousPrimary.role = "secondary";
					previousPrimary.expiresAt = input.graceExpiresAt;
				}
				const newPrimary = {
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
									typeof key.expiresAt !== "string" ||
									key.expiresAt > input.rotatedAt)
						)
						.toSorted((left, right) => {
							if (left.role === right.role) {
								return String(right.createdAt).localeCompare(
									String(left.createdAt)
								);
							}
							return left.role === "primary" ? -1 : 1;
						}),
					endpoint,
					newPrimary,
					previousPrimary,
				} as never);
			},
		},
	};
};

const makeRuntime = () =>
	dsarInstance({
		...TEST_RUNTIME_AUTH,
		repos: {
			persistence: makeMemoryPersistence(),
		},
	});

describe("request lifecycle idempotency", () => {
	it("applies extension only once for the same idempotency key", async () => {
		const runtime = await makeRuntime();
		const captureResponse = await runtime.handler(
			new Request("https://example.test/requests/capture", {
				body: JSON.stringify({
					intakeSource: {
						channel: "api",
						receivedAt: "2026-01-01T00:00:00.000Z",
						type: "api",
					},
					jurisdiction: "us-ca",
				}),
				headers: {
					"content-type": "application/json",
					...actorHeaders,
				},
				method: "POST",
			})
		);
		const requestId = (
			(await captureResponse.json()) as {
				readonly data: { readonly id: string };
			}
		).data.id;

		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/request`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);
		await runtime.handler(
			new Request(
				`https://example.test/requests/${requestId}/verification/approve`,
				{
					headers: actorHeaders,
					method: "POST",
				}
			)
		);

		const extensionPayload = JSON.stringify({
			additionalDays: 5,
			rationale: "complex request",
		});
		const idempotencyHeaders = {
			"content-type": "application/json",
			"x-idempotency-key": "ext-1",
			...actorHeaders,
		};

		const first = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/extensions`, {
				body: extensionPayload,
				headers: idempotencyHeaders,
				method: "POST",
			})
		);
		const second = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/extensions`, {
				body: extensionPayload,
				headers: idempotencyHeaders,
				method: "POST",
			})
		);
		expect(first.status).toBe(202);
		expect(second.status).toBe(202);

		const explainResponse = await runtime.handler(
			new Request(`https://example.test/requests/${requestId}/clock/explain`, {
				headers: actorHeaders,
				method: "GET",
			})
		);
		expect(explainResponse.status).toBe(200);
		const explainBody = (await explainResponse.json()) as {
			readonly data: { readonly finalDueAt: string };
		};
		expect(explainBody.data.finalDueAt).toBe("2026-02-20T00:00:00.000Z");
	});
});

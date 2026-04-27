import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

/**
 * Minimal in-memory persistence surface used by backend tests.
 */
export interface MinimalPersistence {
	/** Chronological audit trail entries emitted during request processing. */
	readonly auditEvents: {
		readonly append: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** Legal-clock time segments used for deadline and pause calculations. */
	readonly clockSegments: {
		readonly append: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** Artifacts (files, manifests) produced during request fulfillment. */
	readonly fulfillmentArtifacts: {
		readonly create: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
		readonly update: (
			id: string,
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>, Error>;
	};
	/** Individual delivery attempts for each notification event. */
	readonly notificationDeliveryAttempts: {
		readonly append: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByNotificationEventId: (
			id: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** Chat runtime state used by integration helpers. */
	readonly chatRuntimeState: {
		readonly acquireLock: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown> | null>;
		readonly delete: (key: string) => Effect.Effect<void>;
		readonly extendLock: (
			input: Record<string, unknown>
		) => Effect.Effect<boolean>;
		readonly get: (
			key: string
		) => Effect.Effect<Record<string, unknown> | null>;
		readonly isSubscribed: (threadId: string) => Effect.Effect<boolean>;
		readonly releaseLock: (
			input: Record<string, unknown>
		) => Effect.Effect<void>;
		readonly set: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly setIfNotExists: (
			input: Record<string, unknown>
		) => Effect.Effect<boolean>;
		readonly subscribe: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly unsubscribe: (threadId: string) => Effect.Effect<void>;
	};
	/** Notification events triggered by lifecycle transitions. */
	readonly notificationEvents: {
		readonly append: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly getById: (
			id: string
		) => Effect.Effect<Record<string, unknown>, Error>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** Outbound webhook endpoints and signing keys. */
	readonly webhookEndpoints: {
		readonly ensureConfigured: (
			input: Record<string, unknown>
		) => Effect.Effect<{
			readonly endpoint: Record<string, unknown>;
			readonly primaryKey: Record<string, unknown>;
		}>;
		readonly getById: (
			id: string
		) => Effect.Effect<Record<string, unknown>, Error>;
		readonly listActiveKeys: (
			endpointId: string,
			now: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
		readonly rotateSigningKey: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>, Error>;
	};
	/** Policy pack versions assigned to individual requests. */
	readonly policyAssignments: {
		readonly assign: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** DSAR request records keyed by ID. */
	readonly requests: {
		readonly create: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly getById: (
			id: string
		) => Effect.Effect<Record<string, unknown>, Error>;
		readonly list: () => Effect.Effect<readonly Record<string, unknown>[]>;
		readonly remove: (id: string) => Effect.Effect<void>;
		readonly update: (
			id: string,
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>, Error>;
	};
	/** Tenant-level data-retention policy configurations. */
	readonly retentionPolicies: {
		readonly list: () => Effect.Effect<readonly Record<string, unknown>[]>;
		readonly upsert: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
	};
	/** Ordered lifecycle events forming the request timeline. */
	readonly timeline: {
		readonly append: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
	/** Identity-verification evidence submitted for requests. */
	readonly verificationEvidence: {
		readonly create: (
			input: Record<string, unknown>
		) => Effect.Effect<Record<string, unknown>>;
		readonly listByRequestId: (
			requestId: string
		) => Effect.Effect<readonly Record<string, unknown>[]>;
	};
}

/**
 * Creates an in-memory persistence implementation for tests. Uses `Ref` for
 * all shared state to ensure atomic updates under concurrent Effect programs.
 *
 * @returns Effect yielding a minimal
 *   persistence facade backed by Ref-wrapped maps and arrays.
 */
export const makeMinimalPersistence = (): Effect.Effect<MinimalPersistence> =>
	Effect.gen(function* gen() {
		const requestsRef = yield* Ref.make(
			new Map<string, Record<string, unknown>>()
		);
		const timelineRef = yield* Ref.make<Record<string, unknown>[]>([]);
		const auditEventsRef = yield* Ref.make<Record<string, unknown>[]>([]);
		const notificationEventsRef = yield* Ref.make<Record<string, unknown>[]>(
			[]
		);
		const notificationAttemptsRef = yield* Ref.make<Record<string, unknown>[]>(
			[]
		);
		const webhookEndpointsRef = yield* Ref.make(
			new Map<string, Record<string, unknown>>()
		);
		const webhookSigningKeysRef = yield* Ref.make<Record<string, unknown>[]>(
			[]
		);
		const chatStateRef = yield* Ref.make(
			new Map<string, Record<string, unknown>>()
		);
		const chatSubscriptionsRef = yield* Ref.make(new Set<string>());
		const chatLocksRef = yield* Ref.make(
			new Map<string, Record<string, unknown>>()
		);
		const clockSegmentsRef = yield* Ref.make<Record<string, unknown>[]>([]);
		const fulfillmentArtifactsRef = yield* Ref.make<Record<string, unknown>[]>(
			[]
		);
		const policyAssignmentsRef = yield* Ref.make<Record<string, unknown>[]>([]);
		const retentionPoliciesRef = yield* Ref.make<Record<string, unknown>[]>([]);
		const verificationEvidenceRecordsRef = yield* Ref.make<
			Record<string, unknown>[]
		>([]);

		return {
			auditEvents: {
				append: (input: Record<string, unknown>) =>
					Effect.gen(function* append() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(auditEventsRef, (arr) => [...arr, record]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(auditEventsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			chatRuntimeState: {
				acquireLock: (input: Record<string, unknown>) =>
					Ref.modify(chatLocksRef, (locks) => {
						const threadId = String(input.threadId ?? "");
						const current = locks.get(threadId);
						const now = Date.now();
						const currentExpiresAt =
							typeof current?.expiresAt === "string"
								? Date.parse(current.expiresAt)
								: Number.NaN;
						if (
							current &&
							Number.isFinite(currentExpiresAt) &&
							currentExpiresAt <= now
						) {
							const next = new Map(locks);
							next.delete(threadId);
							const record = {
								...input,
								tenantId: "tenant-default",
							};
							return [record, next.set(threadId, record)] as const;
						}
						if (current) {
							return [null, locks] as const;
						}
						const record = {
							...input,
							tenantId: "tenant-default",
						};
						return [record, new Map(locks).set(threadId, record)] as const;
					}),
				delete: (key: string) =>
					Ref.update(chatStateRef, (state) => {
						const next = new Map(state);
						next.delete(key);
						return next;
					}),
				extendLock: (input: Record<string, unknown>) =>
					Ref.modify(chatLocksRef, (locks) => {
						const threadId = String(input.threadId ?? "");
						const token = String(input.token ?? "");
						const current = locks.get(threadId);
						const now = Date.now();
						const currentExpiresAt =
							typeof current?.expiresAt === "string"
								? Date.parse(current.expiresAt)
								: Number.NaN;
						if (
							current &&
							Number.isFinite(currentExpiresAt) &&
							currentExpiresAt <= now
						) {
							const next = new Map(locks);
							next.delete(threadId);
							return [false, next] as const;
						}
						if (!current || current.token !== token) {
							return [false, locks] as const;
						}
						return [
							true,
							new Map([...locks, [threadId, { ...current, ...input }]]),
						] as const;
					}),
				get: (key: string) =>
					Ref.get(chatStateRef).pipe(
						Effect.map((state) => state.get(key) ?? null)
					),
				isSubscribed: (threadId: string) =>
					Ref.get(chatSubscriptionsRef).pipe(
						Effect.map((subscriptions) => subscriptions.has(threadId))
					),
				releaseLock: (input: Record<string, unknown>) =>
					Ref.modify(chatLocksRef, (locks) => {
						const threadId = String(input.threadId ?? "");
						const token = String(input.token ?? "");
						const current = locks.get(threadId);
						if (current?.token === token) {
							const next = new Map(locks);
							next.delete(threadId);
							return [undefined, next] as const;
						}
						return [undefined, locks] as const;
					}),
				set: (input: Record<string, unknown>) =>
					Ref.modify(chatStateRef, (state) => {
						const key = String(input.key ?? "");
						const record = { ...input, tenantId: "tenant-default" };
						return [record, new Map([...state, [key, record]])] as const;
					}),
				setIfNotExists: (input: Record<string, unknown>) =>
					Ref.modify(chatStateRef, (state) => {
						const key = String(input.key ?? "");
						if (state.has(key)) {
							return [false, state] as const;
						}
						return [
							true,
							new Map(state).set(key, {
								...input,
								tenantId: "tenant-default",
							}),
						] as const;
					}),
				subscribe: (input: Record<string, unknown>) =>
					Ref.modify(chatSubscriptionsRef, (subscriptions) => {
						const threadId = String(input.threadId ?? "");
						const next = new Set([...subscriptions, threadId]);
						return [{ ...input, tenantId: "tenant-default" }, next] as const;
					}),
				unsubscribe: (threadId: string) =>
					Ref.update(chatSubscriptionsRef, (subscriptions) => {
						const next = new Set(subscriptions);
						next.delete(threadId);
						return next;
					}),
			},
			clockSegments: {
				append: (input: Record<string, unknown>) =>
					Effect.gen(function* append() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(clockSegmentsRef, (arr) => [...arr, record]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(clockSegmentsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			fulfillmentArtifacts: {
				create: (input: Record<string, unknown>) =>
					Effect.gen(function* create() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(fulfillmentArtifactsRef, (arr) => [
							...arr,
							record,
						]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(fulfillmentArtifactsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
				update: (id: string, input: Record<string, unknown>) =>
					Effect.gen(function* update() {
						const arr = yield* Ref.get(fulfillmentArtifactsRef);
						const index = arr.findIndex(
							(e: Record<string, unknown>) => e.id === id
						);
						if (index === -1) {
							return yield* Effect.fail(
								new Error(`Missing fulfillment artifact ${id}`)
							);
						}
						const defined: Record<string, unknown> = {};
						for (const [k, v] of Object.entries(input)) {
							if (v !== undefined) {
								defined[k] = v;
							}
						}
						const updated = { ...arr[index], ...defined };
						const next = [...arr];
						next[index] = updated;
						yield* Ref.set(fulfillmentArtifactsRef, next);
						return updated;
					}),
			},
			notificationDeliveryAttempts: {
				append: (input: Record<string, unknown>) =>
					Effect.gen(function* append() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(notificationAttemptsRef, (arr) => [
							...arr,
							record,
						]);
						return record;
					}),
				listByNotificationEventId: (id: string) =>
					Ref.get(notificationAttemptsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(a: Record<string, unknown>) => a.notificationEventId === id
							)
						)
					),
			},
			notificationEvents: {
				append: (input: Record<string, unknown>) =>
					Effect.gen(function* append() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(notificationEventsRef, (arr) => [...arr, record]);
						return record;
					}),
				getById: (id: string) =>
					Ref.get(notificationEventsRef).pipe(
						Effect.flatMap((arr) => {
							const found = arr.find(
								(e: Record<string, unknown>) => e.id === id
							);
							return found
								? Effect.succeed(found)
								: Effect.fail(new Error(`Missing ${id}`));
						})
					),
				listByRequestId: (requestId: string) =>
					Ref.get(notificationEventsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			policyAssignments: {
				assign: (input: Record<string, unknown>) =>
					Effect.gen(function* assign() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(policyAssignmentsRef, (arr) => [...arr, record]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(policyAssignmentsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			requests: {
				create: (input: Record<string, unknown>) =>
					Effect.gen(function* create() {
						const record = {
							...input,
							createdAt: input.receivedAt,
							tenantId: "tenant-default",
							updatedAt: input.receivedAt,
						};
						yield* Ref.update(requestsRef, (map) =>
							new Map(map).set(String(input.id), record)
						);
						return record;
					}),
				getById: (id: string) =>
					Ref.get(requestsRef).pipe(
						Effect.flatMap((map) => {
							const found = map.get(id);
							return found
								? Effect.succeed(found)
								: Effect.fail(new Error(`Missing request ${id}`));
						})
					),
				list: () =>
					Ref.get(requestsRef).pipe(Effect.map((map) => [...map.values()])),
				remove: (id: string) =>
					Ref.update(requestsRef, (map) => {
						const next = new Map(map);
						next.delete(id);
						return next;
					}),
				update: (id: string, input: Record<string, unknown>) =>
					Effect.gen(function* update() {
						const map = yield* Ref.get(requestsRef);
						const current = map.get(id);
						if (!current) {
							return yield* Effect.fail(new Error(`Missing request ${id}`));
						}
						const updated = { ...current, ...input };
						yield* Ref.set(requestsRef, new Map(map).set(id, updated));
						return updated;
					}),
			},
			retentionPolicies: {
				list: () =>
					Ref.get(retentionPoliciesRef).pipe(
						Effect.map((arr) => [...arr] as readonly Record<string, unknown>[])
					),
				upsert: (input: Record<string, unknown>) =>
					Effect.gen(function* upsert() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(retentionPoliciesRef, (arr) => {
							const index = arr.findIndex(
								(e: Record<string, unknown>) => e.id === input.id
							);
							if (index === -1) {
								return [...arr, record];
							}
							const next = [...arr];
							next[index] = record;
							return next;
						});
						return record;
					}),
			},
			timeline: {
				append: (input: Record<string, unknown>) =>
					Effect.gen(function* append() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(timelineRef, (arr) => [...arr, record]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(timelineRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			verificationEvidence: {
				create: (input: Record<string, unknown>) =>
					Effect.gen(function* create() {
						const record = { ...input, tenantId: "tenant-default" };
						yield* Ref.update(verificationEvidenceRecordsRef, (arr) => [
							...arr,
							record,
						]);
						return record;
					}),
				listByRequestId: (requestId: string) =>
					Ref.get(verificationEvidenceRecordsRef).pipe(
						Effect.map((arr) =>
							arr.filter(
								(e: Record<string, unknown>) => e.requestId === requestId
							)
						)
					),
			},
			webhookEndpoints: {
				ensureConfigured: (input: Record<string, unknown>) =>
					Effect.gen(function* ensureConfiguredWebhookEndpoint() {
						const endpointId = String(input.id ?? "");
						const createdAt = String(input.createdAt ?? "");
						const endpoint = {
							createdAt,
							id: endpointId,
							tenantId: "tenant-default",
							updatedAt: createdAt,
							url: String(input.url ?? ""),
						};
						yield* Ref.update(webhookEndpointsRef, (endpoints) =>
							new Map(endpoints).set(endpointId, endpoint)
						);
						const primaryKey: Record<string, unknown> = yield* Ref.modify(
							webhookSigningKeysRef,
							(keys) => {
								const current = keys.find(
									(key) =>
										key.endpointId === endpointId && key.role === "primary"
								);
								if (current) {
									return [current, keys] as const;
								}
								const nextPrimary = {
									createdAt,
									endpointId,
									id:
										typeof input.keyId === "string"
											? input.keyId
											: `${endpointId}:primary`,
									role: "primary",
									secret: String(input.signingSecret ?? ""),
									tenantId: "tenant-default",
								};
								return [
									nextPrimary,
									[...keys, nextPrimary] as Record<string, unknown>[],
								] as const;
							}
						);
						return { endpoint, primaryKey };
					}),
				getById: (id: string) =>
					Ref.get(webhookEndpointsRef).pipe(
						Effect.flatMap((endpoints) => {
							const endpoint = endpoints.get(id);
							return endpoint
								? Effect.succeed(endpoint)
								: Effect.fail(new Error(`Missing webhook endpoint ${id}`));
						})
					),
				listActiveKeys: (endpointId: string, now: string) =>
					Ref.get(webhookSigningKeysRef).pipe(
						Effect.map((keys) =>
							keys.filter(
								(key) =>
									key.endpointId === endpointId &&
									(key.role === "primary" ||
										typeof key.expiresAt !== "string" ||
										key.expiresAt > now)
							)
						)
					),
				rotateSigningKey: (input: Record<string, unknown>) =>
					Effect.gen(function* rotateSigningKey() {
						const endpointId = String(input.endpointId ?? "");
						const endpoints = yield* Ref.get(webhookEndpointsRef);
						const endpoint = endpoints.get(endpointId);
						if (!endpoint) {
							return yield* Effect.fail(
								new Error(`Missing webhook endpoint ${endpointId}`)
							);
						}
						const rotatedAt = String(input.rotatedAt ?? "");
						const graceExpiresAt = String(input.graceExpiresAt ?? "");
						const newPrimary = {
							createdAt: rotatedAt,
							endpointId,
							id: String(input.newKeyId ?? ""),
							role: "primary",
							secret: String(input.newSecret ?? ""),
							tenantId: "tenant-default",
						};
						const previousPrimary = yield* Ref.modify(
							webhookSigningKeysRef,
							(keys) => {
								let previous: Record<string, unknown> | undefined;
								const demoted = keys.map((key) => {
									if (key.endpointId === endpointId && key.role === "primary") {
										previous = {
											...key,
											expiresAt: graceExpiresAt,
											role: "secondary",
										};
										return previous;
									}
									return key;
								});
								return [
									previous,
									[...demoted, newPrimary] as Record<string, unknown>[],
								] as const;
							}
						);
						const activeKeys = yield* Ref.get(webhookSigningKeysRef).pipe(
							Effect.map((keys) =>
								keys.filter(
									(key) =>
										key.endpointId === endpointId &&
										(key.role === "primary" ||
											typeof key.expiresAt !== "string" ||
											key.expiresAt > rotatedAt)
								)
							)
						);
						return { activeKeys, endpoint, newPrimary, previousPrimary };
					}),
			},
		};
	});

/**
 * Synchronous helper that creates a minimal persistence instance. Use when
 * passing to APIs that expect a plain value (e.g. `dsarInstance`).
 *
 * @returns Minimal persistence facade backed by Ref-wrapped state.
 */
export const makeMinimalPersistenceSync = (): MinimalPersistence =>
	Effect.runSync(makeMinimalPersistence());

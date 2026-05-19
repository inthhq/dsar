import { TenantContext } from "@dsar/persistence";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

const DEFAULT_TENANT_ID = "tenant-default";
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

const currentTenantId = Effect.serviceOption(TenantContext).pipe(
	Effect.map((contextOption) =>
		Option.match(contextOption, {
			onNone: () => DEFAULT_TENANT_ID,
			onSome: (context) => context.tenantId,
		})
	)
);

const scopedKey = (tenantId: string, id: string): string => `${tenantId}:${id}`;

const compareActiveWebhookKeys = (
	left: Record<string, unknown>,
	right: Record<string, unknown>
): number => {
	const leftRole = String(left.role ?? "");
	const rightRole = String(right.role ?? "");
	if (leftRole !== rightRole) {
		return leftRole === "primary" ? -1 : 1;
	}
	const leftCreatedAt = String(left.createdAt ?? "");
	const rightCreatedAt = String(right.createdAt ?? "");
	return leftCreatedAt === rightCreatedAt
		? String(left.id ?? "").localeCompare(String(right.id ?? ""))
		: rightCreatedAt.localeCompare(leftCreatedAt);
};

const normalizeIdentifier = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 ? normalized : null;
};

const asRecord = (
	value: unknown
): Readonly<Record<string, unknown>> | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: undefined;

const requestMatchesSubjectLookup = (
	record: Record<string, unknown>,
	identifiers: ReadonlySet<string>
): boolean => {
	const capture = asRecord(record.capture);
	const subject = asRecord(capture?.subject);
	const requestor = asRecord(record.requestor);
	const recordIdentifiers = [
		normalizeIdentifier(subject?.subjectId),
		normalizeIdentifier(subject?.externalRef),
		normalizeIdentifier(requestor?.email),
	].filter((value): value is string => value !== null);
	return recordIdentifiers.some((identifier) => identifiers.has(identifier));
};

const requestPolicyPack = (
	record: Record<string, unknown>
): string | undefined => {
	const capture = asRecord(record.capture);
	const policy = asRecord(capture?.policy);
	return typeof policy?.policyPack === "string" && policy.policyPack.length > 0
		? policy.policyPack
		: undefined;
};

const boundedLimit = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_LIST_LIMIT;
	}
	return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.trunc(value)));
};

const boundedOffset = (value: unknown): number => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.trunc(value));
};

const matchesNotificationAttemptFilter = (
	attempt: Record<string, unknown>,
	input?: Record<string, unknown>
): boolean => {
	if (typeof input?.channel === "string" && attempt.channel !== input.channel) {
		return false;
	}
	if (
		Array.isArray(input?.status) &&
		input.status.length > 0 &&
		!input.status.includes(attempt.status)
	) {
		return false;
	}
	if (
		typeof input?.destination === "string" &&
		attempt.destination !== input.destination
	) {
		return false;
	}
	if (
		typeof input?.createdAfter === "string" &&
		typeof attempt.createdAt === "string" &&
		attempt.createdAt <= input.createdAfter
	) {
		return false;
	}
	if (
		typeof input?.createdBefore === "string" &&
		typeof attempt.createdAt === "string" &&
		attempt.createdAt >= input.createdBefore
	) {
		return false;
	}
	return true;
};

const compareNotificationAttemptsDesc = (
	left: Record<string, unknown>,
	right: Record<string, unknown>
): number => {
	const leftCreatedAt = String(left.createdAt ?? "");
	const rightCreatedAt = String(right.createdAt ?? "");
	const order = rightCreatedAt.localeCompare(leftCreatedAt);
	if (order !== 0) {
		return order;
	}
	return String(right.id ?? "").localeCompare(String(left.id ?? ""));
};

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
		readonly list: (input: Record<string, unknown>) => Effect.Effect<{
			readonly items: readonly Record<string, unknown>[];
			readonly limit: number;
			readonly nextCursor?: { readonly createdAt: string; readonly id: string };
		}>;
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
		readonly count: (input?: Record<string, unknown>) => Effect.Effect<number>;
		readonly getById: (
			id: string
		) => Effect.Effect<Record<string, unknown>, Error>;
		readonly list: (
			input?: Record<string, unknown>
		) => Effect.Effect<readonly Record<string, unknown>[]>;
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
		readonly rollbackSigningKeyRotation: (
			input: Record<string, unknown>
		) => Effect.Effect<void>;
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
		readonly listBySubject: (input: Record<string, unknown>) => Effect.Effect<{
			readonly items: readonly Record<string, unknown>[];
			readonly limit: number;
			readonly nextCursor?: { readonly createdAt: string; readonly id: string };
		}>;
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
						const result = yield* Ref.modify(auditEventsRef, (arr) => {
							if (arr.some((event) => event.id === record.id)) {
								return [
									{
										id: record.id,
										status: "duplicate" as const,
									},
									arr,
								];
							}
							return [
								{
									record,
									status: "appended" as const,
								},
								[...arr, record],
							];
						});
						if (result.status === "duplicate") {
							return yield* Effect.fail(
								new Error(`Duplicate audit event ${String(result.id)}`)
							);
						}
						return result.record;
					}),
				list: (input: Record<string, unknown>) =>
					Ref.get(auditEventsRef).pipe(
						Effect.map((arr) => {
							const limit = boundedLimit(input.limit);
							const requestIds = Array.isArray(input.requestIds)
								? new Set(input.requestIds as readonly string[])
								: undefined;
							const cursor = input.cursor as
								| { readonly createdAt: string; readonly id: string }
								| undefined;
							const filtered = arr
								.filter((event) =>
									input.requestId ? event.requestId === input.requestId : true
								)
								.filter((event) =>
									requestIds
										? typeof event.requestId === "string" &&
											requestIds.has(event.requestId)
										: true
								)
								.filter((event) =>
									input.actor ? event.actor === input.actor : true
								)
								.filter((event) =>
									input.action ? event.action === input.action : true
								)
								.filter((event) =>
									input.createdAfter
										? typeof event.createdAt === "string" &&
											event.createdAt >= (input.createdAfter as string)
										: true
								)
								.filter((event) =>
									input.createdBefore
										? typeof event.createdAt === "string" &&
											event.createdAt <= (input.createdBefore as string)
										: true
								)
								.filter((event) => {
									if (!cursor) {
										return true;
									}
									const createdAt =
										typeof event.createdAt === "string" ? event.createdAt : "";
									const id = typeof event.id === "string" ? event.id : "";
									return (
										createdAt < cursor.createdAt ||
										(createdAt === cursor.createdAt && id < cursor.id)
									);
								})
								.toSorted((left, right) => {
									const leftCreatedAt =
										typeof left.createdAt === "string" ? left.createdAt : "";
									const rightCreatedAt =
										typeof right.createdAt === "string" ? right.createdAt : "";
									const order = rightCreatedAt.localeCompare(leftCreatedAt);
									if (order !== 0) {
										return order;
									}
									const leftId = typeof left.id === "string" ? left.id : "";
									const rightId = typeof right.id === "string" ? right.id : "";
									return rightId.localeCompare(leftId);
								});
							const items = filtered.slice(0, limit);
							const last = items.at(-1);
							const nextCursor =
								filtered.length > limit &&
								last &&
								typeof last.createdAt === "string" &&
								typeof last.id === "string"
									? { createdAt: last.createdAt, id: last.id }
									: undefined;
							return { items, limit, nextCursor };
						})
					),
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
				count: (input?: Record<string, unknown>) =>
					Ref.get(notificationAttemptsRef).pipe(
						Effect.map(
							(arr) =>
								arr.filter((a: Record<string, unknown>) =>
									matchesNotificationAttemptFilter(a, input)
								).length
						)
					),
				getById: (id: string) =>
					Ref.get(notificationAttemptsRef).pipe(
						Effect.flatMap((arr) => {
							const found = arr.find(
								(a: Record<string, unknown>) => a.id === id
							);
							return found
								? Effect.succeed(found)
								: Effect.fail(new Error(`Missing ${id}`));
						})
					),
				list: (input?: Record<string, unknown>) =>
					Ref.get(notificationAttemptsRef).pipe(
						Effect.map((arr) =>
							arr
								.filter((a: Record<string, unknown>) =>
									matchesNotificationAttemptFilter(a, input)
								)
								.toSorted(compareNotificationAttemptsDesc)
								.slice(
									boundedOffset(input?.offset),
									boundedOffset(input?.offset) + boundedLimit(input?.limit)
								)
						)
					),
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
				listBySubject: (input: Record<string, unknown>) =>
					Ref.get(requestsRef).pipe(
						Effect.map((map) => {
							const identifiers = new Set(
								(Array.isArray(input.identifiers) ? input.identifiers : [])
									.map(normalizeIdentifier)
									.filter((value): value is string => value !== null)
							);
							const limit = boundedLimit(input.limit);
							if (identifiers.size === 0) {
								return { items: [], limit };
							}
							const status = new Set(
								(Array.isArray(input.status) ? input.status : []).filter(
									(value): value is string => typeof value === "string"
								)
							);
							const cursor = asRecord(input.cursor);
							const cursorCreatedAt =
								typeof cursor?.createdAt === "string"
									? cursor.createdAt
									: undefined;
							const cursorId =
								typeof cursor?.id === "string" ? cursor.id : undefined;
							const items = [...map.values()]
								.filter((record) => {
									if (!requestMatchesSubjectLookup(record, identifiers)) {
										return false;
									}
									if (
										status.size > 0 &&
										(typeof record.status !== "string" ||
											!status.has(record.status))
									) {
										return false;
									}
									if (
										typeof input.createdAfter === "string" &&
										typeof record.createdAt === "string" &&
										record.createdAt <= input.createdAfter
									) {
										return false;
									}
									if (
										typeof input.createdBefore === "string" &&
										typeof record.createdAt === "string" &&
										record.createdAt >= input.createdBefore
									) {
										return false;
									}
									if (
										typeof input.policyPack === "string" &&
										requestPolicyPack(record) !== input.policyPack
									) {
										return false;
									}
									if (
										cursorCreatedAt &&
										cursorId &&
										typeof record.createdAt === "string" &&
										typeof record.id === "string" &&
										!(
											record.createdAt < cursorCreatedAt ||
											(record.createdAt === cursorCreatedAt &&
												record.id < cursorId)
										)
									) {
										return false;
									}
									return true;
								})
								.toSorted((left, right) => {
									const createdOrder = String(right.createdAt).localeCompare(
										String(left.createdAt)
									);
									return createdOrder === 0
										? String(right.id).localeCompare(String(left.id))
										: createdOrder;
								});
							const pageItems = items.slice(0, limit);
							const last = pageItems.at(-1);
							return {
								items: pageItems,
								limit,
								nextCursor:
									items.length > limit &&
									typeof last?.createdAt === "string" &&
									typeof last.id === "string"
										? { createdAt: last.createdAt, id: last.id }
										: undefined,
							};
						})
					),
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
						const tenantId = yield* currentTenantId;
						const endpointId = String(input.id ?? "");
						const endpointKey = scopedKey(tenantId, endpointId);
						const endpointRecords = yield* Ref.get(webhookEndpointsRef);
						const existing = endpointRecords.get(endpointKey);
						const createdAt = String(
							existing?.createdAt ?? input.createdAt ?? ""
						);
						const updatedAt = String(input.updatedAt ?? input.createdAt ?? "");
						const endpoint = {
							createdAt,
							id: endpointId,
							tenantId,
							updatedAt,
							url: String(input.url ?? ""),
						};
						const primaryKeyId =
							typeof input.keyId === "string"
								? input.keyId
								: `${endpointId}:primary`;
						const signingKeys = yield* Ref.get(webhookSigningKeysRef);
						const currentPrimary = signingKeys.find(
							(signingKey) =>
								signingKey.tenantId === tenantId &&
								signingKey.endpointId === endpointId &&
								signingKey.role === "primary"
						);
						if (
							!currentPrimary &&
							signingKeys.some(
								(signingKey) =>
									signingKey.tenantId === tenantId &&
									signingKey.id === primaryKeyId
							)
						) {
							throw new Error(`Duplicate webhook signing key ${primaryKeyId}`);
						}
						yield* Ref.update(webhookEndpointsRef, (currentEndpoints) =>
							new Map(currentEndpoints).set(endpointKey, endpoint)
						);
						const primaryKey: Record<string, unknown> = yield* Ref.modify(
							webhookSigningKeysRef,
							(currentSigningKeys) => {
								if (currentPrimary) {
									return [currentPrimary, currentSigningKeys] as const;
								}
								const nextPrimary = {
									createdAt,
									endpointId,
									id: primaryKeyId,
									role: "primary",
									secret: String(input.signingSecret ?? ""),
									tenantId,
								};
								return [
									nextPrimary,
									[...currentSigningKeys, nextPrimary] as Record<
										string,
										unknown
									>[],
								] as const;
							}
						);
						return { endpoint, primaryKey };
					}),
				getById: (id: string) =>
					Effect.gen(function* getWebhookEndpointById() {
						const tenantId = yield* currentTenantId;
						const endpoints = yield* Ref.get(webhookEndpointsRef);
						const endpoint = endpoints.get(scopedKey(tenantId, id));
						if (!endpoint) {
							return yield* Effect.fail(
								new Error(`Missing webhook endpoint ${id}`)
							);
						}
						return endpoint;
					}),
				listActiveKeys: (endpointId: string, now: string) =>
					Effect.gen(function* listActiveWebhookKeys() {
						const tenantId = yield* currentTenantId;
						const keys = yield* Ref.get(webhookSigningKeysRef);
						return keys
							.filter(
								(key) =>
									key.tenantId === tenantId &&
									key.endpointId === endpointId &&
									(key.role === "primary" ||
										typeof key.expiresAt !== "string" ||
										key.expiresAt > now)
							)
							.toSorted(compareActiveWebhookKeys);
					}),
				rollbackSigningKeyRotation: (input: Record<string, unknown>) =>
					Effect.gen(function* rollbackSigningKeyRotation() {
						const tenantId = yield* currentTenantId;
						const endpointId = String(input.endpointId ?? "");
						const newKeyId = String(input.newKeyId ?? "");
						yield* Ref.update(webhookSigningKeysRef, (keys) => {
							const removedPrimary = keys.some(
								(key) =>
									key.tenantId === tenantId &&
									key.endpointId === endpointId &&
									key.id === newKeyId &&
									key.role === "primary"
							);
							const withoutNewPrimary = keys.filter(
								(key) =>
									!(
										key.tenantId === tenantId &&
										key.endpointId === endpointId &&
										key.id === newKeyId &&
										key.role === "primary"
									)
							);
							const previousPrimary =
								typeof input.previousPrimary === "object" &&
								input.previousPrimary !== null
									? input.previousPrimary
									: undefined;
							if (!(removedPrimary && previousPrimary)) {
								return withoutNewPrimary;
							}
							const restoredPrimary = {
								...(previousPrimary as Record<string, unknown>),
								expiresAt: undefined,
								role: "primary",
							};
							const previousPrimaryId = String(
								(previousPrimary as Record<string, unknown>).id ?? ""
							);
							return withoutNewPrimary.map((key) =>
								key.tenantId === tenantId &&
								key.endpointId === endpointId &&
								key.id === previousPrimaryId
									? restoredPrimary
									: key
							);
						});
					}),
				rotateSigningKey: (input: Record<string, unknown>) =>
					Effect.gen(function* rotateSigningKey() {
						const tenantId = yield* currentTenantId;
						const endpointId = String(input.endpointId ?? "");
						const endpoints = yield* Ref.get(webhookEndpointsRef);
						const endpoint = endpoints.get(scopedKey(tenantId, endpointId));
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
							tenantId,
						};
						const signingKeys = yield* Ref.get(webhookSigningKeysRef);
						if (
							signingKeys.some(
								(signingKey) =>
									signingKey.tenantId === tenantId &&
									signingKey.id === newPrimary.id
							)
						) {
							throw new Error(`Duplicate webhook signing key ${newPrimary.id}`);
						}
						const { activeKeys, previousPrimary } = yield* Ref.modify(
							webhookSigningKeysRef,
							(keys) => {
								let previous: Record<string, unknown> | undefined;
								const demoted = keys.map((key) => {
									if (
										key.tenantId === tenantId &&
										key.endpointId === endpointId &&
										key.role === "primary"
									) {
										previous = {
											...key,
											expiresAt: graceExpiresAt,
											role: "secondary",
										};
										return previous;
									}
									return key;
								});
								const nextKeys = [...demoted, newPrimary] as Record<
									string,
									unknown
								>[];
								const rotatedActiveKeys = nextKeys
									.filter(
										(key) =>
											key.tenantId === tenantId &&
											key.endpointId === endpointId &&
											(key.role === "primary" ||
												typeof key.expiresAt !== "string" ||
												key.expiresAt > rotatedAt)
									)
									.toSorted(compareActiveWebhookKeys);
								return [
									{ activeKeys: rotatedActiveKeys, previousPrimary: previous },
									nextKeys,
								] as const;
							}
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

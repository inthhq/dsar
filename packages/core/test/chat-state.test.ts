import { TenantContext } from "@dsar/persistence";
import type {
	ChatStateRecord,
	JsonValue,
	PersistenceService,
} from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makePersistenceStateAdapter } from "#src/chat";

const getRequiredValue = <T>(
	value: T | null | undefined,
	message: string
): T => {
	if (value === undefined || value === null) {
		throw new Error(message);
	}
	return value;
};

interface ResolutionRecord {
	readonly kind: string;
	readonly value: string;
}

const resolveTenantForMixedScope = ({
	kind,
	value,
}: ResolutionRecord): string => {
	if (kind === "thread" && value.includes("tenant-b")) {
		return "tenant-b";
	}
	return "tenant-a";
};

const resolveRecordedTenant = (
	resolved: ResolutionRecord[],
	input: ResolutionRecord
): string => {
	resolved.push(input);
	return input.kind === "key"
		? `tenant:key:${input.value}`
		: `tenant:thread:${input.value}`;
};

const toScopedKey = (tenantId: string, key: string): string =>
	`${tenantId}:${key}`;

const DEFAULT_CLOCK = { now: () => Date.now() } as const;

const getUnexpiredLock = (
	locks: Map<
		string,
		{
			readonly acquiredAt: string;
			readonly expiresAt: string;
			readonly token: string;
		}
	>,
	scopedThreadId: string,
	now: number
) => {
	const current = locks.get(scopedThreadId);
	if (!current) {
		return;
	}
	if (Date.parse(current.expiresAt) <= now) {
		locks.delete(scopedThreadId);
		return;
	}
	return current;
};

const makePersistenceService = (
	hooks?: {
		readonly onDelete?: (key: string) => void;
		readonly onGet?: (key: string) => void;
		readonly onIsSubscribed?: (threadId: string) => void;
		readonly onLockAcquire?: (args: {
			readonly acquiredAt: string;
			readonly expiresAt: string;
			readonly tenantId: string;
			readonly threadId: string;
			readonly token: string;
		}) => void;
		readonly onLockExtend?: (args: {
			readonly expiresAt: string;
			readonly tenantId: string;
			readonly threadId: string;
			readonly token: string;
		}) => void;
		readonly onLockRelease?: (args: {
			readonly tenantId: string;
			readonly threadId: string;
			readonly token: string;
		}) => void;
		readonly onSet?: (args: {
			readonly createdAt: string;
			readonly expiresAt?: string;
			readonly key: string;
			readonly tenantId: string;
			readonly updatedAt: string;
			readonly value: JsonValue;
		}) => void;
		readonly onSetIfNotExists?: (args: {
			readonly createdAt: string;
			readonly expiresAt?: string;
			readonly key: string;
			readonly tenantId: string;
			readonly updatedAt: string;
			readonly value: JsonValue;
		}) => void;
		readonly onSubscribe?: (args: {
			readonly subscribedAt: string;
			readonly tenantId: string;
			readonly threadId: string;
		}) => void;
		readonly onUnsubscribe?: (threadId: string) => void;
	},
	clock: { readonly now: () => number } = DEFAULT_CLOCK
): PersistenceService => {
	const state = new Map<string, ChatStateRecord>();
	const subscriptions = new Set<string>();
	const locks = new Map<
		string,
		{
			readonly acquiredAt: string;
			readonly expiresAt: string;
			readonly token: string;
		}
	>();
	return {
		auditEvents: {} as never,
		chatRuntimeState: {
			acquireLock: (input) =>
				Effect.gen(function* acquireLock() {
					const { tenantId } = yield* Effect.service(TenantContext);
					const scopedThreadId = toScopedKey(tenantId, input.threadId);
					const current = getUnexpiredLock(locks, scopedThreadId, clock.now());
					if (current) {
						return null;
					}
					hooks?.onLockAcquire?.({
						acquiredAt: input.acquiredAt,
						expiresAt: input.expiresAt,
						tenantId,
						threadId: input.threadId,
						token: input.token,
					});
					locks.set(scopedThreadId, {
						acquiredAt: input.acquiredAt,
						expiresAt: input.expiresAt,
						token: input.token,
					});
					return { ...input, tenantId };
				}),
			delete: (key) =>
				Effect.gen(function* deleteState() {
					const { tenantId } = yield* Effect.service(TenantContext);
					hooks?.onDelete?.(key);
					state.delete(toScopedKey(tenantId, key));
				}),
			extendLock: (input) =>
				Effect.gen(function* extendLock() {
					const { tenantId } = yield* Effect.service(TenantContext);
					const scopedThreadId = toScopedKey(tenantId, input.threadId);
					hooks?.onLockExtend?.({
						expiresAt: input.expiresAt,
						tenantId,
						threadId: input.threadId,
						token: input.token,
					});
					const current = getUnexpiredLock(locks, scopedThreadId, clock.now());
					if (!current || current.token !== input.token) {
						return false;
					}
					locks.set(scopedThreadId, {
						...current,
						expiresAt: input.expiresAt,
					});
					return true;
				}),
			get: (key) =>
				Effect.gen(function* getState() {
					const { tenantId } = yield* Effect.service(TenantContext);
					hooks?.onGet?.(key);
					return state.get(toScopedKey(tenantId, key)) ?? null;
				}),
			isSubscribed: (threadId) =>
				Effect.gen(function* isSubscribed() {
					const { tenantId } = yield* Effect.service(TenantContext);
					hooks?.onIsSubscribed?.(threadId);
					return subscriptions.has(toScopedKey(tenantId, threadId));
				}),
			releaseLock: (input) =>
				Effect.gen(function* releaseLock() {
					const { tenantId } = yield* Effect.service(TenantContext);
					const scopedThreadId = toScopedKey(tenantId, input.threadId);
					hooks?.onLockRelease?.({
						tenantId,
						threadId: input.threadId,
						token: input.token,
					});
					const current = locks.get(scopedThreadId);
					if (current?.token === input.token) {
						locks.delete(scopedThreadId);
					}
				}),
			set: (input) =>
				Effect.gen(function* setState() {
					const { tenantId } = yield* Effect.service(TenantContext);
					const record = { ...input, tenantId };
					hooks?.onSet?.({
						createdAt: input.createdAt,
						expiresAt: input.expiresAt,
						key: input.key,
						tenantId,
						updatedAt: input.updatedAt,
						value: input.value,
					});
					state.set(toScopedKey(tenantId, input.key), record);
					return record;
				}),
			setIfNotExists: (input) =>
				Effect.gen(function* setIfNotExists() {
					const { tenantId } = yield* Effect.service(TenantContext);
					const scopedKey = toScopedKey(tenantId, input.key);
					hooks?.onSetIfNotExists?.({
						createdAt: input.createdAt,
						expiresAt: input.expiresAt,
						key: input.key,
						tenantId,
						updatedAt: input.updatedAt,
						value: input.value,
					});
					if (state.has(scopedKey)) {
						return false;
					}
					state.set(scopedKey, { ...input, tenantId });
					return true;
				}),
			subscribe: (input) =>
				Effect.gen(function* subscribe() {
					const { tenantId } = yield* Effect.service(TenantContext);
					hooks?.onSubscribe?.({
						subscribedAt: input.subscribedAt,
						tenantId,
						threadId: input.threadId,
					});
					subscriptions.add(toScopedKey(tenantId, input.threadId));
					return { ...input, tenantId };
				}),
			unsubscribe: (threadId) =>
				Effect.gen(function* unsubscribe() {
					const { tenantId } = yield* Effect.service(TenantContext);
					hooks?.onUnsubscribe?.(threadId);
					subscriptions.delete(toScopedKey(tenantId, threadId));
				}),
		},
		clockSegments: {} as never,
		fulfillmentArtifacts: {} as never,
		notificationDeliveryAttempts: {} as never,
		notificationEvents: {} as never,
		policyAssignments: {} as never,
		requests: {} as never,
		retentionPolicies: {} as never,
		timeline: {} as never,
		verificationEvidence: {} as never,
	};
};

const expectCacheLifecycle = async (
	adapter: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	await adapter.set("cache:one", { hello: "world" }, 1000);
	expect(await adapter.get<{ hello: string }>("cache:one")).toStrictEqual({
		hello: "world",
	});
	expect(
		await adapter.setIfNotExists("cache:one", { ignored: true })
	).toBeFalsy();
	expect(await adapter.setIfNotExists("cache:two", { ok: true })).toBeTruthy();
};

const expectSubscriptionLifecycle = async (
	adapter: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	const threadId = "resend:tenant-a@example.com:thread-1";
	await adapter.subscribe(threadId);
	expect(await adapter.isSubscribed(threadId)).toBeTruthy();
	await adapter.unsubscribe(threadId);
	expect(await adapter.isSubscribed(threadId)).toBeFalsy();
};

const expectLockLifecycle = async (
	adapter: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	const threadId = "resend:tenant-b@example.com:thread-1";
	const lock = getRequiredValue(
		await adapter.acquireLock(threadId, 5000),
		"Expected a chat lock to be acquired"
	);
	expect(lock.token).toBe("lock-1");
	expect(await adapter.acquireLock(threadId, 5000)).toBeNull();
	expect(await adapter.extendLock(lock, 10_000)).toBeTruthy();
	await adapter.releaseLock(lock);
	expect(await adapter.acquireLock(threadId, 5000)).not.toBeNull();
};

const runScopedOperations = async (
	adapter: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	await adapter.set("cache:key-1", { ok: true });
	await adapter.get("cache:key-1");
	await adapter.delete("cache:key-1");
	await adapter.subscribe("resend:thread-1");
	await adapter.isSubscribed("resend:thread-1");
	await adapter.unsubscribe("resend:thread-1");
};

const EXPECTED_SCOPE_CALLS = [
	"setIfNotExists:cache:key-1",
	"get:cache:key-1",
	"delete:cache:key-1",
	"subscribe:resend:thread-1",
	"isSubscribed:resend:thread-1",
	"unsubscribe:resend:thread-1",
] as const;

const EXPECTED_SCOPE_RESOLUTIONS: readonly ResolutionRecord[] = [
	{ kind: "key", value: "cache:key-1" },
	{ kind: "key", value: "cache:key-1" },
	{ kind: "key", value: "cache:key-1" },
	{ kind: "thread", value: "resend:thread-1" },
	{ kind: "thread", value: "resend:thread-1" },
	{ kind: "thread", value: "resend:thread-1" },
];

const createStateWriteHarness = (baseNow: Date) => {
	const setIfNotExistsCalls: {
		readonly createdAt: string;
		readonly expiresAt?: string;
		readonly key: string;
		readonly updatedAt: string;
		readonly value: JsonValue;
	}[] = [];
	const setCalls: {
		readonly createdAt: string;
		readonly expiresAt?: string;
		readonly key: string;
		readonly updatedAt: string;
		readonly value: JsonValue;
	}[] = [];
	const lockCalls: {
		readonly acquiredAt: string;
		readonly expiresAt: string;
		readonly threadId: string;
		readonly token: string;
	}[] = [];
	const persistence = makePersistenceService({
		onLockAcquire: (args) =>
			lockCalls.push({
				acquiredAt: args.acquiredAt,
				expiresAt: args.expiresAt,
				threadId: args.threadId,
				token: args.token,
			}),
		onSet: (args) =>
			setCalls.push({
				createdAt: args.createdAt,
				expiresAt: args.expiresAt,
				key: args.key,
				updatedAt: args.updatedAt,
				value: args.value,
			}),
		onSetIfNotExists: (args) =>
			setIfNotExistsCalls.push({
				createdAt: args.createdAt,
				expiresAt: args.expiresAt,
				key: args.key,
				updatedAt: args.updatedAt,
				value: args.value,
			}),
	});

	return {
		adapter: makePersistenceStateAdapter({
			now: () => new Date(baseNow),
			persistence,
			resolveTenantId: () => "tenant-1",
			tokenFactory: () => "lock-fixed",
		}),
		lockCalls,
		setCalls,
		setIfNotExistsCalls,
	};
};

const makeTenantAdapter = (
	persistence: PersistenceService,
	tenantId: string,
	token: string
) =>
	makePersistenceStateAdapter({
		persistence,
		resolveTenantId: () => tenantId,
		tokenFactory: () => token,
	});

const expectTenantScopedCacheIsolation = async (
	adapterA: ReturnType<typeof makePersistenceStateAdapter>,
	adapterB: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	await adapterA.set("shared:key", { tenant: "a" });
	await adapterB.set("shared:key", { tenant: "b" });
	expect(await adapterA.get("shared:key")).toStrictEqual({ tenant: "a" });
	expect(await adapterB.get("shared:key")).toStrictEqual({ tenant: "b" });
};

const expectTenantScopedSubscriptionIsolation = async (
	adapterA: ReturnType<typeof makePersistenceStateAdapter>,
	adapterB: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	await adapterA.subscribe("shared:thread");
	expect(await adapterA.isSubscribed("shared:thread")).toBeTruthy();
	expect(await adapterB.isSubscribed("shared:thread")).toBeFalsy();
};

const expectTenantScopedLockIsolation = async (
	adapterA: ReturnType<typeof makePersistenceStateAdapter>,
	adapterB: ReturnType<typeof makePersistenceStateAdapter>
): Promise<void> => {
	const tenantALock = await adapterA.acquireLock("shared:thread", 1000);
	const tenantBLock = await adapterB.acquireLock("shared:thread", 1000);
	expect(tenantALock?.token).toBe("lock-a");
	expect(tenantBLock?.token).toBe("lock-b");
};

describe("core chat state adapter", () => {
	it("persists cache values, subscriptions, and locks per tenant", async () => {
		const persistence = makePersistenceService();
		const adapter = makePersistenceStateAdapter({
			persistence,
			resolveTenantId: resolveTenantForMixedScope,
			tokenFactory: () => "lock-1",
		});

		await expectCacheLifecycle(adapter);
		await expectSubscriptionLifecycle(adapter);
		await expectLockLifecycle(adapter);
	});

	it("isolates identical keys and threads across tenants", async () => {
		const persistence = makePersistenceService();
		const adapterA = makeTenantAdapter(persistence, "tenant-a", "lock-a");
		const adapterB = makeTenantAdapter(persistence, "tenant-b", "lock-b");

		await expectTenantScopedCacheIsolation(adapterA, adapterB);
		await expectTenantScopedSubscriptionIsolation(adapterA, adapterB);
		await expectTenantScopedLockIsolation(adapterA, adapterB);
	});

	it("resolves tenant scope separately for key and thread operations", async () => {
		const calls: string[] = [];
		const resolved: ResolutionRecord[] = [];
		const persistence = makePersistenceService({
			onDelete: (key) => calls.push(`delete:${key}`),
			onGet: (key) => calls.push(`get:${key}`),
			onIsSubscribed: (threadId) => calls.push(`isSubscribed:${threadId}`),
			onSet: (args) => calls.push(`set:${args.key}`),
			onSetIfNotExists: (args) => calls.push(`setIfNotExists:${args.key}`),
			onSubscribe: (args) => calls.push(`subscribe:${args.threadId}`),
			onUnsubscribe: (threadId) => calls.push(`unsubscribe:${threadId}`),
		});
		const adapter = makePersistenceStateAdapter({
			persistence,
			resolveTenantId: (input) => resolveRecordedTenant(resolved, input),
		});

		await runScopedOperations(adapter);

		expect(calls).toStrictEqual(EXPECTED_SCOPE_CALLS);
		expect(resolved).toStrictEqual(EXPECTED_SCOPE_RESOLUTIONS);
	});

	it("normalizes ttl, token generation, and JSON serialization for state writes", async () => {
		const baseNow = new Date("2026-02-20T12:00:00.000Z");
		const { adapter, lockCalls, setCalls, setIfNotExistsCalls } =
			createStateWriteHarness(baseNow);

		await expect(
			adapter.set("cache:undefined", undefined)
		).rejects.toThrowError(
			"toJsonValue: value at $ is not JSON-serializable (undefined)"
		);
		await adapter.set("cache:ttl", { nested: ["ok"] }, 1500);
		const lock = await adapter.acquireLock("resend:thread-ttl", 0);

		expect(setIfNotExistsCalls).toStrictEqual([
			{
				createdAt: "2026-02-20T12:00:00.000Z",
				expiresAt: "2026-02-20T12:00:01.500Z",
				key: "cache:ttl",
				updatedAt: "2026-02-20T12:00:00.000Z",
				value: { nested: ["ok"] },
			},
		]);
		expect(setCalls).toStrictEqual([]);
		expect(lockCalls).toStrictEqual([
			{
				acquiredAt: "2026-02-20T12:00:00.000Z",
				expiresAt: "2026-02-20T12:00:00.001Z",
				threadId: "resend:thread-ttl",
				token: "lock-fixed",
			},
		]);
		expect(lock).toMatchObject({
			threadId: "resend:thread-ttl",
			token: "lock-fixed",
		});
	});

	it("preserves createdAt when overwriting an existing state entry", async () => {
		let currentNow = new Date("2026-02-20T12:00:00.000Z");
		const setCalls: {
			readonly createdAt: string;
			readonly updatedAt: string;
		}[] = [];
		const adapter = makePersistenceStateAdapter({
			now: () => new Date(currentNow),
			persistence: makePersistenceService({
				onSet: (args) =>
					setCalls.push({
						createdAt: args.createdAt,
						updatedAt: args.updatedAt,
					}),
			}),
			resolveTenantId: () => "tenant-1",
		});

		await adapter.set("cache:existing", { step: 1 });
		currentNow = new Date("2026-02-20T12:05:00.000Z");
		await adapter.set("cache:existing", { step: 2 });

		expect(setCalls).toStrictEqual([
			{
				createdAt: "2026-02-20T12:00:00.000Z",
				updatedAt: "2026-02-20T12:05:00.000Z",
			},
		]);
	});
});

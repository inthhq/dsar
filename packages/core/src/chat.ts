import type {
	ChatRuntimeStateRepository,
	JsonValue,
	PersistenceService,
	TenantContext,
} from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import type { Lock, QueueEntry, StateAdapter } from "chat";
import * as Effect from "effect/Effect";

/**
 * Describes how a cache or lock operation should be mapped to a tenant.
 */
export interface PersistenceStateAdapterTenantResolution {
	/** Whether the tenant should be resolved from a cache key or thread id. */
	readonly kind: "key" | "thread";
	/** Raw key or thread identifier used for tenant resolution. */
	readonly value: string;
}

/**
 * Configuration for the persistence-backed Chat SDK state adapter.
 */
export interface PersistenceStateAdapterOptions {
	/** Persistence service that provides the tenant-scoped chat state repository. */
	readonly persistence: PersistenceService;
	/** Resolves the tenant id for each key- or thread-scoped operation. */
	readonly resolveTenantId: (
		input: PersistenceStateAdapterTenantResolution
	) => string;
	/** Optional clock override used for deterministic timestamps in tests. */
	readonly now?: () => Date;
	/** Optional token generator override used for lock acquisition. */
	readonly tokenFactory?: () => string;
}

const THREAD_LOCK_TTL_FLOOR_MS = 1;

const defaultNow = (): Date => new Date();

const toExpiresAt = (now: Date, ttlMs?: number): string | undefined => {
	if (ttlMs === undefined) {
		return undefined;
	}
	const normalized = Math.max(THREAD_LOCK_TTL_FLOOR_MS, Math.trunc(ttlMs));
	return new Date(now.getTime() + normalized).toISOString();
};

const unsupportedJsonValueError = (path: string, type: string): Error =>
	new Error(`toJsonValue: value at ${path} is not JSON-serializable (${type})`);

const circularJsonValueError = (path: string): Error =>
	new Error(`toJsonValue: value at ${path} contains a circular reference`);

const throwIfUnsupportedPrimitive = (value: unknown, path: string): boolean => {
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean": {
			return true;
		}
		case "undefined":
		case "function":
		case "symbol":
		case "bigint": {
			throw unsupportedJsonValueError(path, typeof value);
		}
		default: {
			return false;
		}
	}
};

const validateArrayEntries = (
	value: readonly unknown[],
	path: string,
	seen: WeakSet<object>,
	visit: (value: unknown, path: string, seen: WeakSet<object>) => void
): void => {
	seen.add(value);
	for (const [index, entry] of value.entries()) {
		visit(entry, `${path}[${index}]`, seen);
	}
	seen.delete(value);
};

const validateObjectEntries = (
	value: Record<string, unknown>,
	path: string,
	seen: WeakSet<object>,
	visit: (value: unknown, path: string, seen: WeakSet<object>) => void
): void => {
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw unsupportedJsonValueError(
			path,
			prototype.constructor?.name ?? "object"
		);
	}
	seen.add(value);
	for (const [key, entry] of Object.entries(value)) {
		visit(entry, `${path}.${key}`, seen);
	}
	seen.delete(value);
};

const validateObjectLikeSerializable = (
	value: unknown[] | Record<string, unknown>,
	path: string,
	seen: WeakSet<object>,
	visit: (value: unknown, path: string, seen: WeakSet<object>) => void
): void => {
	const object = value as object;
	if (seen.has(object)) {
		throw circularJsonValueError(path);
	}
	if (Array.isArray(value)) {
		validateArrayEntries(value, path, seen, visit);
		return;
	}
	if (typeof Reflect.get(object, "toJSON") === "function") {
		return;
	}
	validateObjectEntries(value as Record<string, unknown>, path, seen, visit);
};

const validateJsonSerializable = (
	value: unknown,
	path: string,
	seen: WeakSet<object>
): void => {
	if (value === null || throwIfUnsupportedPrimitive(value, path)) {
		return;
	}
	validateObjectLikeSerializable(
		value as unknown[] | Record<string, unknown>,
		path,
		seen,
		validateJsonSerializable
	);
};

const toJsonValue = <T>(value: T): JsonValue => {
	validateJsonSerializable(value, "$", new WeakSet());
	const encoded = JSON.stringify(value);
	if (encoded === undefined) {
		throw new Error("toJsonValue: value is not JSON-serializable");
	}
	return JSON.parse(encoded) as JsonValue;
};

const fromRecordValue = <T>(
	record: { readonly value: JsonValue } | null
): T | null => (record ? (record.value as T) : null);

const makeToken = (): string => crypto.randomUUID();

const runWithTenant = <A>(
	tenantId: string,
	effect: Effect.Effect<A, unknown, TenantContext>
): Promise<A> => Effect.runPromise(effect.pipe(withTenant(tenantId)));

const resolveRepository = (
	options: PersistenceStateAdapterOptions
): ChatRuntimeStateRepository => options.persistence.chatRuntimeState;

const resolveTenant = (
	options: PersistenceStateAdapterOptions,
	input: PersistenceStateAdapterTenantResolution
): string => options.resolveTenantId(input);

/**
 * Creates a Chat SDK-compatible state adapter backed by the DSAR persistence
 * layer. The caller controls tenant routing via `resolveTenantId`, which
 * allows the same adapter implementation to work across both Postgres and
 * SQLite-backed DSAR deployments.
 *
 * @param options - Persistence service and tenant-resolution hooks for adapter operations.
 * @returns A Chat SDK state adapter backed by DSAR persistence.
 */
export const makePersistenceStateAdapter = (
	options: PersistenceStateAdapterOptions
): StateAdapter => {
	const repository = resolveRepository(options);
	const now = options.now ?? defaultNow;
	const tokenFactory = options.tokenFactory ?? makeToken;

	return {
		acquireLock: async (threadId, ttlMs) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			const nowValue = now();
			const acquiredAt = nowValue.toISOString();
			const expiresAt = toExpiresAt(nowValue, ttlMs) ?? acquiredAt;
			const record = await runWithTenant(
				tenantId,
				repository.acquireLock({
					acquiredAt,
					expiresAt,
					threadId,
					token: tokenFactory(),
				})
			);
			return record
				? {
						expiresAt: Date.parse(record.expiresAt),
						threadId: record.threadId,
						token: record.token,
					}
				: null;
		},
		appendToList: (key, value, listOptions) => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			return runWithTenant(
				tenantId,
				repository.appendToList({
					expiresAt: toExpiresAt(now(), listOptions?.ttlMs),
					key,
					maxLength: listOptions?.maxLength,
					value: toJsonValue(value),
				})
			);
		},
		connect: () => Promise.resolve(),
		delete: async (key) => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			await runWithTenant(tenantId, repository.delete(key));
		},
		dequeue: async (threadId): Promise<QueueEntry | null> => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			const value = await runWithTenant(tenantId, repository.dequeue(threadId));
			return value as QueueEntry | null;
		},
		disconnect: () => Promise.resolve(),
		enqueue: (threadId, entry, maxSize) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			return runWithTenant(
				tenantId,
				repository.enqueue({
					expiresAt: new Date(entry.expiresAt).toISOString(),
					maxSize,
					threadId,
					value: toJsonValue(entry),
				})
			);
		},
		extendLock: (lock, ttlMs) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: lock.threadId,
			});
			const expiresAt =
				toExpiresAt(now(), ttlMs) ?? new Date(lock.expiresAt).toISOString();
			return runWithTenant(
				tenantId,
				repository.extendLock({
					expiresAt,
					threadId: lock.threadId,
					token: lock.token,
				})
			);
		},
		forceReleaseLock: (threadId) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			return runWithTenant(tenantId, repository.forceReleaseLock(threadId));
		},
		get: async <T = unknown>(key: string) => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			const record = await runWithTenant(tenantId, repository.get(key));
			return fromRecordValue<T>(record);
		},
		getList: async <T = unknown>(key: string): Promise<T[]> => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			const values = await runWithTenant(tenantId, repository.getList(key));
			return values.map((value) => value as T);
		},
		isSubscribed: (threadId) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			return runWithTenant(tenantId, repository.isSubscribed(threadId));
		},
		queueDepth: (threadId) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			return runWithTenant(tenantId, repository.queueDepth(threadId));
		},
		releaseLock: async (lock: Lock) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: lock.threadId,
			});
			await runWithTenant(
				tenantId,
				repository.releaseLock({
					threadId: lock.threadId,
					token: lock.token,
				})
			);
		},
		set: async <T = unknown>(key: string, value: T, ttlMs?: number) => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			const nowValue = now();
			const timestamp = nowValue.toISOString();
			const expiresAt = toExpiresAt(nowValue, ttlMs);
			const jsonValue = toJsonValue(value);
			const inserted = await runWithTenant(
				tenantId,
				repository.setIfNotExists({
					createdAt: timestamp,
					expiresAt,
					key,
					updatedAt: timestamp,
					value: jsonValue,
				})
			);
			if (inserted) {
				return;
			}
			const current = await runWithTenant(tenantId, repository.get(key));
			await runWithTenant(
				tenantId,
				repository.set({
					createdAt: current?.createdAt ?? timestamp,
					expiresAt,
					key,
					updatedAt: timestamp,
					value: jsonValue,
				})
			);
		},
		setIfNotExists: (key, value, ttlMs) => {
			const tenantId = resolveTenant(options, { kind: "key", value: key });
			const nowValue = now();
			const timestamp = nowValue.toISOString();
			return runWithTenant(
				tenantId,
				repository.setIfNotExists({
					createdAt: timestamp,
					expiresAt: toExpiresAt(nowValue, ttlMs),
					key,
					updatedAt: timestamp,
					value: toJsonValue(value),
				})
			);
		},
		subscribe: async (threadId) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			await runWithTenant(
				tenantId,
				repository.subscribe({
					subscribedAt: now().toISOString(),
					threadId,
				})
			);
		},
		unsubscribe: async (threadId) => {
			const tenantId = resolveTenant(options, {
				kind: "thread",
				value: threadId,
			});
			await runWithTenant(tenantId, repository.unsubscribe(threadId));
		},
	};
};

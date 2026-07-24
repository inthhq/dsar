import type { Lock, QueueEntry, StateAdapter } from "chat";

const getCurrentTime = (): number => Date.now();

/**
 * Creates a minimal in-memory Chat SDK state adapter for package-level tests.
 * @returns A state adapter backed by in-memory maps for cache, subscriptions, and locks.
 */
export const createMemoryState = (): StateAdapter => {
	const cache = new Map<string, unknown>();
	const lists = new Map<string, unknown[]>();
	const queues = new Map<string, QueueEntry[]>();
	const subscriptions = new Set<string>();
	const locks = new Map<
		string,
		{
			readonly expiresAt: number;
			readonly token: string;
		}
	>();

	return {
		acquireLock: (threadId, ttlMs) => {
			const current = locks.get(threadId);
			const now = getCurrentTime();
			if (current && current.expiresAt > now) {
				return Promise.resolve(null);
			}
			if (current) {
				locks.delete(threadId);
			}
			const lock: Lock = {
				expiresAt: now + ttlMs,
				threadId,
				token: crypto.randomUUID(),
			};
			locks.set(threadId, {
				expiresAt: lock.expiresAt,
				token: lock.token,
			});
			return Promise.resolve(lock);
		},
		appendToList: (key, value, options) => {
			const values = [...(lists.get(key) ?? []), value];
			const retainedValues =
				options?.maxLength && options.maxLength > 0
					? values.slice(-options.maxLength)
					: values;
			lists.set(key, retainedValues);
			return Promise.resolve();
		},
		connect: () => Promise.resolve(),
		delete: (key) => {
			cache.delete(key);
			lists.delete(key);
			return Promise.resolve();
		},
		dequeue: (threadId) => {
			const now = getCurrentTime();
			const queue = (queues.get(threadId) ?? []).filter(
				(entry) => entry.expiresAt > now
			);
			const entry = queue.shift() ?? null;
			queues.set(threadId, queue);
			return Promise.resolve(entry);
		},
		disconnect: () => Promise.resolve(),
		enqueue: (threadId, entry, maxSize) => {
			const now = getCurrentTime();
			const queue = [
				...(queues.get(threadId) ?? []).filter(
					(queuedEntry) => queuedEntry.expiresAt > now
				),
				entry,
			];
			const boundedQueue = maxSize > 0 ? queue.slice(-maxSize) : queue;
			queues.set(threadId, boundedQueue);
			return Promise.resolve(boundedQueue.length);
		},
		extendLock: (lock, ttlMs) => {
			const current = locks.get(lock.threadId);
			const now = getCurrentTime();
			if (!current || current.token !== lock.token) {
				return Promise.resolve(false);
			}
			if (current.expiresAt <= now) {
				locks.delete(lock.threadId);
				return Promise.resolve(false);
			}
			locks.set(lock.threadId, {
				expiresAt: now + ttlMs,
				token: lock.token,
			});
			return Promise.resolve(true);
		},
		forceReleaseLock: (threadId) => {
			locks.delete(threadId);
			return Promise.resolve();
		},
		get: <T>(key: string) =>
			Promise.resolve((cache.get(key) as T | undefined) ?? null),
		getList: <T>(key: string) =>
			Promise.resolve([...(lists.get(key) ?? [])] as T[]),
		isSubscribed: (threadId) => Promise.resolve(subscriptions.has(threadId)),
		queueDepth: (threadId) => {
			const now = getCurrentTime();
			const queue = (queues.get(threadId) ?? []).filter(
				(entry) => entry.expiresAt > now
			);
			queues.set(threadId, queue);
			return Promise.resolve(queue.length);
		},
		releaseLock: (lock) => {
			const current = locks.get(lock.threadId);
			if (current?.token === lock.token) {
				locks.delete(lock.threadId);
			}
			return Promise.resolve();
		},
		set: <T>(key: string, value: T) => {
			cache.set(key, value);
			return Promise.resolve();
		},
		setIfNotExists: (key, value) => {
			if (cache.has(key)) {
				return Promise.resolve(false);
			}
			cache.set(key, value);
			return Promise.resolve(true);
		},
		subscribe: (threadId) => {
			subscriptions.add(threadId);
			return Promise.resolve();
		},
		unsubscribe: (threadId) => {
			subscriptions.delete(threadId);
			return Promise.resolve();
		},
	};
};

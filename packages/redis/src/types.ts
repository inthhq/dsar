import type {
	RateLimitConsumeInput,
	RateLimitConsumeResult,
	RateLimitStore,
} from "@dsar/backend";

/** Minimal Redis client surface required by the DSAR rate-limit store. */
export interface RedisRateLimitClient {
	/** Runs the fixed-window Lua script with one key and numeric arguments. */
	readonly eval: (
		script: string,
		numberOfKeys: number,
		...args: readonly (number | string)[]
	) => Promise<unknown> | unknown;
}

/** Configuration for the Redis-backed rate-limit store. */
export interface RedisRateLimitStoreConfig {
	/** Redis client, usually an `ioredis` instance. */
	readonly client: RedisRateLimitClient;
	/** Optional namespace prefix applied before DSAR counter keys. */
	readonly keyPrefix?: string;
}

export type { RateLimitConsumeInput, RateLimitConsumeResult, RateLimitStore };

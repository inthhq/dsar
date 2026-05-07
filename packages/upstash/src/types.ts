import type {
	RateLimitConsumeInput,
	RateLimitConsumeResult,
	RateLimitStore,
} from "@dsar/backend";

/** Minimal Upstash Redis client surface required by the DSAR rate-limit store. */
export interface UpstashRateLimitClient {
	/** Runs the fixed-window Lua script with one key and numeric arguments. */
	readonly eval: (
		script: string,
		keys: readonly string[],
		args: readonly (number | string)[]
	) => Promise<unknown> | unknown;
}

/** Configuration for the Upstash-backed rate-limit store. */
export interface UpstashRateLimitStoreConfig {
	/** Upstash Redis client, usually `Redis.fromEnv()` output. */
	readonly client: UpstashRateLimitClient;
	/** Optional namespace prefix applied before DSAR counter keys. */
	readonly keyPrefix?: string;
}

export type { RateLimitConsumeInput, RateLimitConsumeResult, RateLimitStore };

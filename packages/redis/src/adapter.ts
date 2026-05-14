import type {
	RateLimitConsumeInput,
	RateLimitConsumeResult,
	RateLimitStore,
	RedisRateLimitStoreConfig,
} from "./types";

const DEFAULT_KEY_PREFIX = "dsar:rate-limit";

/** Lua script implementing one atomic fixed-window consume operation. */
const FIXED_WINDOW_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local current = redis.call("GET", key)

if not current then
	redis.call("SET", key, "1", "PX", window_ms)
	return { 1, limit, limit - 1, now_ms + window_ms }
end

local count = tonumber(current)
local ttl = redis.call("PTTL", key)

if ttl < 0 then
	ttl = window_ms
	redis.call("PEXPIRE", key, window_ms)
end

local reset_at_ms = now_ms + ttl

if count >= limit then
	return { 0, limit, 0, reset_at_ms }
end

count = redis.call("INCR", key)
return { 1, limit, math.max(limit - count, 0), reset_at_ms }
`;

const prefixedKey = (prefix: string | undefined, key: string): string => {
	const resolvedPrefix = prefix ?? DEFAULT_KEY_PREFIX;
	if (resolvedPrefix.length === 0) {
		return key;
	}
	return `${resolvedPrefix.replace(/:+$/u, "")}:${key}`;
};

const readNumber = (value: unknown, fallback: number): number => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
};

const parseRedisEvalResult = (
	result: unknown,
	input: RateLimitConsumeInput
): RateLimitConsumeResult => {
	if (!Array.isArray(result)) {
		return {
			allowed: true,
			limit: input.limit,
			remaining: Math.max(0, input.limit - 1),
			resetAtMs: input.nowMs + input.windowMs,
		};
	}
	const [allowedValue, limitValue, remainingValue, resetAtMsValue] = result;
	const limit = readNumber(limitValue, input.limit);
	const remaining = readNumber(remainingValue, Math.max(0, input.limit - 1));
	const resetAtMs = readNumber(resetAtMsValue, input.nowMs + input.windowMs);
	return {
		allowed:
			allowedValue === 1 || allowedValue === "1" || allowedValue === true,
		limit,
		remaining: Math.max(0, Math.floor(remaining)),
		resetAtMs,
	};
};

/**
 * Creates a Redis-backed fixed-window rate-limit store.
 *
 * @param config - Redis client and optional key namespace.
 * @returns Store compatible with `RuntimeRateLimitConfig.store`.
 */
export const makeRedisRateLimitStore = (
	config: RedisRateLimitStoreConfig
): RateLimitStore => ({
	consume: async (input) => {
		const result = await config.client.eval(
			FIXED_WINDOW_SCRIPT,
			1,
			prefixedKey(config.keyPrefix, input.key),
			input.limit,
			input.windowMs,
			input.nowMs
		);
		return parseRedisEvalResult(result, input);
	},
});

export { FIXED_WINDOW_SCRIPT as redisRateLimitFixedWindowScript };

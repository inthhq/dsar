import { errorEnvelope } from "./types/envelope";
import { backendErrorCatalogByCode } from "./types/error-codes";
import type { RuntimeConfig, RuntimeServices } from "./types/runtime";

/** Scope used to isolate an intake rate-limit counter. */
export type RateLimitScope = "ip" | "tenant";

/** Runtime configuration for one fixed-window rate-limit rule. */
export interface RateLimitRuleConfig {
	/** Enables or disables this rule. */
	readonly enabled?: boolean;
	/** Maximum number of requests allowed in the window. */
	readonly limit?: number;
	/** Fixed-window duration in milliseconds. */
	readonly windowMs?: number;
	/** Counter strategy. Currently only fixed-window counters are supported. */
	readonly strategy?: "fixed_window";
}

/** Input passed to a rate-limit store when consuming one request. */
export interface RateLimitConsumeInput {
	/** Fully scoped counter key. */
	readonly key: string;
	/** Maximum number of requests allowed in the window. */
	readonly limit: number;
	/** Current timestamp in milliseconds since the Unix epoch. */
	readonly nowMs: number;
	/** Fixed-window duration in milliseconds. */
	readonly windowMs: number;
}

/** Result returned by a rate-limit store after consuming one request. */
export interface RateLimitConsumeResult {
	/** Whether the request is allowed to continue. */
	readonly allowed: boolean;
	/** Maximum number of requests allowed in the window. */
	readonly limit: number;
	/** Number of requests remaining in the active window. */
	readonly remaining: number;
	/** Timestamp in milliseconds when the active window resets. */
	readonly resetAtMs: number;
}

/** Store contract used by runtime rate-limit enforcement. */
export interface RateLimitStore {
	/** Consumes one request from the counter identified by `input.key`. */
	readonly consume: (
		input: RateLimitConsumeInput
	) => Promise<RateLimitConsumeResult> | RateLimitConsumeResult;
}

/** Event emitted when a public intake request exceeds a rate limit. */
export interface RateLimitExceededEvent {
	/** Fully scoped counter key that exceeded its limit. */
	readonly key: string;
	/** Maximum number of requests allowed in the window. */
	readonly limit: number;
	/** Runtime request correlation identifier. */
	readonly requestId: string;
	/** Seconds callers should wait before retrying. */
	readonly retryAfterSeconds: number;
	/** Route whose public intake counter was exceeded. */
	readonly route: {
		readonly method: string;
		readonly path: string;
	};
	/** Counter scope that rejected the request. */
	readonly scope: RateLimitScope;
	/** Tenant id for tenant-scoped limit events. */
	readonly tenantId?: string;
	/** Fixed-window duration in milliseconds. */
	readonly windowMs: number;
}

/** Runtime rate-limit configuration for public intake endpoints. */
export interface RuntimeRateLimitConfig {
	/** Optional resolver for the client IP used by IP-scoped counters. */
	readonly getClientIp?: (request: Request) => string | undefined;
	/** Public intake rate-limit rules. */
	readonly intake?: {
		readonly enabled?: boolean;
		readonly ip?: RateLimitRuleConfig;
		readonly tenant?: RateLimitRuleConfig;
	};
	/** Optional observer called when a limit rejects a request. */
	readonly onLimitExceeded?: (
		event: RateLimitExceededEvent
	) => Promise<void> | void;
	/** Store used to consume rate-limit counters. */
	readonly store?: RateLimitStore;
}

interface RateLimitWindow {
	count: number;
	resetAtMs: number;
}

const DEFAULT_IP_LIMIT = 60;
const DEFAULT_TENANT_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;

const defaultRule = (limit: number): Required<RateLimitRuleConfig> => ({
	enabled: true,
	limit,
	strategy: "fixed_window",
	windowMs: DEFAULT_WINDOW_MS,
});

const normalizePositiveInteger = (
	value: number | undefined,
	fallback: number
): number =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: fallback;

const normalizeRule = (
	input: RateLimitRuleConfig | undefined,
	fallback: Required<RateLimitRuleConfig>
): Required<RateLimitRuleConfig> => ({
	enabled: input?.enabled ?? fallback.enabled,
	limit: normalizePositiveInteger(input?.limit, fallback.limit),
	strategy: "fixed_window",
	windowMs: normalizePositiveInteger(input?.windowMs, fallback.windowMs),
});

/**
 * Creates an in-memory fixed-window rate-limit store.
 *
 * @returns Store suitable for development, tests, and single-process runtimes.
 */
export const createMemoryRateLimitStore = (): RateLimitStore => {
	const windows = new Map<string, RateLimitWindow>();
	return {
		consume: (input) => {
			const current = windows.get(input.key);
			if (!current || current.resetAtMs <= input.nowMs) {
				const resetAtMs = input.nowMs + input.windowMs;
				windows.set(input.key, {
					count: 1,
					resetAtMs,
				});
				return {
					allowed: true,
					limit: input.limit,
					remaining: Math.max(0, input.limit - 1),
					resetAtMs,
				};
			}
			if (current.count >= input.limit) {
				return {
					allowed: false,
					limit: input.limit,
					remaining: 0,
					resetAtMs: current.resetAtMs,
				};
			}
			current.count += 1;
			return {
				allowed: true,
				limit: input.limit,
				remaining: Math.max(0, input.limit - current.count),
				resetAtMs: current.resetAtMs,
			};
		},
	};
};

/**
 * Applies runtime defaults to partial rate-limit configuration.
 *
 * @param input - Optional runtime rate-limit configuration.
 * @returns Fully normalized runtime rate-limit configuration.
 */
export const resolveRuntimeRateLimitConfig = (
	input: RuntimeRateLimitConfig | undefined
): RuntimeRateLimitConfig => ({
	getClientIp: input?.getClientIp,
	intake: {
		enabled: input?.intake?.enabled ?? true,
		ip: normalizeRule(input?.intake?.ip, defaultRule(DEFAULT_IP_LIMIT)),
		tenant: normalizeRule(
			input?.intake?.tenant,
			defaultRule(DEFAULT_TENANT_LIMIT)
		),
	},
	onLimitExceeded: input?.onLimitExceeded,
	store: input?.store ?? createMemoryRateLimitStore(),
});

const firstForwardedIp = (value: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	const [first] = value.split(",");
	const trimmed = first?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const resolveClientIp = (
	request: Request,
	config: RuntimeRateLimitConfig
): string => {
	const custom = config.getClientIp?.(request)?.trim();
	if (custom && custom.length > 0) {
		return custom;
	}
	return (
		firstForwardedIp(request.headers.get("x-forwarded-for")) ??
		request.headers.get("x-real-ip")?.trim() ??
		"unknown"
	);
};

const retryAfterSeconds = (input: {
	readonly nowMs: number;
	readonly resetAtMs: number;
}): number => Math.max(1, Math.ceil((input.resetAtMs - input.nowMs) / 1000));

const rateLimitResponse = (retryAfter: number): Response => {
	const entry = backendErrorCatalogByCode.REQUEST_RATE_LIMITED;
	return new Response(
		JSON.stringify(
			errorEnvelope({
				code: entry.code,
				docsUrl: entry.docsUrl,
				id: entry.id,
				message: entry.title,
				status: entry.status,
			})
		),
		{
			headers: {
				"content-type": "application/json",
				"retry-after": retryAfter.toString(),
			},
			status: entry.status,
		}
	);
};

const emitLimitExceeded = async (
	config: RuntimeRateLimitConfig,
	event: RateLimitExceededEvent
): Promise<void> => {
	await config.onLimitExceeded?.(event);
};

const consumeRule = async (input: {
	readonly config: RuntimeRateLimitConfig;
	readonly key: string;
	readonly requestId: string;
	readonly route: { readonly method: string; readonly path: string };
	readonly rule: Required<RateLimitRuleConfig>;
	readonly scope: RateLimitScope;
	readonly tenantId?: string;
}): Promise<Response | undefined> => {
	const nowMs = Date.now();
	const result = await input.config.store?.consume({
		key: input.key,
		limit: input.rule.limit,
		nowMs,
		windowMs: input.rule.windowMs,
	});
	if (!result?.allowed) {
		const retryAfter = retryAfterSeconds({
			nowMs,
			resetAtMs: result?.resetAtMs ?? nowMs + input.rule.windowMs,
		});
		await emitLimitExceeded(input.config, {
			key: input.key,
			limit: input.rule.limit,
			requestId: input.requestId,
			retryAfterSeconds: retryAfter,
			route: input.route,
			scope: input.scope,
			tenantId: input.tenantId,
			windowMs: input.rule.windowMs,
		});
		return rateLimitResponse(retryAfter);
	}
	return undefined;
};

const shouldLimitIntake = (
	config: RuntimeRateLimitConfig | undefined
): config is RuntimeRateLimitConfig => config?.intake?.enabled !== false;

/**
 * Enforces the IP-scoped public intake rate-limit rule for one route.
 *
 * @param input - Request, route, runtime config, and request id.
 * @returns A 429 response when limited, otherwise `undefined`.
 */
export const enforceIntakeIpRateLimit = async (input: {
	readonly config: RuntimeConfig;
	readonly request: Request;
	readonly requestId: string;
	readonly route: { readonly method: string; readonly path: string };
}): Promise<Response | undefined> => {
	const { rateLimit } = input.config;
	if (!shouldLimitIntake(rateLimit)) {
		return undefined;
	}
	const rule = rateLimit.intake?.ip;
	if (!rule?.enabled) {
		return undefined;
	}
	const clientIp = resolveClientIp(input.request, rateLimit);
	return await consumeRule({
		config: rateLimit,
		key: `intake:ip:${input.route.method}:${input.route.path}:${clientIp}`,
		requestId: input.requestId,
		route: input.route,
		rule: rule as Required<RateLimitRuleConfig>,
		scope: "ip",
	});
};

/**
 * Enforces the tenant-scoped public intake rate-limit rule for one route.
 *
 * @param input - Request, route, runtime services, and normalized tenant id.
 * @returns A 429 response when limited, otherwise `undefined`.
 */
export const enforceIntakeTenantRateLimit = async (input: {
	readonly request: Request;
	readonly route: { readonly method: string; readonly path: string };
	readonly services: RuntimeServices;
	readonly tenantId: string;
}): Promise<Response | undefined> => {
	const {
		config: { rateLimit },
	} = input.services;
	if (!shouldLimitIntake(rateLimit)) {
		return undefined;
	}
	const rule = rateLimit.intake?.tenant;
	if (!rule?.enabled) {
		return undefined;
	}
	return await consumeRule({
		config: rateLimit,
		key: `intake:tenant:${input.route.method}:${input.route.path}:${input.tenantId}`,
		requestId: input.services.requestContext.requestId,
		route: input.route,
		rule: rule as Required<RateLimitRuleConfig>,
		scope: "tenant",
		tenantId: input.tenantId,
	});
};

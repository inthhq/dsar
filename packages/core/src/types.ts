import type {
	DsarResult,
	InitResponse,
	NodeSdkClient,
	NodeSdkConfig,
	StatusResponse,
} from "@dsar/node-sdk";

/**
 * Runtime mode selected for core client execution.
 */
export type CoreClientMode = "managed" | "self-hosted" | "custom" | "offline";

/**
 * Shared optional configuration fields supported across all core client modes.
 */
export interface CoreCommonConfig {
	/** Enables AI-assisted pathways when supported by backend/runtime. */
	readonly aiEnabled?: boolean;
	/** Optional fetch implementation for host/runtime portability. */
	readonly fetch?: typeof fetch;
	/** Max retries for transient HTTP failures in managed modes. */
	readonly retryMaxAttempts?: number;
	/** Request timeout budget in milliseconds. */
	readonly timeoutMs?: number;
	/** Bearer token used for authenticated DSAR API access. */
	readonly token?: string;
}

/**
 * Managed cloud mode configuration.
 */
export interface ManagedCoreClientConfig extends CoreCommonConfig {
	/** Optional managed API base URL override. */
	readonly baseUrl?: string;
	/** Selects hosted managed runtime mode. */
	readonly mode: "managed";
}

/**
 * Self-hosted deployment mode configuration.
 */
export interface SelfHostedCoreClientConfig extends CoreCommonConfig {
	/** Optional self-hosted API base URL override. */
	readonly baseUrl?: string;
	/** Selects self-hosted runtime mode. */
	readonly mode: "self-hosted";
}

/**
 * Invocation envelope passed to custom/offline runtime handlers.
 */
export interface CoreInvocation {
	/** Invocation arguments passed to custom/offline handlers. */
	readonly args: readonly unknown[];
	/** Runtime mode origin for this invocation. */
	readonly mode: "custom" | "offline";
	/** Endpoint path segments being invoked. */
	readonly path: readonly string[];
}

/**
 * User-provided function used to resolve responses in custom mode.
 */
export type CoreCustomHandler = (
	invocation: CoreInvocation
) => Promise<unknown> | unknown;

/**
 * Custom mode configuration that routes calls through a user handler.
 */
export interface CustomCoreClientConfig extends CoreCommonConfig {
	/** Optional cache identity override for custom-mode client reuse. */
	readonly cacheKey?: string;
	/** Handler implementing custom invocation behavior. */
	readonly handler: CoreCustomHandler;
	/** Selects custom runtime mode. */
	readonly mode: "custom";
}

/**
 * Optional offline responses used by fixtures-based runtime mode.
 */
export interface OfflineFixtures {
	/** Fallback value/function for unknown offline invocations. */
	readonly fallback?: unknown | ((invocation: CoreInvocation) => unknown);
	/** Optional canned response for init endpoint calls. */
	readonly init?: InitResponse;
	/** Optional canned response for status endpoint calls. */
	readonly status?: StatusResponse;
}

/**
 * Offline mode configuration for deterministic/local SDK responses.
 */
export interface OfflineCoreClientConfig extends CoreCommonConfig {
	/** Optional cache identity override for fixture sets. */
	readonly cacheKey?: string;
	/** Optional fixture map used to emulate backend behavior offline. */
	readonly fixtures?: OfflineFixtures;
	/** Selects offline runtime mode. */
	readonly mode: "offline";
}

/**
 * Union of accepted client configuration variants before default resolution.
 */
export type CoreClientConfig =
	| ManagedCoreClientConfig
	| SelfHostedCoreClientConfig
	| CustomCoreClientConfig
	| OfflineCoreClientConfig;

/**
 * Fully resolved core config where runtime defaults have been applied.
 */
export type ResolvedCoreClientConfig =
	| (ManagedCoreClientConfig & {
			readonly aiEnabled: boolean;
			readonly baseUrl: string;
	  })
	| (SelfHostedCoreClientConfig & {
			readonly aiEnabled: boolean;
			readonly baseUrl: string;
	  })
	| (CustomCoreClientConfig & { readonly aiEnabled: boolean })
	| (OfflineCoreClientConfig & { readonly aiEnabled: boolean });

/**
 * Core client surface that exposes mode metadata and an initialized node-sdk instance.
 */
export interface CoreClient {
	/** Indicates whether AI-assisted behavior is active for this client. */
	readonly aiEnabled: boolean;
	/** Active runtime mode used by this client instance. */
	readonly mode: CoreClientMode;
	/** Underlying node-sdk client surface used for API operations. */
	readonly sdk: NodeSdkClient;
}

/**
 * Narrowed config variant for managed/self-hosted HTTP-backed modes.
 */
export type HttpBackedCoreConfig = Extract<
	ResolvedCoreClientConfig,
	{ readonly mode: "managed" | "self-hosted" }
>;

/**
 * Re-exported node-sdk configuration type used by core wrappers.
 */
export type CoreNodeSdkConfig = NodeSdkConfig;

/**
 * Re-exported DSAR API result envelope used by core wrappers.
 *
 * @typeParam T - The response-data payload type contained in the
 *   success envelope (e.g. a request record or status object).
 */
export type CoreResult<T> = DsarResult<T>;

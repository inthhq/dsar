import type { PersistenceService } from "@dsar/persistence";
import * as ServiceMap from "effect/ServiceMap";

import type {
	AdapterOperationalEvent,
	AdapterRegistryService,
	InboundAdapterContract,
	NotificationAdapterContract,
	StorageAdapterContract,
} from "../adapters";

/**
 * Workspace-level notification policy controlling built-in email delivery.
 */
export interface OutboundResendWorkspacePolicy {
	/** Enables built-in email notifications for this workspace scope. */
	readonly enabled?: boolean;
	/** Fallback mailbox used when a request-specific recipient is unavailable. */
	readonly fallbackRecipient?: string;
}

/**
 * Tenant-level notification policy with optional per-workspace overrides.
 */
export interface OutboundResendTenantPolicy extends OutboundResendWorkspacePolicy {
	/** Optional per-workspace policy overrides within the tenant. */
	readonly workspaces?: Readonly<Record<string, OutboundResendWorkspacePolicy>>;
}

/**
 * Top-level outbound Resend policy configuration with global defaults and
 * optional tenant-scoped overrides.
 */
export interface OutboundResendPolicyConfig extends OutboundResendWorkspacePolicy {
	/** Tenant-scoped notification policies keyed by tenant id. */
	readonly tenants?: Readonly<Record<string, OutboundResendTenantPolicy>>;
}

/**
 * Verified caller identity resolved from bearer auth or another trusted source.
 */
export type RequestPrincipalKind = "operator" | "service" | "subject";

/**
 * Verified caller identity resolved from bearer auth or another trusted source.
 */
export interface AuthenticatedRequestIdentity {
	/** Stable actor identifier used for audit trails and role checks. */
	readonly actorId: string;
	/** Coarse-grained principal kind used for route audience enforcement. */
	readonly principalKind?: RequestPrincipalKind;
	/** Optional role claim attached to the authenticated actor. */
	readonly role?: string;
	/** Optional email claim for subject-facing experiences. */
	readonly email?: string;
	/** Tenant scope bound to the verified identity. */
	readonly tenantId?: string;
	/** Optional workspace scope bound to the verified identity. */
	readonly workspaceId?: string;
}

/**
 * Runtime auth configuration for protected DSAR endpoints.
 */
export interface RuntimeAuthConfig {
	/**
	 * Static bearer-token map for local development, tests, and simple hosts.
	 */
	readonly staticBearerTokens?: Readonly<
		Record<string, AuthenticatedRequestIdentity>
	>;
	/**
	 * Optional custom bearer-token resolver for integrating a real identity
	 * provider or API gateway verification layer.
	 */
	readonly resolveBearerToken?: (input: {
		readonly request: Request;
		readonly token: string;
	}) =>
		| AuthenticatedRequestIdentity
		| null
		| undefined
		| Promise<AuthenticatedRequestIdentity | null | undefined>;
	/**
	 * Optional trusted request resolver used by host applications that
	 * authenticate the caller before DSAR receives the request.
	 */
	readonly resolveTrustedRequestIdentity?: (input: {
		readonly request: Request;
	}) =>
		| AuthenticatedRequestIdentity
		| null
		| undefined
		| Promise<AuthenticatedRequestIdentity | null | undefined>;
}

/**
 * Runtime-level feature/config toggles shared by all route handlers.
 */
export interface RuntimeConfig {
	/** Active runtime environment used for behavior toggles and diagnostics. */
	readonly environment: "development" | "test" | "production";
	/** Enables fulfilment-manifest review gate behavior when true. */
	readonly enableManifestReview: boolean;
	/** Default locale used for notification template/context payloads. */
	readonly defaultLocale: string;
	/** Enables optional AI-assisted paths when true. */
	readonly aiEnabled: boolean;
	/** Optional tenant webhook configuration for outbound notifications. */
	readonly notificationWebhook?: {
		/** Stable endpoint id used for signing-key persistence and rotation. */
		readonly endpointId?: string;
		/** Webhook endpoint receiving outbound lifecycle notification events. */
		readonly url: string;
		/** Shared secret used to sign outbound webhook payloads. */
		readonly signingSecret: string;
		/** Marks the webhook config as resolved for the active tenant scope. */
		readonly tenantScoped?: boolean;
		/** Maximum attempts before webhook delivery is marked failed. */
		readonly retryMaxAttempts: number;
		/** Delay between webhook retry attempts to reduce burst pressure. */
		readonly retryDelayMs: number;
		/** Per-attempt timeout to prevent hanging delivery workers. */
		readonly timeoutMs: number;
		/** When true, suppresses built-in email delivery in favor of webhooks only. */
		readonly disableBuiltInEmail?: boolean;
	};
	/** Optional policy configuration for built-in outbound-resend notifications. */
	readonly outboundResend?: OutboundResendPolicyConfig;
	/** Optional observer for adapter failure/degradation events. */
	readonly onAdapterEvent?: (
		event: AdapterOperationalEvent
	) => Promise<void> | void;
	/** Auth and identity resolution used by protected endpoints. */
	readonly auth?: RuntimeAuthConfig;
}

export type {
	NotificationDispatchInput,
	NotificationDispatchResult,
} from "../adapters";

/**
 * Runtime adapter binding that accepts either one adapter or several adapters
 * for the same capability, while preserving the legacy `"stub"` placeholder.
 *
 * @typeParam TAdapter - Concrete adapter contract type allowed for the binding.
 */
export type RuntimeAdapterBinding<TAdapter> =
	| TAdapter
	| readonly TAdapter[]
	| "stub";

/**
 * Runtime repository contracts used by backend handlers.
 */
export interface RuntimeRepos {
	/** Tenant-safe persistence service from `@dsar/persistence`. */
	readonly persistence: PersistenceService;
}

/**
 * Adapter contract placeholders resolved through runtime context.
 */
export interface RuntimeAdapters {
	/** Notification adapter binding (stub in T05). */
	readonly notifications: RuntimeAdapterBinding<NotificationAdapterContract>;
	/** Artifact storage adapter binding (stub in T05/T15). */
	readonly storage: RuntimeAdapterBinding<StorageAdapterContract>;
	/** Inbound adapter binding (stub in T15). */
	readonly inbound?: RuntimeAdapterBinding<InboundAdapterContract>;
}

/**
 * Authenticated actor identity used for protected routes.
 */
export interface RequestActor {
	/** Stable actor identifier from request auth/context middleware. */
	readonly id: string;
	/** Coarse-grained principal kind used for route audience enforcement. */
	readonly principalKind: RequestPrincipalKind;
	/** Simple role claim derived from request headers. */
	readonly role: string;
	/** Optional email claim carried by the verified identity. */
	readonly email?: string;
}

/**
 * Per-request values injected into Effect services.
 */
export interface RuntimeRequestContext {
	/** Request correlation identifier for tracing and logs. */
	readonly requestId: string;
	/** Authenticated actor for protected routes, if available. */
	readonly actor?: RequestActor;
	/** Tenant scope attached to the authenticated or trusted caller. */
	readonly tenantId?: string;
	/** Workspace scope attached to the authenticated or trusted caller. */
	readonly workspaceId?: string;
}

/**
 * Shared services available to route Effect programs.
 */
export interface RuntimeServices {
	/** Runtime configuration resolved for this handler execution. */
	readonly config: RuntimeConfig;
	/** Repository layer references used by route effects. */
	readonly repos: RuntimeRepos;
	/** Adapter layer references used by route effects. */
	readonly adapters: RuntimeAdapters;
	/** Adapter registry built from runtime adapter bindings. */
	readonly adapterRegistry: AdapterRegistryService;
	/** Per-request values injected by middleware/runtime boundary. */
	readonly requestContext: RuntimeRequestContext;
}

/**
 * Effect service tag used to provide runtime services to handlers.
 */
export class RuntimeServicesTag extends ServiceMap.Service<
	RuntimeServicesTag,
	RuntimeServices
>()("RuntimeServices") {}

/**
 * Partial configuration options without persistence – used by config files
 * that supply persistence separately at server startup.
 */
export type DsarConfigOptions = Omit<DsarInstanceOptions, "repos">;

/**
 * Runtime factory options for mount/basePath and dependency overrides.
 */
export interface DsarInstanceOptions {
	/** Optional mount prefix, e.g. `/api/v1`. */
	readonly basePath?: string;
	/** Runtime configuration overrides merged with defaults. */
	readonly config?: Partial<RuntimeConfig>;
	/** Repository bindings including required persistence layer. */
	readonly repos: Pick<RuntimeRepos, "persistence"> &
		Partial<Omit<RuntimeRepos, "persistence">>;
	/** Adapter overrides for custom host wiring. */
	readonly adapters?: Partial<RuntimeAdapters>;
}

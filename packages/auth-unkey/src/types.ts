import type { Unkey } from "@unkey/api";

/**
 * Principal kinds supported by DSAR request authorization.
 */
export type DsarPrincipalKind = "operator" | "service" | "subject";

/**
 * DSAR identity projected from a verified Unkey API key.
 */
export interface DsarResolvedIdentity {
	/** Stable DSAR actor identifier used for audit and authorization. */
	readonly actorId: string;
	/** Optional coarse-grained principal kind used for route audience checks. */
	readonly principalKind?: DsarPrincipalKind;
	/** Optional DSAR role mapped from the verified key. */
	readonly role?: string;
	/** Optional email claim attached to the resolved identity. */
	readonly email?: string;
	/** Tenant boundary required for protected DSAR routes. */
	readonly tenantId?: string;
	/** Optional workspace scope attached to the verified identity. */
	readonly workspaceId?: string;
}

/**
 * Minimal verification result shape consumed from the Unkey SDK.
 */
export interface UnkeyVerifyResultShape {
	/** Response metadata returned by Unkey verification. */
	readonly meta?: unknown;
	/** Verification payload returned by Unkey. */
	readonly data?: unknown;
}

/**
 * Minimal client surface required to verify keys with Unkey.
 */
export interface UnkeyBearerResolverClient {
	/** Unkey key-verification API group. */
	readonly keys: Pick<Unkey["keys"], "verifyKey">;
}

/**
 * Configuration used to build a DSAR-compatible Unkey bearer resolver.
 */
export interface UnkeyBearerResolverConfig {
	/** Root key used to construct the default Unkey client when `client` is absent. */
	readonly rootKey?: string;
	/** Optional preconfigured Unkey client, useful for dependency injection and tests. */
	readonly client?: UnkeyBearerResolverClient;
	/** Optional permission expression required during key verification. */
	readonly permissions?: string;
	/** Default principal kind when Unkey metadata does not provide one. */
	readonly fallbackPrincipalKind?: DsarPrincipalKind;
	/** Default role when Unkey metadata and roles do not provide one. */
	readonly fallbackRole?: string;
	/** Optional metadata key overrides used when mapping Unkey metadata into DSAR identity fields. */
	readonly metadataKeys?: {
		/** Metadata key holding the tenant identifier. */
		readonly tenantId?: string;
		/** Metadata key holding the workspace identifier. */
		readonly workspaceId?: string;
		/** Metadata key holding the DSAR role. */
		readonly role?: string;
		/** Metadata key holding the DSAR principal kind. */
		readonly principalKind?: string;
		/** Metadata key holding the email claim. */
		readonly email?: string;
	};
	/** Optional host override for custom identity projection from a verified key result. */
	readonly mapIdentity?: (input: {
		readonly request: Request;
		readonly token: string;
		readonly result: UnkeyVerifyResultShape;
		readonly defaultIdentity: DsarResolvedIdentity | null;
	}) =>
		| DsarResolvedIdentity
		| null
		| undefined
		| Promise<DsarResolvedIdentity | null | undefined>;
}

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";

import { resolvePersistenceErrorCatalogEntry } from "../types/error-codes";
import { MissingTenantScopeError } from "../types/errors";

const PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY =
	resolvePersistenceErrorCatalogEntry("PERSISTENCE_TENANT_SCOPE_MISSING");

/**
 * Required tenant context for all persistence operations.
 */
export interface TenantContextShape {
	/** Tenant identifier used to scope every query/write. */
	readonly tenantId: string;
}

/**
 * Effect service tag for tenant scope propagation.
 */
export class TenantContext extends ServiceMap.Service<
	TenantContext,
	TenantContextShape
>()("TenantContext") {}

/**
 * Provides {@link TenantContext} to an Effect program so that every
 * persistence operation downstream is scoped to the given tenant.
 *
 * @param tenantId - Non-empty string that uniquely identifies the tenant.
 *   Typically a UUID or slug supplied by the caller at the API boundary.
 * @returns A function that removes the {@link TenantContext} requirement
 *   from an effect's environment, equivalent to
 *   `Effect.provideService(TenantContext, …)`.
 */
export const withTenant = (tenantId: string) =>
	Effect.provideService(TenantContext, { tenantId });

/**
 * Extracts tenant id from Effect context and fails closed when missing.
 */
export const requireTenantId: Effect.Effect<string, MissingTenantScopeError> =
	Effect.serviceOption(TenantContext).pipe(
		Effect.flatMap((contextOption) =>
			Option.match(contextOption, {
				onNone: () =>
					Effect.fail(
						new MissingTenantScopeError({
							code: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.code,
							docsUrl: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.docsUrl,
							errorId: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.id,
							operation: "tenant_scope_lookup",
						})
					),
				onSome: (context) =>
					context.tenantId.length === 0
						? Effect.fail(
								new MissingTenantScopeError({
									code: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.code,
									docsUrl: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.docsUrl,
									errorId: PERSISTENCE_TENANT_SCOPE_MISSING_ENTRY.id,
									operation: "tenant_scope_lookup",
								})
							)
						: Effect.succeed(context.tenantId),
			})
		)
	);

import { PolicyPacksLive } from "@dsar/policy-packs";
import * as Layer from "effect/Layer";

import type { AnyAdapterContract, AdapterRegistryService } from "./adapters";
import { makeAdapterRegistry } from "./adapters";
import { LegalClockLive } from "./services/legal-clock/service";
import type {
	RuntimeAdapters,
	RuntimeConfig,
	RuntimeRepos,
	RuntimeRequestContext,
	RuntimeServices,
} from "./types/runtime";
import { RuntimeServicesTag } from "./types/runtime";

const defaultConfig: RuntimeConfig = {
	aiEnabled: false,
	defaultLocale: "en-GB",
	enableManifestReview: true,
	environment: "development",
	outboundResend: {
		enabled: true,
	},
};

const defaultAdapters: RuntimeAdapters = {
	inbound: "stub",
	notifications: "stub",
	storage: "stub",
};

const toArray = <T>(
	adapter: T | readonly T[] | "stub" | undefined
): readonly T[] => {
	if (adapter === "stub") {
		return [];
	}
	if (adapter === undefined) {
		return [];
	}
	if (Array.isArray(adapter)) {
		return adapter;
	}
	return [adapter] as readonly T[];
};

const asAdapterContracts = (
	adapters: RuntimeAdapters
): readonly AnyAdapterContract[] => {
	const contracts: AnyAdapterContract[] = [];
	for (const notifications of toArray(adapters.notifications)) {
		contracts.push(notifications);
	}
	for (const storage of toArray(adapters.storage)) {
		contracts.push(storage);
	}
	for (const inbound of toArray(adapters.inbound)) {
		contracts.push(inbound);
	}
	return contracts;
};

/**
 * Core infrastructure module: resolved config and persistence repos.
 */
export interface CoreModule {
	/** Resolved runtime configuration with defaults applied. */
	readonly config: RuntimeConfig;
	/** Persistence and data-access repositories. */
	readonly repos: RuntimeRepos;
}

/**
 * Adapter module: adapter bindings and their consolidated registry.
 */
export interface AdapterModule {
	/** Resolved adapter bindings for each capability slot. */
	readonly adapters: RuntimeAdapters;
	/** Consolidated adapter registry built from the resolved bindings. */
	readonly adapterRegistry: AdapterRegistryService;
}

/**
 * Builds the core infrastructure module from partial options.
 *
 * @param options - Partial config overrides and required persistence repos.
 * @returns Fully resolved {@link CoreModule} with defaults applied.
 */
export const makeCoreModule = (options: {
	readonly config?: Partial<RuntimeConfig>;
	readonly repos: Pick<RuntimeRepos, "persistence"> &
		Partial<Omit<RuntimeRepos, "persistence">>;
}): CoreModule => {
	const mergedConfig = { ...defaultConfig, ...options.config };
	return {
		config: {
			...mergedConfig,
			auth: mergedConfig.auth
				? {
						resolveBearerToken: mergedConfig.auth.resolveBearerToken,
						resolveTrustedRequestIdentity:
							mergedConfig.auth.resolveTrustedRequestIdentity,
						staticBearerTokens: mergedConfig.auth.staticBearerTokens,
					}
				: undefined,
		},
		repos: { ...options.repos },
	};
};

/**
 * Builds the adapter module from partial options.
 *
 * @param adapters - Optional partial adapter overrides merged with stub defaults.
 * @returns Resolved {@link AdapterModule} with a consolidated registry.
 */
export const makeAdapterModule = (
	adapters?: Partial<RuntimeAdapters>
): AdapterModule => {
	const resolved: RuntimeAdapters = { ...defaultAdapters, ...adapters };
	return {
		adapterRegistry: makeAdapterRegistry(asAdapterContracts(resolved)),
		adapters: resolved,
	};
};

/**
 * Composes core and adapter modules with per-request context into
 * the unified `RuntimeServices` bag.
 *
 * @param core - Resolved core infrastructure module.
 * @param adapter - Resolved adapter module with registry.
 * @param requestContext - Per-request context (actor, tenant, trace).
 * @returns Unified {@link RuntimeServices} bag ready for handler injection.
 */
export const buildRuntimeServices = (
	core: CoreModule,
	adapter: AdapterModule,
	requestContext: RuntimeRequestContext
): RuntimeServices => ({
	adapterRegistry: adapter.adapterRegistry,
	adapters: adapter.adapters,
	config: core.config,
	repos: core.repos,
	requestContext,
});

/**
 * Creates a Layer providing RuntimeServicesTag from pre-built modules
 * and a per-request context. Useful for test setups that compose
 * modules independently.
 *
 * @param core - Resolved core infrastructure module.
 * @param adapter - Resolved adapter module with registry.
 * @param requestContext - Per-request context (actor, tenant, trace).
 * @returns An Effect `Layer` that provides {@link RuntimeServicesTag}.
 */
export const makeRuntimeServicesLayer = (
	core: CoreModule,
	adapter: AdapterModule,
	requestContext: RuntimeRequestContext
): Layer.Layer<RuntimeServicesTag> =>
	Layer.succeed(RuntimeServicesTag)(
		buildRuntimeServices(core, adapter, requestContext)
	);

/**
 * Policy module re-exported for composable layer usage.
 * Use `Effect.provide(PolicyModule)` for policy-dependent effects.
 */
export { PolicyPacksLive as PolicyModule } from "@dsar/policy-packs";

/**
 * Legal clock module re-exported for composable layer usage.
 */
export { LegalClockLive as LegalClockModule } from "./services/legal-clock/service";

/**
 * Composed application layer merging all feature modules.
 * Individual modules can be swapped in tests by providing
 * replacements before this layer.
 */
export const AppModules = Layer.mergeAll(LegalClockLive, PolicyPacksLive);

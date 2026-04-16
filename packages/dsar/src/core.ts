export { buildCoreClient } from "@dsar/core/client";
export { resolveCoreConfig } from "@dsar/core/config";
export { getCoreClientRegistryKey } from "@dsar/core/registry";
export {
	CoreClientFactory,
	CoreClientFactoryCached,
	CoreClientFactoryLive,
} from "@dsar/core/service";
export type { CoreClientFactoryService } from "@dsar/core/service";
export type {
	CoreClient,
	CoreClientConfig,
	CoreClientMode,
	CoreCustomHandler,
	CoreInvocation,
	CustomCoreClientConfig,
	HttpBackedCoreConfig,
	ManagedCoreClientConfig,
	OfflineCoreClientConfig,
	OfflineFixtures,
	ResolvedCoreClientConfig,
	SelfHostedCoreClientConfig,
} from "@dsar/core";

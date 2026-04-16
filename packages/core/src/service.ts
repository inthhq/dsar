import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { buildCoreClient } from "./client";
import { resolveCoreConfig } from "./config";
import { getCoreClientRegistryKey } from "./registry";
import type { CoreClient, CoreClientConfig } from "./types";

/**
 * Service contract for creating {@link CoreClient} instances.
 */
export interface CoreClientFactoryService {
	/**
	 * Creates a {@link CoreClient} for the given configuration and optional
	 * process environment.
	 */
	readonly create: (
		config: CoreClientConfig,
		env?: NodeJS.ProcessEnv
	) => Effect.Effect<CoreClient>;
}

/**
 * Effect service tag for injecting a {@link CoreClientFactoryService}
 * implementation.
 */
export class CoreClientFactory extends ServiceMap.Service<
	CoreClientFactory,
	CoreClientFactoryService
>()("CoreClientFactory") {}

/**
 * Live {@link CoreClientFactory} layer that delegates to
 * {@link buildCoreClient}. Every call creates a fresh client with no caching.
 */
export const CoreClientFactoryLive = Layer.succeed(CoreClientFactory, {
	create: (config, env) => Effect.sync(() => buildCoreClient(config, env)),
} satisfies CoreClientFactoryService);

/**
 * Caching wrapper layer for {@link CoreClientFactory}. Requires the
 * underlying {@link CoreClientFactory} from the context, intercepts
 * `create` calls, and returns cached instances for equivalent configs.
 *
 * Compose with the live layer via:
 * ```ts
 * Layer.provide(CoreClientFactoryCached, CoreClientFactoryLive)
 * ```
 */
export const CoreClientFactoryCached = Layer.effect(CoreClientFactory)(
	Effect.gen(function* CoreClientFactoryCached() {
		const underlying = yield* Effect.service(CoreClientFactory);
		const cache = yield* SynchronizedRef.make(new Map<string, CoreClient>());

		return {
			create: (config, env) =>
				Effect.gen(function* create() {
					const resolved = resolveCoreConfig(config, env);
					const key = getCoreClientRegistryKey(resolved);
					return yield* SynchronizedRef.modifyEffect(cache, (map) =>
						Effect.gen(function* modify() {
							const cached = map.get(key);
							if (cached) {
								return [cached, map] as const;
							}
							const client = yield* underlying.create(config, env);
							const newMap = new Map(map).set(key, client);
							return [client, newMap] as const;
						})
					);
				}),
		} satisfies CoreClientFactoryService;
	})
);

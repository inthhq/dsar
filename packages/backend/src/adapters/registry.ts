import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/ServiceMap";

import type {
	AdapterCapability,
	AdapterHealth,
	AnyAdapterContract,
	InboundAdapterContract,
	NotificationAdapterContract,
	StorageAdapterContract,
} from "./contract";

const capabilityOrder: readonly AdapterCapability[] = [
	"notifications",
	"storage",
	"inbound",
];

const keyFor = (adapter: AnyAdapterContract): string =>
	`${adapter.capability}:${adapter.key}`;

/**
 * Registry service for capability-specific adapter resolution and health reporting.
 */
export interface AdapterRegistryService {
	/** Adds an adapter contract to the registry, keyed by capability and adapter key. */
	readonly register: (adapter: AnyAdapterContract) => void;
	/** Returns a snapshot of all registered adapter contracts. */
	readonly list: () => readonly AnyAdapterContract[];
	/** Resolves a notification adapter by key, or returns the first registered notification adapter when no key is given. */
	readonly resolveNotification: (
		key?: string
	) => NotificationAdapterContract | undefined;
	/** Resolves a storage adapter by key, or returns the first registered storage adapter when no key is given. */
	readonly resolveStorage: (key?: string) => StorageAdapterContract | undefined;
	/** Resolves an inbound adapter by key, or returns the first registered inbound adapter when no key is given. */
	readonly resolveInbound: (key?: string) => InboundAdapterContract | undefined;
	/** Aggregates health status for all registered adapters, ordered by capability. */
	readonly healthSummary: () => Effect.Effect<
		readonly {
			readonly key: string;
			readonly capability: AdapterCapability;
			readonly health: AdapterHealth;
		}[]
	>;
}

/**
 * Effect context tag used to access the adapter registry in services/routes.
 */
export class AdapterRegistryTag extends ServiceMap.Service<
	AdapterRegistryTag,
	AdapterRegistryService
>()("AdapterRegistry") {}

const resolveByCapability = (
	adapters: Map<string, AnyAdapterContract>,
	capability: AdapterCapability,
	key?: string
): AnyAdapterContract | undefined => {
	if (typeof key === "string" && key.length > 0) {
		return adapters.get(`${capability}:${key}`);
	}
	for (const entry of adapters.values()) {
		if (entry.capability === capability) {
			return entry;
		}
	}
	return undefined;
};

/**
 * Creates an in-memory adapter registry with optional initial adapters.
 *
 * @param initialAdapters - Adapter contracts to pre-register (defaults to an
 *   empty array).
 * @returns A fully wired {@link AdapterRegistryService} instance.
 */
export const makeAdapterRegistry = (
	initialAdapters: readonly AnyAdapterContract[] = []
): AdapterRegistryService => {
	const adapters = new Map<string, AnyAdapterContract>();
	for (const adapter of initialAdapters) {
		adapters.set(keyFor(adapter), adapter);
	}
	return {
		healthSummary: () =>
			Effect.gen(function* healthSummaryProgram() {
				const results: {
					key: string;
					capability: AdapterCapability;
					health: AdapterHealth;
				}[] = [];
				for (const capability of capabilityOrder) {
					for (const adapter of adapters.values()) {
						if (adapter.capability !== capability) {
							continue;
						}
						const health = yield* adapter.healthCheck().pipe(
							Effect.catch(() =>
								Effect.succeed({
									ok: false,
									status: "down",
								} satisfies AdapterHealth)
							)
						);
						results.push({
							capability: adapter.capability,
							health,
							key: adapter.key,
						});
					}
				}
				return results;
			}),
		list: () => [...adapters.values()],
		register: (adapter) => {
			adapters.set(keyFor(adapter), adapter);
		},
		resolveInbound: (key) =>
			resolveByCapability(adapters, "inbound", key) as
				| InboundAdapterContract
				| undefined,
		resolveNotification: (key) =>
			resolveByCapability(adapters, "notifications", key) as
				| NotificationAdapterContract
				| undefined,
		resolveStorage: (key) =>
			resolveByCapability(adapters, "storage", key) as
				| StorageAdapterContract
				| undefined,
	};
};

/**
 * Provides an {@link AdapterRegistryTag} as an Effect layer.
 *
 * @param initialAdapters - Adapter contracts to pre-register in the registry
 *   (defaults to an empty array).
 * @returns A `Layer` that supplies the adapter registry service to downstream
 *   effects.
 */
export const makeAdapterRegistryLayer = (
	initialAdapters: readonly AnyAdapterContract[] = []
): Layer.Layer<AdapterRegistryTag> =>
	Layer.succeed(AdapterRegistryTag)(makeAdapterRegistry(initialAdapters));

import { createNodeSdk } from "@dsar/node-sdk";

import { resolveCoreConfig } from "./config";
import { resolveModeRuntime } from "./runtime";
import type { CoreClient, CoreClientConfig } from "./types";

const sdkFromHttpConfig = (
	config: Extract<
		ReturnType<typeof resolveCoreConfig>,
		{ readonly baseUrl: string }
	>
) =>
	createNodeSdk({
		baseUrl: config.baseUrl,
		fetch: config.fetch,
		retryMaxAttempts: config.retryMaxAttempts,
		timeoutMs: config.timeoutMs,
		token: config.token,
	});

/**
 * Creates a fresh {@link CoreClient} for the resolved runtime mode without
 * any caching. Every call produces a new instance.
 *
 * @param config - Client configuration including `baseUrl`, auth `token`,
 *   retry/timeout settings, and runtime `mode`.
 * @param env - Process environment used during config resolution (e.g. to
 *   read `DSAR_*` variables); defaults to `process.env`.
 * @returns A new {@link CoreClient} for the resolved mode. Throws if the
 *   resolved mode requires an SDK but none can be constructed.
 */
export const buildCoreClient = (
	config: CoreClientConfig,
	env: NodeJS.ProcessEnv = process.env
): CoreClient => {
	const resolved = resolveCoreConfig(config, env);
	const runtime = resolveModeRuntime(resolved);
	const sdk =
		runtime ??
		(() => {
			if (resolved.mode === "managed" || resolved.mode === "self-hosted") {
				return sdkFromHttpConfig(resolved);
			}
			throw new Error(
				`Unexpected core mode without runtime sdk: ${resolved.mode}`
			);
		})();
	return { aiEnabled: resolved.aiEnabled, mode: resolved.mode, sdk };
};

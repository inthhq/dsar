import * as Effect from "effect/Effect";

import type {
	CoreClientConfig,
	CoreCommonConfig,
	ResolvedCoreClientConfig,
} from "./types";

const normalizeBaseUrl = (value: string): string => {
	const parsed = new URL(value);
	return parsed.toString().endsWith("/") ? parsed.toString() : `${parsed}/`;
};

const resolveBaseUrl = (
	config: Extract<
		CoreClientConfig,
		{ readonly mode: "managed" | "self-hosted" }
	>,
	env: NodeJS.ProcessEnv
): string => {
	const fromConfig = config.baseUrl;
	const fromEnv = env.DSAR_API_URL;
	const baseUrl = fromConfig ?? fromEnv;
	if (!baseUrl) {
		throw new Error(
			`@dsar/core mode '${config.mode}' requires baseUrl or DSAR_API_URL environment variable.`
		);
	}
	return normalizeBaseUrl(baseUrl);
};

const withAiDefaults = <T extends CoreCommonConfig>(
	config: T
): T & { readonly aiEnabled: boolean } => ({
	...config,
	aiEnabled: config.aiEnabled ?? false,
});

/**
 * Resolves mode-specific config defaults and validates required HTTP settings.
 *
 * @param config - Client configuration including `mode`, optional `baseUrl`,
 *   auth `token`, and feature flags. For `"managed"` or `"self-hosted"` modes
 *   a `baseUrl` (or `DSAR_API_URL` env var) is required.
 * @param env - Process environment used to resolve `DSAR_API_URL` when
 *   `baseUrl` is not provided; defaults to `process.env`.
 * @returns A {@link ResolvedCoreClientConfig} with `aiEnabled` defaulted and,
 *   for HTTP modes, a normalised trailing-slash `baseUrl`.
 * @throws `Error` When mode is `"managed"` or `"self-hosted"` and neither
 *   `config.baseUrl` nor `DSAR_API_URL` is set, or the URL is unparsable.
 */
export const resolveCoreConfig = (
	config: CoreClientConfig,
	env: NodeJS.ProcessEnv = process.env
): ResolvedCoreClientConfig =>
	Effect.runSync(
		Effect.try({
			catch: (cause) =>
				cause instanceof Error
					? cause
					: new Error("Failed to resolve core client config."),
			try: () => {
				if (config.mode === "managed" || config.mode === "self-hosted") {
					return {
						...withAiDefaults(config),
						baseUrl: resolveBaseUrl(config, env),
					};
				}
				return withAiDefaults(config);
			},
		})
	);

import { createHash } from "node:crypto";

import { isRecord } from "@dsar/guards";
import * as Effect from "effect/Effect";

import type { ResolvedCoreClientConfig } from "./types";

const TOKEN_FINGERPRINT_HEX_LENGTH = 16;

const tokenFingerprint = (token: string): string =>
	createHash("sha256")
		.update(token, "utf8")
		.digest("hex")
		.slice(0, TOKEN_FINGERPRINT_HEX_LENGTH);

const stableSerialize = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
	}
	if (isRecord(value)) {
		const filteredEntries = Object.entries(value).filter(
			([, current]) => current !== undefined
		);
		filteredEntries.sort(([left], [right]) => left.localeCompare(right));
		const entries = filteredEntries.map(
			([key, current]) => `"${key}":${stableSerialize(current)}`
		);
		return `{${entries.join(",")}}`;
	}
	if (typeof value === "function") {
		return JSON.stringify(`[fn:${value.name || "anonymous"}]`);
	}
	return JSON.stringify(value);
};

const signatureInput = (
	config: ResolvedCoreClientConfig
): Readonly<Record<string, unknown>> => {
	const common = {
		aiEnabled: config.aiEnabled,
		mode: config.mode,
		timeoutMs: config.timeoutMs,
		tokenFingerprint:
			config.token === undefined ? undefined : tokenFingerprint(config.token),
		tokenPresent: config.token !== undefined,
	};
	if (config.mode === "managed" || config.mode === "self-hosted") {
		return {
			...common,
			baseUrl: config.baseUrl,
			retryMaxAttempts: config.retryMaxAttempts,
		};
	}
	if (config.mode === "custom") {
		return {
			...common,
			customCacheKey:
				config.cacheKey ?? (config.handler.name || "custom-handler-default"),
		};
	}
	return {
		...common,
		offlineCacheKey: config.cacheKey ?? stableSerialize(config.fixtures ?? {}),
	};
};

/**
 * Builds a deterministic cache key for a resolved core client configuration.
 * Pure — does not read or mutate any state.
 *
 * @param config - A fully resolved {@link ResolvedCoreClientConfig}
 *   whose mode, base URL, tenant, and feature flags are serialized into
 *   the key.
 * @returns A `"core:…"` string that uniquely identifies the config.
 */
export const getCoreClientRegistryKey = (
	config: ResolvedCoreClientConfig
): string =>
	Effect.runSync(
		Effect.succeed(stableSerialize(signatureInput(config))).pipe(
			Effect.map((serialized) => `core:${serialized}`)
		)
	);

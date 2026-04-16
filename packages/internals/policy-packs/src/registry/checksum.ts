import type { PolicyPack } from "@dsar/policy-engine";
import * as Effect from "effect/Effect";

import { resolvePolicyPacksErrorCatalogEntry } from "../types/error-codes";
import { PolicyChecksumComputationError } from "../types/errors";

const encoder = new TextEncoder();

const compareKeys = (a: string, b: string) => a.localeCompare(b);

const normalizeValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeValue(entry));
	}

	if (value && typeof value === "object") {
		const normalized: Record<string, unknown> = {};
		const entries = Object.entries(value).toSorted(([left], [right]) =>
			compareKeys(left, right)
		);
		for (const [key, entry] of entries) {
			normalized[key] = normalizeValue(entry);
		}
		return normalized;
	}

	return value;
};

const toHex = (input: Uint8Array) =>
	[...input].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Produces a deterministic JSON string from a policy pack by recursively
 * sorting object keys. Identical logical packs always yield the same output,
 * ensuring {@link computePolicyPackChecksum} is reproducible across runs.
 *
 * @param pack - {@link PolicyPack} to serialise.
 * @returns Canonically-ordered JSON string.
 */
export const serializePolicyPackDeterministic = (pack: PolicyPack): string =>
	JSON.stringify(normalizeValue(pack));

/**
 * Computes a SHA-256 checksum of a policy pack using its deterministic
 * serialisation from {@link serializePolicyPackDeterministic}.
 *
 * Crypto failures (e.g. `subtle.digest` unavailable) are captured as typed
 * {@link PolicyChecksumComputationError} failures rather than surfacing as defects.
 *
 * @param pack - {@link PolicyPack} to hash.
 * @returns An `Effect` yielding a `"sha256:{hex}"` digest string, or failing
 *   with a {@link PolicyChecksumComputationError} when the digest cannot be computed.
 */
export const computePolicyPackChecksum = (
	pack: PolicyPack
): Effect.Effect<string, PolicyChecksumComputationError> =>
	Effect.tryPromise({
		catch: (cause) => {
			const entry = resolvePolicyPacksErrorCatalogEntry(
				"POLICY_PACKS_CHECKSUM_FAILED"
			);
			return new PolicyChecksumComputationError({
				cause: cause instanceof Error ? cause.message : String(cause),
				code: entry.code,
				docsUrl: entry.docsUrl,
				id: entry.id,
			});
		},
		try: async () => {
			const payload = encoder.encode(serializePolicyPackDeterministic(pack));
			const digest = await crypto.subtle.digest("SHA-256", payload);
			return `sha256:${toHex(new Uint8Array(digest))}`;
		},
	});

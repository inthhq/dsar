import type { JsonValue } from "@dsar/persistence";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

/**
 * Failure surfaced when SHA-256 hashing is unavailable or fails at runtime
 * (e.g. missing WebCrypto API).
 */
export class AuditHashError extends Data.TaggedError("AuditHashError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/**
 * Canonical fields used to compute the audit-event hash-chain value.
 */
export interface AuditHashInput {
	/** Action name captured for this operation. */
	readonly action: string;
	/** Actor or principal responsible for this operation. */
	readonly actor: string;
	/** Domain object targeted by this operation. */
	readonly object: string;
	/** State snapshot captured before this operation. */
	readonly before: JsonValue;
	/** State snapshot captured after this operation. */
	readonly after: JsonValue;
	/** Structured rationale payload for this operation. */
	readonly reason: JsonValue;
	/** Timestamp when this record was created. */
	readonly createdAt: string;
	/** Owning request identifier for this record. */
	readonly requestId?: string;
	/** Previous hash in the audit chain. */
	readonly prevHash?: string;
	/** Monotonic sequence number for deterministic ordering. */
	readonly sequence: number;
}

const canonicalize = (value: JsonValue): JsonValue => {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	const sorted: Record<string, JsonValue> = Object.create(null) as Record<
		string,
		JsonValue
	>;
	for (const key of Object.keys(value).toSorted()) {
		sorted[key] = canonicalize(
			(value as Record<string, JsonValue>)[key] as JsonValue
		);
	}
	return sorted;
};

const stableStringify = (value: JsonValue): string =>
	JSON.stringify(canonicalize(value));

/**
 * Computes a SHA-256 hash for an audit event using deterministic field ordering.
 *
 * @param input - Audit event fields included in the hash-chain payload.
 * @returns Hex-encoded hash value.
 */
export const computeAuditHash = (
	input: AuditHashInput
): Effect.Effect<string, AuditHashError> =>
	Effect.tryPromise(async () => {
		const payload = [
			input.actor,
			input.action,
			input.object,
			input.requestId ?? "",
			stableStringify(input.before),
			stableStringify(input.after),
			stableStringify(input.reason),
			input.prevHash ?? "",
			input.sequence.toString(10),
			input.createdAt,
		].join("|");
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(payload)
		);
		return [...new Uint8Array(digest)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}).pipe(
		Effect.mapError(
			(cause) =>
				new AuditHashError({
					cause,
					message: "SHA-256 hashing failed — crypto.subtle may be unavailable.",
				})
		)
	);

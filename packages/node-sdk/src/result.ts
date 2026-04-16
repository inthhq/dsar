import type { ApiSuccessEnvelope, DsarResult } from "./types";

/**
 * Constructs a {@link DsarResult} from a successful API response envelope,
 * wrapping the payload with convenience accessors (`expect`, `unwrap`,
 * `orElse`) for ergonomic value extraction.
 *
 * @param envelope - Successful API response containing
 *   `data` (the response payload of type `T`) and `meta` (response metadata).
 * @typeParam T - Type of the response payload carried in `envelope.data`.
 * @returns A result with `ok: true`, the original `data` and
 *   `meta`, and helper methods that return `data` directly.
 */
export const makeResult = <T>(
	envelope: ApiSuccessEnvelope<T>
): DsarResult<T> => ({
	data: envelope.data,
	expect: (_message?: string) => envelope.data,
	meta: envelope.meta,
	ok: true as const,
	orElse: (_fallback) => envelope.data,
	unwrap: () => envelope.data,
});

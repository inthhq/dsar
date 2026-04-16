import { asRecord } from "@dsar/guards";
import * as Data from "effect/Data";

const RE_TIMEOUT = /\btimeout\b/;
const RE_TIMED_OUT = /\btimed out\b/;
const RE_RATE_LIMIT = /\brate.?limit/;
const RE_RATE_LIMITED = /\brate.?limited\b/;
const RE_NETWORK = /\bnetwork\b/;
const RE_SOCKET = /\bsocket\b/;
const RE_CONNECTION = /\bconnection\b/;
const RE_UNAUTHORIZED = /\bunauthorized\b/;
const RE_FORBIDDEN = /\bforbidden\b/;
const RE_AUTH = /\bauth\b/;
const RE_STATUS_429 = /\b429\b/;

const NETWORK_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ENETUNREACH",
	"EHOSTUNREACH",
	"EPIPE",
]);

/**
 * Normalized adapter error categories used for retries and operator diagnostics.
 */
export type AdapterErrorCategory =
	| "auth"
	| "config"
	| "network"
	| "rate_limit"
	| "timeout"
	| "unknown"
	| "validation";

const classifyAdapterError = (
	message: string,
	nodeErrorCode: string
): AdapterErrorCategory => {
	const lower = message.toLowerCase();
	if (
		nodeErrorCode === "ETIMEDOUT" ||
		RE_TIMEOUT.test(lower) ||
		RE_TIMED_OUT.test(lower)
	) {
		return "timeout";
	}
	if (
		RE_RATE_LIMIT.test(lower) ||
		RE_RATE_LIMITED.test(lower) ||
		RE_STATUS_429.test(lower)
	) {
		return "rate_limit";
	}
	if (
		NETWORK_ERROR_CODES.has(nodeErrorCode) ||
		RE_NETWORK.test(lower) ||
		RE_SOCKET.test(lower) ||
		RE_CONNECTION.test(lower)
	) {
		return "network";
	}
	if (
		RE_UNAUTHORIZED.test(lower) ||
		RE_FORBIDDEN.test(lower) ||
		RE_AUTH.test(lower)
	) {
		return "auth";
	}
	return "unknown";
};

/**
 * Typed adapter invocation failure surfaced by backend adapter orchestration.
 */
export class AdapterInvocationError extends Data.TaggedError(
	"AdapterInvocationError"
)<{
	readonly adapterKey: string;
	readonly capability: "inbound" | "notifications" | "storage";
	readonly category: AdapterErrorCategory;
	readonly retriable: boolean;
	readonly message: string;
	readonly details?: Readonly<Record<string, unknown>>;
}> {}

/**
 * Normalizes unknown adapter failures into `AdapterInvocationError`.
 *
 * @param input - Adapter execution context and raw failure value.
 * @returns Typed error with normalized category and retriable flag.
 */
export const normalizeAdapterError = (input: {
	readonly adapterKey: string;
	readonly capability: "inbound" | "notifications" | "storage";
	readonly error: unknown;
}): AdapterInvocationError => {
	if (input.error instanceof AdapterInvocationError) {
		return input.error;
	}
	let message = "Adapter invocation failed.";
	if (input.error instanceof Error) {
		({ message } = input.error);
	} else if (input.error !== null && typeof input.error === "object") {
		const candidateMessage = (input.error as { readonly message?: unknown })
			.message;
		if (candidateMessage !== undefined) {
			message = String(candidateMessage);
		}
	}
	const rawCode =
		input.error !== null &&
		typeof input.error === "object" &&
		"code" in input.error
			? (input.error as { readonly code?: unknown }).code
			: undefined;
	const nodeErrorCode =
		typeof rawCode === "string" ? rawCode.toUpperCase() : "";
	const category = classifyAdapterError(message, nodeErrorCode);
	const retriable =
		category === "timeout" ||
		category === "rate_limit" ||
		category === "network";
	return new AdapterInvocationError({
		adapterKey: input.adapterKey,
		capability: input.capability,
		category,
		details: asRecord(input.error),
		message,
		retriable,
	});
};

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

const REDACTED_HEADER = "[REDACTED]";
const SENSITIVE_HEADERS = new Set([
	"authorization",
	"cookie",
	"proxy-authorization",
	"set-cookie",
	"x-api-key",
]);
const BODY_PREVIEW_LIMIT = 4096;
const BODY_PREVIEW_MAX_BYTES = BODY_PREVIEW_LIMIT + 1;
const SENSITIVE_QUERY_PARAMS = new Set([
	"access_token",
	"api_key",
	"apikey",
	"auth",
	"key",
	"password",
	"secret",
	"token",
]);
const BODY_READ_TIMEOUT = Duration.seconds(3);

interface BodyPreviewResult {
	readonly bodyPreview: string;
	readonly contentType: string;
	readonly truncated: boolean;
}

const sanitizeHeaders = (
	headers: Headers
): Readonly<Record<string, string>> => {
	const entries: Record<string, string> = {};
	for (const [key, value] of headers.entries()) {
		entries[key] = SENSITIVE_HEADERS.has(key.toLowerCase())
			? REDACTED_HEADER
			: value;
	}
	return entries;
};

const sanitizeQuery = (searchParams: URLSearchParams) => {
	const sanitized = new URLSearchParams();
	for (const [key, value] of searchParams.entries()) {
		sanitized.append(
			key,
			SENSITIVE_QUERY_PARAMS.has(key.toLowerCase()) ? REDACTED_HEADER : value
		);
	}
	const query = sanitized.toString();
	return query.length > 0 ? `?${query}` : "";
};

const getContentType = (request: Request) =>
	request.headers.get("content-type") ?? "unknown";

const isSkippableBodyMethod = (method: string) =>
	method === "GET" || method === "HEAD";

const isBinaryContentType = (contentType: string) =>
	contentType.includes("application/octet-stream") ||
	contentType.includes("multipart/form-data");

const parseContentLength = (request: Request) => {
	const contentLengthHeader = request.headers.get("content-length");
	return contentLengthHeader
		? Number.parseInt(contentLengthHeader, 10)
		: Number.NaN;
};

const readBodyChunks = async (
	request: Request
): Promise<
	| { readonly chunks: readonly Uint8Array[]; readonly totalBytes: number }
	| undefined
> => {
	const reader = request.clone().body?.getReader();
	if (!reader) {
		return undefined;
	}
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	const timer = setTimeout(() => {
		const _ = reader.cancel();
	}, Duration.toMillis(BODY_READ_TIMEOUT));
	try {
		while (totalBytes < BODY_PREVIEW_MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done || !value) {
				break;
			}
			const remainingBytes = BODY_PREVIEW_MAX_BYTES - totalBytes;
			if (remainingBytes <= 0) {
				break;
			}
			const chunk =
				value.byteLength > remainingBytes
					? value.slice(0, remainingBytes)
					: value;
			chunks.push(chunk);
			totalBytes += chunk.byteLength;
		}
	} catch {
		/* stream cancelled by timeout or read error — return accumulated chunks */
	}
	clearTimeout(timer);
	await reader.cancel().catch((error: unknown) => error);
	return totalBytes > 0 ? { chunks, totalBytes } : undefined;
};

const decodeChunksToText = (
	chunks: readonly Uint8Array[],
	totalBytes: number
): { readonly bodyPreview: string; readonly truncated: boolean } => {
	const truncated = totalBytes > BODY_PREVIEW_LIMIT;
	const previewBytes = truncated ? BODY_PREVIEW_LIMIT : totalBytes;
	const merged = new Uint8Array(previewBytes);
	let offset = 0;
	for (const chunk of chunks) {
		if (offset >= previewBytes) {
			break;
		}
		const remainingBytes = previewBytes - offset;
		const bytesToCopy = Math.min(chunk.byteLength, remainingBytes);
		merged.set(chunk.subarray(0, bytesToCopy), offset);
		offset += bytesToCopy;
	}
	return {
		bodyPreview: new TextDecoder().decode(merged),
		truncated,
	};
};

const decodeBodyPreview = (
	request: Request
): Promise<BodyPreviewResult | undefined> => {
	const contentType = getContentType(request);
	return Effect.gen(function* resolvePreview() {
		if (isSkippableBodyMethod(request.method)) {
			return;
		}
		if (request.bodyUsed) {
			return {
				bodyPreview: "[request body already consumed]",
				contentType,
				truncated: false,
			};
		}
		if (isBinaryContentType(contentType)) {
			return {
				bodyPreview: "[binary content omitted]",
				contentType,
				truncated: false,
			};
		}
		const contentLength = parseContentLength(request);
		if (Number.isFinite(contentLength) && contentLength === 0) {
			return {
				bodyPreview: "",
				contentType,
				truncated: false,
			};
		}
		const read = yield* Effect.promise(() => readBodyChunks(request));
		if (!read) {
			return;
		}
		const decoded = decodeChunksToText(read.chunks, read.totalBytes);
		return {
			bodyPreview: decoded.bodyPreview,
			contentType,
			truncated: decoded.truncated,
		};
	}).pipe(Effect.runPromise);
};

/**
 * Extracts a sanitized request trace for backend error logging.
 *
 * @param request - Incoming request whose headers, query, and body preview are logged.
 * @returns A readonly trace object safe to attach to structured error logs.
 */
export const toRequestTrace = async (
	request: Request
): Promise<Readonly<Record<string, unknown>>> => {
	const url = new URL(request.url);
	const body = await decodeBodyPreview(request);
	return {
		body,
		headers: sanitizeHeaders(request.headers),
		method: request.method,
		pathname: url.pathname,
		query: sanitizeQuery(url.searchParams),
	};
};

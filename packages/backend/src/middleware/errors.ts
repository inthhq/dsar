import { resolveBackendErrorCatalogEntry } from "../types/error-codes";
import { errorMappers } from "./errors/mappers";
import {
	logMappedError,
	logUnhandledError,
	responseFrom,
} from "./errors/render";
import { toRequestTrace } from "./errors/request-trace";
import type { MappedError } from "./errors/shared";

/**
 * Converts thrown runtime errors into a stable DSAR error envelope response.
 *
 * @param error - Unhandled error produced by route handlers, middleware, or adapters.
 * @param request - Optional request context used for sanitized request-trace logging.
 * @returns A JSON `Response` with catalog-backed `code`, `id`, `docsUrl`, and HTTP status.
 */
export const toErrorResponse = async (
	error: unknown,
	request?: Request
): Promise<Response> => {
	const requestTrace = request ? await toRequestTrace(request) : undefined;
	for (const mapper of errorMappers) {
		const mapped = mapper(error);
		if (mapped) {
			const catalogEntry = resolveBackendErrorCatalogEntry(mapped.code);
			logMappedError({
				catalogEntry,
				error,
				mapped,
				requestTrace,
			});
			return responseFrom(mapped, catalogEntry);
		}
	}
	const mapped: MappedError = {
		code: "INTERNAL_RUNTIME_ERROR",
		message: "Unhandled runtime error.",
		status: 500,
	};
	const catalogEntry = resolveBackendErrorCatalogEntry(mapped.code);
	logUnhandledError({
		catalogEntry,
		error,
		mapped,
		requestTrace,
	});
	return responseFrom(mapped, catalogEntry);
};

import type { RequestLog } from "../../observability/log";
import { errorEnvelope } from "../../types/envelope";
import type { MappedError } from "./shared";
import { sanitizeErrorForLog } from "./shared";

/**
 * Builds a JSON error response from a mapped backend error.
 *
 * @param mapped - Normalized backend error selected by an error mapper.
 * @param catalogEntry - Error catalog metadata used for id and docs URL fields.
 * @returns A JSON `Response` containing the standardized error envelope.
 */
export const responseFrom = (
	mapped: MappedError,
	catalogEntry: { readonly docsUrl: string; readonly id: string }
) =>
	new Response(
		JSON.stringify(
			errorEnvelope({
				code: mapped.code,
				docsUrl: catalogEntry.docsUrl,
				id: catalogEntry.id,
				message: mapped.message,
				status: mapped.status,
				trace: mapped.trace,
			})
		),
		{
			headers: { "content-type": "application/json" },
			status: mapped.status,
		}
	);

/**
 * Records a mapped backend error on the request's wide event.
 *
 * Every error gets its catalog id, code, and status. Server errors also get
 * the sanitized error and request method and path, and mark the event as failed. Client
 * errors do not: a 4xx is the caller's mistake, and its request body can hold
 * subject data that has no business in a log.
 *
 * @param log - The request's wide event.
 * @param input - Error, catalog entry, mapped response, and request trace.
 */
export const logMappedError = (
	log: RequestLog,
	input: {
		readonly mapped: MappedError;
		readonly catalogEntry: { readonly docsUrl: string; readonly id: string };
		readonly error: unknown;
		readonly requestTrace?: Readonly<Record<string, unknown>>;
	}
): void => {
	log.set({
		error: {
			code: input.mapped.code,
			id: input.catalogEntry.id,
			status: input.mapped.status,
		},
	});
	if (input.mapped.status < 500) {
		return;
	}
	// Method and path only. evlog writes the console line with the host's
	// redaction, which may be off, so request bodies, query strings, and
	// headers never go on the event.
	const sanitized = sanitizeErrorForLog(input.error);
	// A fresh Error rather than the original: evlog serializes extra
	// properties such as `data` or `cause`, which can carry request payloads.
	const logged = new Error(String(sanitized.message));
	logged.name = typeof sanitized.name === "string" ? sanitized.name : "Error";
	if (typeof sanitized.stack === "string") {
		logged.stack = sanitized.stack;
	}
	log.error(logged, {
		cause: sanitized,
		request: {
			method: input.requestTrace?.method,
			pathname: input.requestTrace?.pathname,
		},
	});
};

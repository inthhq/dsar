import { errorEnvelope } from "../../types/envelope";
import type { MappedError } from "./shared";
import { sanitizeErrorForLog } from "./shared";

const backendLogger = {
	error: (event: string, payload: Readonly<Record<string, unknown>>): void => {
		console.error(JSON.stringify({ event, ...payload }));
	},
};

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

const logErrorWithCatalog = (
	eventName: string,
	input: {
		readonly mapped: MappedError;
		readonly catalogEntry: { readonly docsUrl: string; readonly id: string };
		readonly error: unknown;
		readonly requestTrace?: Readonly<Record<string, unknown>>;
	}
) => {
	backendLogger.error(eventName, {
		code: input.mapped.code,
		docsUrl: input.catalogEntry.docsUrl,
		error: sanitizeErrorForLog(input.error),
		id: input.catalogEntry.id,
		request: input.requestTrace,
		status: input.mapped.status,
	});
};

/**
 * Logs a mapped backend error with catalog and request context.
 *
 * @param input - Error, catalog, mapped response, and optional request trace.
 */
export const logMappedError = (input: {
	readonly mapped: MappedError;
	readonly catalogEntry: { readonly docsUrl: string; readonly id: string };
	readonly error: unknown;
	readonly requestTrace?: Readonly<Record<string, unknown>>;
}) => {
	logErrorWithCatalog("[@dsar/backend] handled_error", input);
};

/**
 * Logs an unhandled backend error that fell through the mapper chain.
 *
 * @param input - Error, fallback mapped response, and optional request trace.
 */
export const logUnhandledError = (input: {
	readonly mapped: MappedError;
	readonly catalogEntry: { readonly docsUrl: string; readonly id: string };
	readonly error: unknown;
	readonly requestTrace?: Readonly<Record<string, unknown>>;
}) => {
	logErrorWithCatalog("[@dsar/backend] unhandled_error", input);
};

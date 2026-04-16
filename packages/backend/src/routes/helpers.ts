import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { successEnvelope } from "../types/envelope";
import {
	RequestValidationError,
	UnauthorizedRequestError,
} from "../types/errors";
import type { RouteDefinition } from "./types";

/**
 * Creates an HTTP JSON response by serializing the given body.
 *
 * @param body - Value to serialize via `JSON.stringify` as the response body.
 * @param status - HTTP status code for the response (defaults to `200`).
 * @param [headers] - Additional response headers merged after the default
 *   `content-type: application/json` header.
 * @returns A `Response` with the JSON-serialized body, the merged headers, and
 *   the specified status code.
 */
export const jsonResponse = (
	body: unknown,
	status = 200,
	headers?: HeadersInit
): Response =>
	new Response(JSON.stringify(body), {
		headers: {
			"content-type": "application/json",
			...headers,
		},
		status,
	});

/**
 * Returns a 200 JSON response wrapping `data` in a
 * {@link successEnvelope | success envelope}.
 *
 * @typeParam T - Type of the response payload carried in `data`.
 * @param data - Payload included as the `data` field of the envelope.
 * @param [meta] - Optional bag of supplementary metadata merged into the
 *   envelope's `meta` field.
 * @returns A `Response` with a JSON body of `{ ok: true, data, meta }` and
 *   HTTP status `200`.
 */
export const ok = <T>(data: T, meta?: Readonly<Record<string, unknown>>) =>
	jsonResponse(successEnvelope(data, meta), 200);

/**
 * Returns a 202 JSON response wrapping `data` in a
 * {@link successEnvelope | success envelope}.
 *
 * @typeParam T - Type of the response payload carried in `data`.
 * @param data - Payload included as the `data` field of the envelope.
 * @param [meta] - Optional bag of supplementary metadata merged into the
 *   envelope's `meta` field.
 * @returns A `Response` with a JSON body of `{ ok: true, data, meta }` and
 *   HTTP status `202`.
 */
export const accepted = <T>(
	data: T,
	meta?: Readonly<Record<string, unknown>>
) => jsonResponse(successEnvelope(data, meta), 202);

/**
 * Produces a failed Effect representing an unauthorized request.
 *
 * @param message - Human-readable reason surfaced in the error (defaults to
 *   `"Missing actor context"`).
 * @returns An `Effect` that fails with an {@link UnauthorizedRequestError}.
 * @throws {@link UnauthorizedRequestError} Always fails with this error,
 *   signalling that the caller lacks a valid actor/auth context.
 */
export const unauthorized = (message = "Missing actor context") =>
	Effect.fail(new UnauthorizedRequestError({ message }));

/**
 * Parses the request body as JSON, failing if the payload is malformed.
 *
 * @param request - Incoming HTTP `Request` whose body is read via
 *   `request.json()`.
 * @returns An `Effect` that succeeds with the parsed JSON value (`unknown`).
 * @throws {@link RequestValidationError} When the body cannot be parsed as
 *   valid JSON (reason code `REQUEST_BODY_INVALID_JSON`).
 */
export const requireJson = (request: Request) =>
	Effect.tryPromise({
		catch: () =>
			new RequestValidationError({
				message: "Invalid JSON payload.",
				reasonCode: "REQUEST_BODY_INVALID_JSON",
			}),
		try: async (): Promise<unknown> => await request.json(),
	});

const issueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const formatSchemaIssues = (
	error: Schema.SchemaError
): Readonly<Record<string, unknown>> => {
	const formatted = issueFormatter(error.issue);
	return {
		errors: formatted.issues.map((issue) => ({
			message: issue.message,
			path: issue.path?.map((segment) =>
				typeof segment === "object" && "key" in segment
					? segment.key
					: String(segment)
			),
		})),
	};
};

/**
 * Parses the request body as JSON and decodes it against the given Schema,
 * failing with a {@link RequestValidationError} on malformed JSON or
 * schema-validation failure.
 *
 * @typeParam S - Schema type extending `Schema.Top` used for validation and decoding.
 * @param request - Incoming HTTP `Request` whose body is read and decoded.
 * @param schema - Effect `Schema` used to validate and decode the parsed JSON.
 * @returns An `Effect` that succeeds with the decoded value.
 * @throws {@link RequestValidationError} When the body is not valid JSON
 *   (reason code `REQUEST_BODY_INVALID_JSON`) or when the parsed value fails
 *   schema validation (reason code `REQUEST_VALIDATION_FAILED`).
 */
export const decodeJsonBody = <S extends Schema.Top>(
	request: Request,
	schema: S
): Effect.Effect<S["Type"], RequestValidationError, S["DecodingServices"]> =>
	requireJson(request).pipe(
		Effect.flatMap((raw) => Schema.decodeUnknownEffect(schema)(raw)),
		Effect.mapError((error) => {
			if (error instanceof RequestValidationError) {
				return error;
			}
			if (Schema.isSchemaError(error)) {
				return new RequestValidationError({
					details: formatSchemaIssues(error),
					message: error.issue.toString(),
					reasonCode: "REQUEST_VALIDATION_FAILED",
				});
			}
			return new RequestValidationError({
				message: "Validation failed.",
				reasonCode: "REQUEST_VALIDATION_FAILED",
			});
		})
	);

const DEFAULT_MAX_BODY_BYTES = 50 * 1024 * 1024;

/**
 * Reads the full request body as a binary `Uint8Array`, enforcing a size limit.
 *
 * @param request - Incoming HTTP `Request` whose body is consumed. If the body
 *   has no readable stream, falls back to `request.arrayBuffer()`.
 * @param maxBytes - Maximum allowed body size in bytes (defaults to 50 MiB).
 * @returns An `Effect` that succeeds with the body contents as a `Uint8Array`.
 * @throws {@link RequestValidationError} With reason code
 *   `REQUEST_VALIDATION_FAILED` in three cases:
 *
 *   - The `Content-Length` header declares a size exceeding `maxBytes`.
 *
 *   - The cumulative size of streamed chunks exceeds `maxBytes` during read
 *     (the stream is cancelled before returning).
 *
 *   - The body cannot be read due to an underlying I/O error (message:
 *     "Unable to read binary request body.").
 */
export const requireBinaryBody = (
	request: Request,
	maxBytes = DEFAULT_MAX_BODY_BYTES
) =>
	Effect.tryPromise({
		catch: (error) =>
			new RequestValidationError({
				message:
					error instanceof RequestValidationError
						? error.message
						: "Unable to read binary request body.",
				reasonCode: "REQUEST_VALIDATION_FAILED",
			}),
		try: async () => {
			const contentLength = request.headers.get("content-length");
			if (contentLength) {
				const declared = Number.parseInt(contentLength, 10);
				if (Number.isFinite(declared) && declared > maxBytes) {
					throw new RequestValidationError({
						message: `Request body exceeds maximum allowed size of ${maxBytes} bytes.`,
						reasonCode: "REQUEST_VALIDATION_FAILED",
					});
				}
			}
			const reader = request.body?.getReader();
			if (!reader) {
				return new Uint8Array(await request.arrayBuffer());
			}
			const chunks: Uint8Array[] = [];
			let totalSize = 0;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				totalSize += value.byteLength;
				if (totalSize > maxBytes) {
					await reader.cancel();
					throw new RequestValidationError({
						message: `Request body exceeds maximum allowed size of ${maxBytes} bytes.`,
						reasonCode: "REQUEST_VALIDATION_FAILED",
					});
				}
				chunks.push(value);
			}
			const result = new Uint8Array(totalSize);
			let offset = 0;
			for (const chunk of chunks) {
				result.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return result;
		},
	});

/**
 * Extracts a single route parameter by name, failing if the key is missing or
 * nullish.
 *
 * @param params - Record of route parameters (e.g. from URL pattern matching).
 * @param key - Name of the parameter to retrieve.
 * @returns An `Effect` that succeeds with the parameter's `string` value.
 * @throws {@link RequestValidationError} With reason code
 *   `REQUEST_ROUTE_PARAM_MISSING` and message "Missing route parameter: {key}"
 *   when the key is absent or its value is `null`/`undefined`.
 */
export const parseParam = (
	params: Readonly<Record<string, string>>,
	key: string
) =>
	Effect.fromOption(Option.fromNullishOr(params[key])).pipe(
		Effect.mapError(
			() =>
				new RequestValidationError({
					message: `Missing route parameter: ${key}`,
					reasonCode: "REQUEST_ROUTE_PARAM_MISSING",
				})
		)
	);

const splitPath = (path: string): readonly string[] =>
	path.replaceAll(/\/+/g, "/").split("/").filter(Boolean);

/**
 * Tests whether an incoming request matches a {@link RouteDefinition} and
 * extracts any path parameters.
 *
 * Segments prefixed with `:` are treated as named parameters (e.g.
 * `/requests/:id/audit`). Matched parameter values are URI-decoded. Duplicate
 * slashes in `pathname` are normalised before comparison.
 *
 * @param route - Route definition whose `method` and `path` pattern are tested.
 * @param method - HTTP method of the incoming request (e.g. `"GET"`).
 * @param pathname - URL pathname to match against `route.path`.
 * @returns A record mapping parameter names to their decoded values when the
 *   route matches, or `undefined` when the HTTP method differs, the segment
 *   count doesn't match, or a literal segment fails to equal the corresponding
 *   pathname segment.
 */
export const matchRoute = (
	route: RouteDefinition,
	method: string,
	pathname: string
): Readonly<Record<string, string>> | undefined => {
	if (route.method !== method) {
		return undefined;
	}

	const routeSegments = splitPath(route.path);
	const pathSegments = splitPath(pathname);
	if (routeSegments.length !== pathSegments.length) {
		return undefined;
	}

	const params: Record<string, string> = {};
	for (const [index, segment] of routeSegments.entries()) {
		const actual = pathSegments[index];
		if (!actual) {
			return undefined;
		}

		if (segment.startsWith(":")) {
			params[segment.slice(1)] = decodeURIComponent(actual);
			continue;
		}

		if (segment !== actual) {
			return undefined;
		}
	}

	return params;
};

/* oxlint-disable max-statements */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type {
	ApiRequest,
	ParsedCliInput,
	RouteParityDefinition,
} from "../types";

const isPlaceholder = (value: string): boolean => value.startsWith(":");

const normalizeToken = (value: string): string => value.trim().toLowerCase();

/**
 * Matches CLI input tokens against a command usage pattern and extracts
 * named parameters.
 *
 * @param argvTokens - Positional tokens from the user's CLI input.
 * @param usageTokens - Command pattern tokens where `:name` segments are
 *   treated as named placeholders and literal segments must match
 *   case-insensitively.
 * @returns A record mapping placeholder names to their captured values when
 *   every token matches, or `undefined` when the token count differs or a
 *   literal segment fails to match.
 */
export const matchCommand = (
	argvTokens: readonly string[],
	usageTokens: readonly string[]
): Readonly<Record<string, string>> | undefined => {
	if (argvTokens.length !== usageTokens.length) {
		return undefined;
	}
	const params: Record<string, string> = {};
	for (let index = 0; index < usageTokens.length; index += 1) {
		const usage = usageTokens[index];
		const actual = argvTokens[index];
		if (!usage || !actual) {
			return undefined;
		}
		if (isPlaceholder(usage)) {
			params[usage.slice(1)] = actual;
			continue;
		}
		if (normalizeToken(usage) !== normalizeToken(actual)) {
			return undefined;
		}
	}
	return params;
};

const getJsonBody = (flags: Readonly<Record<string, string>>): unknown => {
	const asJson = flags.json;
	if (!asJson) {
		return undefined;
	}
	try {
		return JSON.parse(asJson) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid JSON in --json flag: ${detail}`, {
			cause: error,
		});
	}
};

const parseCreateIntakePayload = (
	flags: Readonly<Record<string, string>>,
	defaultRawText: string
): Readonly<Record<string, unknown>> => {
	const now = new Date().toISOString();
	const channel = flags.channel ?? flags["source-type"] ?? "cli";
	const rawText = flags["raw-text"] ?? defaultRawText;
	const receivedAt = flags["received-at"] ?? now;
	const intakeSource: Record<string, unknown> = {
		channel,
		rawText,
		receivedAt,
	};
	if (flags.contact) {
		intakeSource.contact = flags.contact;
	}
	if (flags["raw-context-ref"]) {
		intakeSource.sourceEvidence = [flags["raw-context-ref"]];
	}
	return { intakeSource };
};

const binaryUploadRouteIds = new Set([
	"requests_verification_evidence_upload",
	"requests_manifest_artifact_upload",
	"requests_manifest_artifact_replace",
]);

const requireFlag = (
	flags: Readonly<Record<string, string>>,
	key: string,
	message: string
): string => {
	const value = flags[key];
	if (!value) {
		throw new Error(message);
	}
	return value;
};

const resolveUploadFileMeta = (
	input: ParsedCliInput
): {
	readonly contentType: string;
	readonly fileName: string;
	readonly filePath: string;
} => {
	const filePath = requireFlag(
		input.flags,
		"file",
		"Missing required --file for binary upload command."
	);
	return {
		contentType: input.flags["content-type"] ?? "application/octet-stream",
		fileName: input.flags["file-name"] ?? basename(filePath),
		filePath,
	};
};

const payloadForRoute = (
	route: RouteParityDefinition,
	input: ParsedCliInput
): Promise<unknown> | unknown => {
	if (binaryUploadRouteIds.has(route.id)) {
		const upload = resolveUploadFileMeta(input);
		return readFile(upload.filePath).then((bytes) => new Uint8Array(bytes));
	}
	const parsedJson = getJsonBody(input.flags);
	if (parsedJson !== undefined) {
		return parsedJson;
	}
	if (route.id === "requests_create" || route.id === "requests_capture") {
		return parseCreateIntakePayload(input.flags, "Created via dsar CLI.");
	}
	if (route.id === "requests_appeals_decide" && input.flags.decision) {
		return {
			decision: input.flags.decision,
			explanation: input.flags.explanation,
		};
	}
	return undefined;
};

const queryForRoute = (
	route: RouteParityDefinition,
	input: ParsedCliInput
): Readonly<Record<string, string | undefined>> | undefined => {
	if (route.id === "requests_audit_export") {
		return {
			format: input.flags.format,
		};
	}
	if (route.id === "requests_manifest_artifact_download") {
		return {
			key: requireFlag(
				input.flags,
				"key",
				"Missing required --key for manifest artifact download command."
			),
		};
	}
	return undefined;
};

const headersForRoute = (
	route: RouteParityDefinition,
	input: ParsedCliInput
): Readonly<Record<string, string>> | undefined => {
	if (route.id === "requests_artifacts_download") {
		const token = input.flags["delivery-token"];
		if (!token) {
			throw new Error(
				"Missing required --delivery-token for artifact download command."
			);
		}
		return {
			"x-delivery-token": token,
		};
	}
	if (route.id === "requests_verification_evidence_upload") {
		const upload = resolveUploadFileMeta(input);
		return {
			"content-type": upload.contentType,
			"x-evidence-content-type": upload.contentType,
			"x-evidence-filename": encodeURIComponent(upload.fileName),
			...(input.flags.level ? { "x-evidence-level": input.flags.level } : {}),
		};
	}
	if (
		route.id === "requests_manifest_artifact_upload" ||
		route.id === "requests_manifest_artifact_replace"
	) {
		const upload = resolveUploadFileMeta(input);
		return {
			"content-type": upload.contentType,
			"x-artifact-content-type": upload.contentType,
			"x-artifact-filename": encodeURIComponent(upload.fileName),
			...(input.flags.title
				? { "x-artifact-title": encodeURIComponent(input.flags.title) }
				: {}),
			...(input.flags["artifact-type"]
				? { "x-artifact-type": input.flags["artifact-type"] }
				: {}),
		};
	}
	return undefined;
};

const toPath = (
	template: string,
	params: Readonly<Record<string, string>>
): string => {
	let resolved = template;
	for (const [key, value] of Object.entries(params)) {
		resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(value));
	}
	return resolved;
};

/**
 * Builds an {@link ApiRequest} from a route definition, parsed CLI input, and
 * extracted path parameters.
 *
 * @param route - Route parity definition providing the HTTP method, path
 *   template, and route-specific payload/query/header logic.
 * @param input - Parsed CLI input containing flags and command tokens used to
 *   derive the request body, query, and headers.
 * @param params - Path parameter values keyed by placeholder name, substituted
 *   into the route path template.
 * @returns A fully-assembled {@link ApiRequest} ready for dispatch via the API
 *   client.
 */
export const requestFromRoute = async (
	route: RouteParityDefinition,
	input: ParsedCliInput,
	params: Readonly<Record<string, string>>
): Promise<ApiRequest> => ({
	body: await payloadForRoute(route, input),
	headers: headersForRoute(route, input),
	method: route.method,
	path: toPath(route.path, params),
	query: queryForRoute(route, input),
});

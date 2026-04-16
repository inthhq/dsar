import { asNonEmptyString, asObject } from "@dsar/guards";

import { backendErrorCatalogByCode } from "../../types/error-codes";
import { RequestValidationError } from "../../types/errors";
import type { BackendRuntimeError } from "../../types/errors";

const toStringArray = (
	record: Readonly<Record<string, unknown>>,
	key: string
): readonly string[] => {
	const value = record[key];
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
};

/**
 * Parses the normalized Resend inbound payload returned by the adapter.
 *
 * @param payload - Raw adapter payload to validate and normalize.
 * @returns Parsed inbound email payload used for request capture.
 */
export const parseInboundPayload = (payload: unknown) => {
	const object = asObject(payload);
	if (!object) {
		throw new RequestValidationError({
			message: "Inbound adapter returned an invalid payload object.",
			reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
		});
	}
	const route = asObject(object.route);
	const intent = asObject(object.intent);
	const from = asNonEmptyString(object.from) ?? "";
	const fromEmail = asNonEmptyString(object.fromEmail);
	const subject = asNonEmptyString(object.subject) ?? "";
	const content = asObject(object.content);
	const text = content ? asNonEmptyString(content.text) : undefined;
	const routeTenantId = route ? asNonEmptyString(route.tenantId) : undefined;
	const routeJurisdiction = route
		? asNonEmptyString(route.jurisdiction)
		: undefined;
	const routeWorkspaceId = route
		? asNonEmptyString(route.workspaceId)
		: undefined;
	if (!routeTenantId || !routeJurisdiction) {
		throw new RequestValidationError({
			message:
				"Inbound adapter payload is missing routing fields (tenantId/jurisdiction).",
			reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
		});
	}
	const isDsar = intent ? intent.isDsar === true : false;
	return {
		from,
		fromEmail,
		isDsar,
		reason: intent ? asNonEmptyString(intent.reason) : undefined,
		route: {
			jurisdiction: routeJurisdiction,
			tenantId: routeTenantId,
			workspaceId: routeWorkspaceId,
		},
		subject,
		text,
		to: toStringArray(object, "to"),
	};
};

interface SlackUrlVerificationPayload {
	readonly challenge: string;
	readonly kind: "url_verification";
}

interface SlackInboundPayload {
	readonly callbackId?: string;
	readonly channelId?: string;
	readonly intakeSourceChannel: string;
	readonly intent: {
		readonly isDsar: boolean;
		readonly reason?: string;
	};
	readonly kind: "request_capture";
	readonly rawContextRef?: string;
	readonly requestor: {
		readonly email?: string;
		readonly id?: string;
		readonly name?: string;
	};
	readonly route: {
		readonly jurisdiction: string;
		readonly tenantId: string;
		readonly workspaceId?: string;
	};
	readonly surface: string;
	readonly teamId?: string;
	readonly text: string;
}

/** Parsed Slack webhook payload after adapter normalization. */
export type ParsedSlackPayload =
	| SlackInboundPayload
	| SlackUrlVerificationPayload;

const assertSlackPayloadKind = (
	kind: string | undefined
): "request_capture" => {
	if (kind === "request_capture") {
		return kind;
	}
	throw new RequestValidationError({
		message: `Unknown Slack payload kind: ${kind ?? "missing"}.`,
		reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
	});
};

/**
 * Parses the normalized Slack inbound payload returned by the adapter.
 *
 * @param payload - Raw adapter payload to validate and normalize.
 * @returns Parsed Slack webhook payload or URL-verification challenge.
 */
export const parseSlackPayload = (payload: unknown): ParsedSlackPayload => {
	const object = asObject(payload);
	if (!object) {
		throw new RequestValidationError({
			message: "Inbound adapter returned an invalid Slack payload object.",
			reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
		});
	}
	const kind = asNonEmptyString(object.kind);
	if (kind === "url_verification") {
		const challenge = asNonEmptyString(object.challenge);
		if (!challenge) {
			throw new RequestValidationError({
				message: "Slack challenge payload is missing challenge.",
				reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
			});
		}
		return {
			challenge,
			kind,
		} as const;
	}
	assertSlackPayloadKind(kind);
	const route = asObject(object.route);
	const intent = asObject(object.intent);
	const requestor = asObject(object.requestor);
	const routeTenantId = route ? asNonEmptyString(route.tenantId) : undefined;
	const routeJurisdiction = route
		? asNonEmptyString(route.jurisdiction)
		: undefined;
	const routeWorkspaceId = route
		? asNonEmptyString(route.workspaceId)
		: undefined;
	if (!routeTenantId || !routeJurisdiction) {
		throw new RequestValidationError({
			message:
				"Slack inbound payload is missing routing fields (tenantId/jurisdiction).",
			reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
		});
	}
	return {
		callbackId: asNonEmptyString(object.callbackId),
		channelId: asNonEmptyString(object.channelId),
		intakeSourceChannel:
			asNonEmptyString(object.intakeSourceChannel) ?? "slack:unknown",
		intent: {
			isDsar: intent?.isDsar === true,
			reason: intent ? asNonEmptyString(intent.reason) : undefined,
		},
		kind: "request_capture",
		rawContextRef: asNonEmptyString(object.rawContextRef),
		requestor: {
			email: requestor ? asNonEmptyString(requestor.email) : undefined,
			id: requestor ? asNonEmptyString(requestor.id) : undefined,
			name: requestor ? asNonEmptyString(requestor.name) : undefined,
		},
		route: {
			jurisdiction: routeJurisdiction,
			tenantId: routeTenantId,
			workspaceId: routeWorkspaceId,
		},
		surface: asNonEmptyString(object.surface) ?? "slack",
		teamId: asNonEmptyString(object.teamId),
		text: asNonEmptyString(object.text) ?? "",
	};
};

/**
 * Maps Slack adapter auth/validation failures into backend validation errors.
 *
 * @param error - Raw Slack adapter error.
 * @returns Backend runtime error compatible with route-level error handling.
 */
export const mapSlackInboundReceiveError = (
	error: unknown
): BackendRuntimeError => {
	const details = asObject(error);
	const category = asNonEmptyString(details?.category);
	if (category !== "validation" && category !== "auth") {
		return error as BackendRuntimeError;
	}
	return new RequestValidationError({
		details,
		message:
			details && "message" in details
				? String(details.message)
				: "Slack inbound webhook was rejected.",
		reasonCode: backendErrorCatalogByCode.REQUEST_VALIDATION_FAILED.code,
	});
};

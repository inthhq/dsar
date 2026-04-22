import { asRecord } from "@dsar/guards";

import { AdapterInvocationError } from "../../adapters/errors";
import { allowedActionsFromStatus } from "../../lifecycle/state-machine";
import { resolveBackendErrorCatalogEntry } from "../../types/error-codes";
import {
	ForbiddenRequestError,
	FulfilmentGuardError,
	InvalidLifecycleTransitionError,
	MissingLifecycleRationaleError,
	RequestValidationError,
	RouteNotFoundError,
	UnauthorizedRequestError,
} from "../../types/errors";
import type { MappedError } from "./shared";
import {
	asRecordField,
	asString,
	asStringArray,
	asStringField,
	getErrorMessage,
	getStringField,
	hasErrorTag,
	toCatalogCode,
} from "./shared";

const mapUnauthorized = (error: unknown): MappedError | undefined =>
	error instanceof UnauthorizedRequestError ||
	hasErrorTag(error, "UnauthorizedRequestError")
		? {
				code: "AUTH_ACTOR_CONTEXT_MISSING",
				message: getErrorMessage(error, "Missing actor context"),
				status: 401,
			}
		: undefined;

const mapForbidden = (error: unknown): MappedError | undefined => {
	if (
		error instanceof ForbiddenRequestError ||
		hasErrorTag(error, "ForbiddenRequestError")
	) {
		return {
			code: toCatalogCode(
				getStringField(error, "reasonCode", "AUTH_REQUEST_ACCESS_FORBIDDEN")
			),
			message: getErrorMessage(
				error,
				"Authenticated actor does not have access to this resource."
			),
			status: 403,
			trace:
				error !== null && typeof error === "object" && "details" in error
					? asRecord((error as Record<string, unknown>).details)
					: undefined,
		};
	}
	if (hasErrorTag(error, "UnauthorizedApproverError")) {
		return {
			code: "AUTH_APPROVER_ROLE_FORBIDDEN",
			message: "Actor role does not allow this operation.",
			status: 403,
		};
	}
	return undefined;
};

const resolveValidationCode = (
	error: Readonly<Record<string, unknown>>
): MappedError["code"] => {
	const reasonCode = asString(error.reasonCode);
	if (reasonCode) {
		return toCatalogCode(reasonCode);
	}
	const details = asRecordField(error, "details");
	const reasonFromDetails = details ? asString(details.reasonCode) : undefined;
	if (reasonFromDetails) {
		return toCatalogCode(reasonFromDetails);
	}
	return "REQUEST_VALIDATION_FAILED";
};

const mapValidation = (error: unknown): MappedError | undefined => {
	if (
		!(error instanceof RequestValidationError) &&
		!hasErrorTag(error, "RequestValidationError")
	) {
		return undefined;
	}
	const errorRecord = asRecord(error);
	const trace =
		errorRecord && "details" in errorRecord
			? asRecord(errorRecord.details)
			: undefined;
	const code = errorRecord
		? resolveValidationCode(errorRecord)
		: "REQUEST_VALIDATION_FAILED";
	return {
		code,
		message: getErrorMessage(error, "Validation failed."),
		status: resolveBackendErrorCatalogEntry(code).status,
		trace,
	};
};

const mapNotFound = (error: unknown): MappedError | undefined =>
	error instanceof RouteNotFoundError ||
	hasErrorTag(error, "RouteNotFoundError")
		? {
				code: "REQUEST_ROUTE_NOT_FOUND",
				message: `${asStringField(error, "method", "UNKNOWN")} ${asStringField(error, "path", "unknown")} is not registered.`,
				status: 404,
			}
		: undefined;

const mapPolicyActivationNotFound = (error: unknown): MappedError | undefined =>
	hasErrorTag(error, "PolicyActivationNotFoundError")
		? {
				code: "POLICY_ACTIVATION_NOT_FOUND",
				message: "No active policy assignment found for the provided scope.",
				status: 404,
			}
		: undefined;

const mapPolicyUpgradeProposalNotFound = (
	error: unknown
): MappedError | undefined =>
	hasErrorTag(error, "UpgradeProposalNotFoundError")
		? {
				code: "POLICY_UPGRADE_PROPOSAL_NOT_FOUND",
				message: "Policy upgrade proposal was not found.",
				status: 404,
				trace: {
					proposalId: getStringField(error, "proposalId", "unknown"),
				},
			}
		: undefined;

const mapPolicyUpgradeApprovalRequired = (
	error: unknown
): MappedError | undefined =>
	hasErrorTag(error, "UpgradeApprovalRequiredError")
		? {
				code: "POLICY_UPGRADE_APPROVAL_REQUIRED",
				message: "Policy upgrade proposal must be approved before apply.",
				status: 409,
				trace: {
					proposalId: getStringField(error, "proposalId", "unknown"),
				},
			}
		: undefined;

const getTraceForUnmappedJurisdiction = (
	error: unknown
): MappedError["trace"] => {
	const jurisdiction = getStringField(error, "jurisdiction", "unknown");
	const tenantId = getStringField(error, "tenantId", "tenant-default");
	const record = asRecord(error);
	const workspaceId = record?.workspaceId;
	return {
		guidanceKeys: asStringArray(
			record?.guidanceKeys ?? (error as { guidanceKeys?: unknown }).guidanceKeys
		),
		jurisdiction,
		scope: {
			tenantId,
			workspaceId: workspaceId === undefined ? undefined : String(workspaceId),
		},
	};
};

const mapUnmappedJurisdiction = (error: unknown): MappedError | undefined =>
	hasErrorTag(error, "UnmappedJurisdictionError")
		? {
				code: "POLICY_JURISDICTION_UNMAPPED",
				message: getErrorMessage(
					error,
					"No mapped policy pack for this jurisdiction."
				),
				status: 400,
				trace: getTraceForUnmappedJurisdiction(error),
			}
		: undefined;

const mapInvalidTransition = (error: unknown): MappedError | undefined => {
	if (
		!(error instanceof InvalidLifecycleTransitionError) &&
		!hasErrorTag(error, "InvalidLifecycleTransitionError")
	) {
		return undefined;
	}
	const currentState = asStringField(error, "from", "unknown");
	const attemptedTransition = asStringField(error, "action", "unknown");
	return {
		code: toCatalogCode(
			asStringField(error, "reasonCode", "LIFECYCLE_TRANSITION_DISALLOWED")
		),
		message: `Lifecycle transition disallowed: cannot apply "${attemptedTransition}" from "${currentState}" state.`,
		status: 409,
		trace: {
			lifecycle: {
				allowedTransitions: allowedActionsFromStatus(currentState),
				attemptedTransition,
				currentState,
			},
		},
	};
};

const mapMissingRationale = (error: unknown): MappedError | undefined =>
	error instanceof MissingLifecycleRationaleError ||
	hasErrorTag(error, "MissingLifecycleRationaleError")
		? {
				code: toCatalogCode(
					asStringField(error, "reasonCode", "LIFECYCLE_RATIONALE_MISSING")
				),
				message: `Transition ${asStringField(error, "action", "unknown")} requires rationale.`,
				status: 400,
			}
		: undefined;

const mapFulfilmentGuard = (error: unknown): MappedError | undefined => {
	if (
		!(error instanceof FulfilmentGuardError) &&
		!hasErrorTag(error, "FulfilmentGuardError")
	) {
		return undefined;
	}
	const code = toCatalogCode(
		asStringField(error, "reasonCode", "FULFILMENT_MANIFEST_NOT_APPROVED")
	);
	const entry = resolveBackendErrorCatalogEntry(code);
	return {
		code,
		message: entry.title,
		status: entry.status,
		trace: {
			requestId: asStringField(error, "requestId", "unknown"),
		},
	};
};

const mapMissingTenantScope = (error: unknown): MappedError | undefined => {
	if (!hasErrorTag(error, "MissingTenantScopeError")) {
		return undefined;
	}
	const entry = resolveBackendErrorCatalogEntry(
		"PERSISTENCE_TENANT_SCOPE_MISSING"
	);
	return {
		code: entry.code,
		message: getErrorMessage(error, entry.title),
		status: entry.status,
		trace: {
			operation: getStringField(error, "operation", "unknown"),
			type: "MissingTenantScopeError",
		},
	};
};

const mapPersistenceEntityNotFound = (
	error: unknown
): MappedError | undefined => {
	if (!hasErrorTag(error, "PersistenceEntityNotFoundError")) {
		return undefined;
	}
	const entry = resolveBackendErrorCatalogEntry("PERSISTENCE_ENTITY_NOT_FOUND");
	const entity = getStringField(error, "entity", "unknown");
	const id = getStringField(error, "id", "unknown");
	return {
		code: entry.code,
		message: `Entity not found: ${entity} (${id}).`,
		status: entry.status,
		trace: {
			entity,
			id,
			type: "PersistenceEntityNotFoundError",
		},
	};
};

const mapUnsupportedPersistenceOperation = (
	error: unknown
): MappedError | undefined => {
	if (!hasErrorTag(error, "UnsupportedPersistenceOperationError")) {
		return undefined;
	}
	const entry = resolveBackendErrorCatalogEntry(
		"PERSISTENCE_OPERATION_UNSUPPORTED"
	);
	return {
		code: entry.code,
		message: getErrorMessage(error, entry.title),
		status: entry.status,
		trace: {
			operation: getStringField(error, "operation", "unknown"),
			reason: getStringField(error, "reason", "unknown"),
			type: "UnsupportedPersistenceOperationError",
		},
	};
};

const mapPersistenceInvalidRecord = (
	error: unknown
): MappedError | undefined => {
	if (!hasErrorTag(error, "PersistenceInvalidRecordError")) {
		return undefined;
	}
	const entry = resolveBackendErrorCatalogEntry("PERSISTENCE_INVALID_RECORD");
	return {
		code: entry.code,
		message: getErrorMessage(error, entry.title),
		status: entry.status,
		trace: {
			entity: getStringField(error, "entity", "unknown"),
			field: getStringField(error, "field", "unknown"),
			type: "PersistenceInvalidRecordError",
		},
	};
};

const mapSqlError = (error: unknown): MappedError | undefined => {
	if (!hasErrorTag(error, "SqlError")) {
		return undefined;
	}
	const entry = resolveBackendErrorCatalogEntry("PERSISTENCE_SQL_ERROR");
	return {
		code: entry.code,
		message: entry.title,
		status: entry.status,
		trace: {
			type: "SqlError",
		},
	};
};

const mapAdapterInvocation = (error: unknown): MappedError | undefined => {
	if (
		!(error instanceof AdapterInvocationError) &&
		!hasErrorTag(error, "AdapterInvocationError")
	) {
		return undefined;
	}
	const record = asRecord(error);
	return {
		code: "INTERNAL_RUNTIME_ERROR",
		message: getErrorMessage(error, "Adapter invocation failed."),
		status: 500,
		trace: {
			adapterKey: asStringField(error, "adapterKey", "unknown"),
			capability: asStringField(error, "capability", "unknown"),
			category: asStringField(error, "category", "unknown"),
			details: record ? asRecord(record.details) : undefined,
			retriable: record?.retriable === true,
			type: "AdapterInvocationError",
		},
	};
};

/** Ordered backend error mappers evaluated when rendering error responses. */
export const errorMappers = [
	mapUnauthorized,
	mapForbidden,
	mapValidation,
	mapNotFound,
	mapPolicyActivationNotFound,
	mapPolicyUpgradeProposalNotFound,
	mapPolicyUpgradeApprovalRequired,
	mapPersistenceEntityNotFound,
	mapUnmappedJurisdiction,
	mapInvalidTransition,
	mapMissingRationale,
	mapFulfilmentGuard,
	mapMissingTenantScope,
	mapUnsupportedPersistenceOperation,
	mapPersistenceInvalidRecord,
	mapSqlError,
	mapAdapterInvocation,
];

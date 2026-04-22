import {
	createErrorCodeSchema,
	createErrorRegistry,
	DSAR_ERROR_DOCS_BASE_URL,
	isKnownErrorCode,
} from "@dsar/internals-error-codes";
import type {
	ErrorCatalogEntry,
	ErrorCatalogInputEntry,
} from "@dsar/internals-error-codes";

const BACKEND_CATALOG_ENTRIES = [
	{
		code: "AUTH_ACTOR_CONTEXT_MISSING",
		docsSlug: "dsar-be-1001",
		id: "DSAR-BE-1001",
		namespace: "backend",
		status: 401,
		title: "Missing actor auth context",
	},
	{
		code: "AUTH_APPROVER_ROLE_FORBIDDEN",
		docsSlug: "dsar-be-1002",
		id: "DSAR-BE-1002",
		namespace: "backend",
		status: 403,
		title: "Actor role does not allow operation",
	},
	{
		code: "AUTH_REQUEST_ACCESS_FORBIDDEN",
		docsSlug: "dsar-be-1003",
		id: "DSAR-BE-1003",
		namespace: "backend",
		status: 403,
		title: "Authenticated actor cannot access requested resource",
	},
	{
		code: "REQUEST_BODY_INVALID_JSON",
		docsSlug: "dsar-be-1101",
		id: "DSAR-BE-1101",
		namespace: "backend",
		status: 400,
		title: "Request body is not valid JSON",
	},
	{
		code: "REQUEST_ROUTE_PARAM_MISSING",
		docsSlug: "dsar-be-1102",
		id: "DSAR-BE-1102",
		namespace: "backend",
		status: 400,
		title: "Required route parameter is missing",
	},
	{
		code: "REQUEST_BASE_PATH_INVALID",
		docsSlug: "dsar-be-1103",
		id: "DSAR-BE-1103",
		namespace: "backend",
		status: 400,
		title: "Runtime base path configuration is invalid",
	},
	{
		code: "REQUEST_VALIDATION_FAILED",
		docsSlug: "dsar-be-1199",
		id: "DSAR-BE-1199",
		namespace: "backend",
		status: 400,
		title: "Request validation failed",
	},
	{
		code: "REQUEST_ROUTE_NOT_FOUND",
		docsSlug: "dsar-be-1201",
		id: "DSAR-BE-1201",
		namespace: "backend",
		status: 404,
		title: "Route path is not registered",
	},
	{
		code: "POLICY_ACTIVATION_NOT_FOUND",
		docsSlug: "dsar-be-1202",
		id: "DSAR-BE-1202",
		namespace: "backend",
		status: 404,
		title: "Policy activation not found",
	},
	{
		code: "POLICY_UPGRADE_PROPOSAL_NOT_FOUND",
		docsSlug: "dsar-be-1203",
		id: "DSAR-BE-1203",
		namespace: "backend",
		status: 404,
		title: "Policy upgrade proposal not found",
	},
	{
		code: "DELIVERY_ARTIFACT_NOT_FOUND",
		docsSlug: "dsar-be-1204",
		id: "DSAR-BE-1204",
		namespace: "backend",
		status: 404,
		title: "Delivery artifact not found",
	},
	{
		code: "DELIVERY_TOKEN_INVALID",
		docsSlug: "dsar-be-1205",
		id: "DSAR-BE-1205",
		namespace: "backend",
		status: 403,
		title: "Delivery token is missing or invalid",
	},
	{
		code: "MANIFEST_ARTIFACT_UPLOAD_FAILED",
		docsSlug: "dsar-be-1206",
		id: "DSAR-BE-1206",
		namespace: "backend",
		status: 400,
		title: "Manifest artifact upload failed",
	},
	{
		code: "MANIFEST_ARTIFACT_DOWNLOAD_FAILED",
		docsSlug: "dsar-be-1207",
		id: "DSAR-BE-1207",
		namespace: "backend",
		status: 404,
		title: "Manifest artifact download failed",
	},
	{
		code: "MANIFEST_ARTIFACT_REPLACE_FAILED",
		docsSlug: "dsar-be-1208",
		id: "DSAR-BE-1208",
		namespace: "backend",
		status: 400,
		title: "Manifest artifact replacement failed",
	},
	{
		code: "FULFILMENT_MANIFEST_NOT_APPROVED",
		docsSlug: "dsar-be-1209",
		id: "DSAR-BE-1209",
		namespace: "backend",
		status: 409,
		title: "Fulfilment blocked — manifest not approved",
	},
	{
		code: "FULFILMENT_NO_ARTIFACTS",
		docsSlug: "dsar-be-1210",
		id: "DSAR-BE-1210",
		namespace: "backend",
		status: 409,
		title: "Fulfilment blocked — no artifacts in manifest",
	},
	{
		code: "POLICY_JURISDICTION_UNMAPPED",
		docsSlug: "dsar-be-1301",
		id: "DSAR-BE-1301",
		namespace: "backend",
		status: 400,
		title: "No policy pack mapped for jurisdiction",
	},
	{
		code: "POLICY_ENFORCEMENT_REFUSAL_BLOCKED",
		docsSlug: "dsar-be-1302",
		id: "DSAR-BE-1302",
		namespace: "backend",
		status: 403,
		title: "Refusal blocked by active policy",
	},
	{
		code: "POLICY_UPGRADE_APPROVAL_REQUIRED",
		docsSlug: "dsar-be-1303",
		id: "DSAR-BE-1303",
		namespace: "backend",
		status: 409,
		title: "Policy upgrade approval required",
	},
	{
		code: "RETENTION_CLASS_INVALID",
		docsSlug: "dsar-be-1304",
		id: "DSAR-BE-1304",
		namespace: "backend",
		status: 400,
		title: "Invalid retention class",
	},
	{
		code: "LIFECYCLE_TRANSITION_DISALLOWED",
		docsSlug: "dsar-be-1401",
		id: "DSAR-BE-1401",
		namespace: "backend",
		status: 409,
		title: "Lifecycle transition disallowed",
	},
	{
		code: "LIFECYCLE_STATUS_UNKNOWN",
		docsSlug: "dsar-be-1402",
		id: "DSAR-BE-1402",
		namespace: "backend",
		status: 409,
		title: "Unknown lifecycle status",
	},
	{
		code: "LIFECYCLE_RATIONALE_MISSING",
		docsSlug: "dsar-be-1403",
		id: "DSAR-BE-1403",
		namespace: "backend",
		status: 400,
		title: "Lifecycle rationale required",
	},
	{
		code: "PERSISTENCE_TENANT_SCOPE_MISSING",
		docsSlug: "dsar-be-1410",
		id: "DSAR-BE-1410",
		namespace: "backend",
		status: 500,
		title: "Persistence operation missing tenant scope",
	},
	{
		code: "PERSISTENCE_ENTITY_NOT_FOUND",
		docsSlug: "dsar-be-1411",
		id: "DSAR-BE-1411",
		namespace: "backend",
		status: 404,
		title: "Persistence entity not found",
	},
	{
		code: "PERSISTENCE_OPERATION_UNSUPPORTED",
		docsSlug: "dsar-be-1412",
		id: "DSAR-BE-1412",
		namespace: "backend",
		status: 400,
		title: "Persistence operation not supported",
	},
	{
		code: "PERSISTENCE_INVALID_RECORD",
		docsSlug: "dsar-be-1413",
		id: "DSAR-BE-1413",
		namespace: "backend",
		status: 400,
		title: "Persisted record violates domain contract",
	},
	{
		code: "PERSISTENCE_SQL_ERROR",
		docsSlug: "dsar-be-1414",
		id: "DSAR-BE-1414",
		namespace: "backend",
		status: 500,
		title: "SQL query execution failure",
	},
	{
		code: "INTERNAL_RUNTIME_ERROR",
		docsSlug: "dsar-be-1500",
		id: "DSAR-BE-1500",
		namespace: "backend",
		status: 500,
		title: "Unhandled runtime error",
	},
	{
		code: "INTERNAL_UNCATALOGED_ERROR",
		docsSlug: "dsar-be-1599",
		id: "DSAR-BE-1599",
		namespace: "backend",
		status: 500,
		title: "Uncataloged backend error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-BE-${number}`
>[];

/** Union of all backend error code strings derived from the catalog. */
export type BackendErrorCode = (typeof BACKEND_CATALOG_ENTRIES)[number]["code"];

/** Union of all backend error ID strings (e.g. `"DSAR-BE-1001"`) derived from the catalog. */
export type BackendErrorId = (typeof BACKEND_CATALOG_ENTRIES)[number]["id"];

/** Fully resolved catalog entry keyed by {@link BackendErrorCode} and {@link BackendErrorId}. */
export type BackendErrorCatalogEntry = ErrorCatalogEntry<
	BackendErrorCode,
	BackendErrorId
>;

/** Readonly mapping of commonly referenced reason keys to their {@link BackendErrorCode} values. */
export const BACKEND_REASON_CODES = {
	INTERNAL_RUNTIME_ERROR: "INTERNAL_RUNTIME_ERROR",
	LIFECYCLE_RATIONALE_MISSING: "LIFECYCLE_RATIONALE_MISSING",
	REQUEST_VALIDATION_FAILED: "REQUEST_VALIDATION_FAILED",
} as const satisfies Readonly<Record<string, BackendErrorCode>>;

const backendRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: BACKEND_CATALOG_ENTRIES,
	fallbackCode: "INTERNAL_UNCATALOGED_ERROR",
});

/** Readonly tuple enumerating every {@link BackendErrorCode} in catalog order. */
export const BACKEND_ERROR_CODES = backendRegistry.codes as readonly [
	BackendErrorCode,
	...BackendErrorCode[],
];

/** Readonly array enumerating every {@link BackendErrorId} in catalog order. */
export const BACKEND_ERROR_IDS = BACKEND_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly BackendErrorId[];

/** Validation schema that accepts any {@link BackendErrorCode}; rejects unknown codes with `"Invalid DSAR backend error code."`. */
export const ErrorCodeSchema = createErrorCodeSchema(
	BACKEND_ERROR_CODES,
	"Invalid DSAR backend error code."
);

/** Lookup map returning a {@link BackendErrorCatalogEntry} for a given {@link BackendErrorCode}. */
export const backendErrorCatalogByCode = backendRegistry.byCode as Readonly<
	Record<BackendErrorCode, BackendErrorCatalogEntry>
>;

/** Lookup map returning a {@link BackendErrorCatalogEntry} for a given {@link BackendErrorId}. */
export const backendErrorCatalogById = backendRegistry.byId as Readonly<
	Record<BackendErrorId, BackendErrorCatalogEntry>
>;

const backendErrorCodeSet = new Set(BACKEND_ERROR_CODES);

/**
 * Type guard that checks whether a string is a known {@link BackendErrorCode}
 * by testing membership against the internal code set.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` is a valid {@link BackendErrorCode}.
 */
export const isBackendErrorCode = (code: string): code is BackendErrorCode =>
	isKnownErrorCode(backendErrorCodeSet, code);

/**
 * Resolves a code string to its {@link BackendErrorCatalogEntry}, falling back
 * to the `INTERNAL_UNCATALOGED_ERROR` entry when the code is not in the catalog.
 *
 * @param code - Error code to look up in the backend catalog.
 * @returns Matching catalog entry, or the fallback entry for unknown codes.
 */
export const resolveBackendErrorCatalogEntry = (
	code: string
): BackendErrorCatalogEntry => backendRegistry.resolve(code);

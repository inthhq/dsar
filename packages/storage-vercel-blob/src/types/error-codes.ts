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

const STORAGE_VERCEL_BLOB_CATALOG_ENTRIES = [
	{
		code: "STORAGE_VERCEL_BLOB_FETCH_FAILED",
		docsSlug: "dsar-vb-1001",
		id: "DSAR-VB-1001",
		namespace: "storage-vercel-blob",
		status: 502,
		title: "Blob payload fetch failed",
	},
	{
		code: "STORAGE_VERCEL_BLOB_RETRY_EXHAUSTED",
		docsSlug: "dsar-vb-1002",
		id: "DSAR-VB-1002",
		namespace: "storage-vercel-blob",
		status: 500,
		title: "Vercel Blob retry attempts exhausted",
	},
	{
		code: "STORAGE_VERCEL_BLOB_RUNTIME_ERROR",
		docsSlug: "dsar-vb-1500",
		id: "DSAR-VB-1500",
		namespace: "storage-vercel-blob",
		status: 500,
		title: "Vercel Blob storage runtime failure",
	},
	{
		code: "STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR",
		docsSlug: "dsar-vb-1599",
		id: "DSAR-VB-1599",
		namespace: "storage-vercel-blob",
		status: 500,
		title: "Uncataloged Vercel Blob storage error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-VB-${number}`
>[];

/**
 * Union of machine-readable error codes emitted by the Vercel Blob storage
 * adapter.
 *
 * @public
 */
export type StorageVercelBlobErrorCode =
	(typeof STORAGE_VERCEL_BLOB_CATALOG_ENTRIES)[number]["code"];
/**
 * Union of stable error identifiers (e.g. `DSAR-VB-1500`) for documentation
 * and log correlation.
 *
 * @public
 */
export type StorageVercelBlobErrorId =
	(typeof STORAGE_VERCEL_BLOB_CATALOG_ENTRIES)[number]["id"];
/**
 * Fully-resolved catalog entry pairing a {@link StorageVercelBlobErrorCode}
 * with its human-readable title, docs URL, and HTTP status.
 *
 * @public
 */
export type StorageVercelBlobErrorCatalogEntry = ErrorCatalogEntry<
	StorageVercelBlobErrorCode,
	StorageVercelBlobErrorId
>;

const storageVercelBlobRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: STORAGE_VERCEL_BLOB_CATALOG_ENTRIES,
	fallbackCode: "STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR",
});

/**
 * Non-empty tuple of all registered Vercel Blob storage error codes.
 */
export const STORAGE_VERCEL_BLOB_ERROR_CODES =
	storageVercelBlobRegistry.codes as readonly [
		StorageVercelBlobErrorCode,
		...StorageVercelBlobErrorCode[],
	];
/**
 * Ordered list of stable Vercel Blob storage error identifiers for
 * documentation tooling.
 */
export const STORAGE_VERCEL_BLOB_ERROR_IDS = Object.freeze(
	STORAGE_VERCEL_BLOB_CATALOG_ENTRIES.map((entry) => entry.id)
) as readonly StorageVercelBlobErrorId[];
/**
 * Schema that validates a string as a known
 * {@link StorageVercelBlobErrorCode}.
 */
export const StorageVercelBlobErrorCodeSchema = createErrorCodeSchema(
	STORAGE_VERCEL_BLOB_ERROR_CODES,
	"Invalid storage-vercel-blob error code."
);

const storageVercelBlobCodeSet = new Set(STORAGE_VERCEL_BLOB_ERROR_CODES);
/**
 * Checks whether a given error code belongs to the Vercel Blob storage set.
 *
 * @param code - The error code string to test against
 *   `storageVercelBlobCodeSet`.
 * @returns `true` if `code` is a known {@link StorageVercelBlobErrorCode}
 *   (delegates to {@link isKnownErrorCode} with `storageVercelBlobCodeSet`);
 *   `false` otherwise.
 */
export const isStorageVercelBlobErrorCode = (
	code: string
): code is StorageVercelBlobErrorCode =>
	isKnownErrorCode(storageVercelBlobCodeSet, code);

/**
 * Resolves a {@link StorageVercelBlobErrorCatalogEntry} for the given code.
 *
 * @param code - The error code string to look up in the Vercel Blob storage
 *   registry.
 * @returns The matching catalog entry when `code` is recognised, or the
 *   `STORAGE_VERCEL_BLOB_UNCATALOGED_ERROR` fallback entry otherwise.
 */
export const resolveStorageVercelBlobErrorCatalogEntry = (
	code: string
): StorageVercelBlobErrorCatalogEntry =>
	storageVercelBlobRegistry.resolve(code);

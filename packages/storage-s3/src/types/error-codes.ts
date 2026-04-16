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

const STORAGE_S3_CATALOG_ENTRIES = [
	{
		code: "STORAGE_S3_RUNTIME_ERROR",
		docsSlug: "dsar-s3-1500",
		id: "DSAR-S3-1500",
		namespace: "storage-s3",
		status: 500,
		title: "S3 storage runtime failure",
	},
	{
		code: "STORAGE_S3_UNCATALOGED_ERROR",
		docsSlug: "dsar-s3-1599",
		id: "DSAR-S3-1599",
		namespace: "storage-s3",
		status: 500,
		title: "Uncataloged S3 storage error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-S3-${number}`
>[];

/** Union of allowed S3 storage error code strings derived from the catalog. */
export type StorageS3ErrorCode =
	(typeof STORAGE_S3_CATALOG_ENTRIES)[number]["code"];

/** Union of allowed S3 storage error ID strings (e.g. `"DSAR-S3-1500"`) derived from the catalog. */
export type StorageS3ErrorId =
	(typeof STORAGE_S3_CATALOG_ENTRIES)[number]["id"];

/** Fully resolved catalog entry pairing a {@link StorageS3ErrorCode} with its {@link StorageS3ErrorId}. */
export type StorageS3ErrorCatalogEntry = ErrorCatalogEntry<
	StorageS3ErrorCode,
	StorageS3ErrorId
>;

const storageS3Registry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: STORAGE_S3_CATALOG_ENTRIES,
	fallbackCode: "STORAGE_S3_UNCATALOGED_ERROR",
});

/** Readonly tuple enumerating every {@link StorageS3ErrorCode} in catalog order. */
export const STORAGE_S3_ERROR_CODES = storageS3Registry.codes as readonly [
	StorageS3ErrorCode,
	...StorageS3ErrorCode[],
];

/** Readonly array enumerating every {@link StorageS3ErrorId} in catalog order. */
export const STORAGE_S3_ERROR_IDS = STORAGE_S3_CATALOG_ENTRIES.map(
	(entry) => entry.id
) as readonly StorageS3ErrorId[];

/** Validation schema that accepts any {@link StorageS3ErrorCode}; rejects unknown codes with `"Invalid storage-s3 error code."`. */
export const StorageS3ErrorCodeSchema = createErrorCodeSchema(
	STORAGE_S3_ERROR_CODES,
	"Invalid storage-s3 error code."
);

const storageS3CodeSet = new Set(STORAGE_S3_ERROR_CODES);
/**
 * Type guard that returns `true` when a string is a known {@link StorageS3ErrorCode}.
 *
 * @param code - Candidate error code string to test.
 * @returns `true` when `code` belongs to the S3 storage error catalog.
 */
export const isStorageS3ErrorCode = (
	code: string
): code is StorageS3ErrorCode => isKnownErrorCode(storageS3CodeSet, code);

/**
 * Resolves a code string to its {@link StorageS3ErrorCatalogEntry}, falling
 * back to the `STORAGE_S3_UNCATALOGED_ERROR` entry when the code is not found.
 *
 * @param code - Error code to look up in the S3 storage catalog.
 * @returns Matching catalog entry, or the fallback entry for unknown codes.
 */
export const resolveStorageS3ErrorCatalogEntry = (
	code: string
): StorageS3ErrorCatalogEntry => storageS3Registry.resolve(code);

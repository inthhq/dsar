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

const STORAGE_FILESYSTEM_CATALOG_ENTRIES = [
	{
		code: "STORAGE_FILESYSTEM_RETRY_EXHAUSTED",
		docsSlug: "dsar-fs-1001",
		id: "DSAR-FS-1001",
		namespace: "storage-filesystem",
		status: 500,
		title: "Filesystem adapter retry attempts exhausted",
	},
	{
		code: "STORAGE_FILESYSTEM_RUNTIME_ERROR",
		docsSlug: "dsar-fs-1500",
		id: "DSAR-FS-1500",
		namespace: "storage-filesystem",
		status: 500,
		title: "Filesystem storage runtime failure",
	},
	{
		code: "STORAGE_FILESYSTEM_UNCATALOGED_ERROR",
		docsSlug: "dsar-fs-1599",
		id: "DSAR-FS-1599",
		namespace: "storage-filesystem",
		status: 500,
		title: "Uncataloged filesystem storage error",
	},
] as const satisfies readonly ErrorCatalogInputEntry<
	string,
	`DSAR-FS-${number}`
>[];

/** Union of permitted storage-filesystem error code strings derived from the catalog. */
export type StorageFilesystemErrorCode =
	(typeof STORAGE_FILESYSTEM_CATALOG_ENTRIES)[number]["code"];

/** Union of storage-filesystem error ID strings (e.g. `"DSAR-FS-1500"`) derived from the catalog. */
export type StorageFilesystemErrorId =
	(typeof STORAGE_FILESYSTEM_CATALOG_ENTRIES)[number]["id"];

/** Fully resolved catalog entry pairing a {@link StorageFilesystemErrorCode} with its {@link StorageFilesystemErrorId}. */
export type StorageFilesystemErrorCatalogEntry = ErrorCatalogEntry<
	StorageFilesystemErrorCode,
	StorageFilesystemErrorId
>;

const storageFilesystemRegistry = createErrorRegistry({
	docsBaseUrl: DSAR_ERROR_DOCS_BASE_URL,
	entries: STORAGE_FILESYSTEM_CATALOG_ENTRIES,
	fallbackCode: "STORAGE_FILESYSTEM_UNCATALOGED_ERROR",
});

/** Immutable list of every registered {@link StorageFilesystemErrorCode} produced by {@link createErrorRegistry}. */
export const STORAGE_FILESYSTEM_ERROR_CODES =
	storageFilesystemRegistry.codes as readonly [
		StorageFilesystemErrorCode,
		...StorageFilesystemErrorCode[],
	];

/** Readonly array of catalog entry {@link StorageFilesystemErrorId} values in catalog order. */
export const STORAGE_FILESYSTEM_ERROR_IDS =
	STORAGE_FILESYSTEM_CATALOG_ENTRIES.map(
		(entry) => entry.id
	) as readonly StorageFilesystemErrorId[];

/** Validation schema that accepts any {@link StorageFilesystemErrorCode}; rejects unknown codes with `"Invalid storage-filesystem error code."`. */
export const StorageFilesystemErrorCodeSchema = createErrorCodeSchema(
	STORAGE_FILESYSTEM_ERROR_CODES,
	"Invalid storage-filesystem error code."
);

const storageFilesystemCodeSet = new Set(STORAGE_FILESYSTEM_ERROR_CODES);
/**
 * Type guard that checks whether a string is a known
 * {@link StorageFilesystemErrorCode}.
 *
 * @param code - Candidate error code string to validate.
 * @returns `true` when `code` is a registered storage-filesystem error code,
 *   narrowing the type to {@link StorageFilesystemErrorCode}; `false` otherwise.
 */
export const isStorageFilesystemErrorCode = (
	code: string
): code is StorageFilesystemErrorCode =>
	isKnownErrorCode(storageFilesystemCodeSet, code);

/**
 * Resolves a code string to its full catalog entry, falling back to
 * `STORAGE_FILESYSTEM_UNCATALOGED_ERROR` for unknown codes.
 *
 * @param code - Error code string to resolve against the storage-filesystem
 *   catalog.
 * @returns The matching catalog entry, or the fallback entry when
 *   `code` is not recognised.
 */
export const resolveStorageFilesystemErrorCatalogEntry = (
	code: string
): StorageFilesystemErrorCatalogEntry =>
	storageFilesystemRegistry.resolve(code);

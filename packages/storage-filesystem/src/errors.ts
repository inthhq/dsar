import { asRecord } from "@dsar/guards";

import type {
	FilesystemAdapterInvocationError,
	FilesystemErrorCategory,
} from "./types";
import type { StorageFilesystemErrorCode } from "./types/error-codes";
import { resolveStorageFilesystemErrorCatalogEntry } from "./types/error-codes";

const RETRIABLE_CATEGORIES = new Set<FilesystemErrorCategory>([
	"network",
	"timeout",
]);

/** Adapter-specific error wrapper for filesystem storage failures. */
export class FilesystemInvocationError
	extends Error
	implements FilesystemAdapterInvocationError
{
	readonly _tag = "AdapterInvocationError";
	readonly adapterKey = "storage-filesystem";
	readonly capability = "storage";
	readonly category: FilesystemErrorCategory;
	readonly retriable: boolean;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(input: {
		readonly category: FilesystemErrorCategory;
		readonly details?: Readonly<Record<string, unknown>>;
		readonly message: string;
	}) {
		super(input.message);
		this.name = "AdapterInvocationError";
		this.category = input.category;
		this.details = input.details;
		this.retriable = RETRIABLE_CATEGORIES.has(input.category);
	}
}

const CATEGORY_MATCHERS: readonly {
	readonly category: FilesystemErrorCategory;
	readonly tokens: readonly string[];
}[] = [
	{ category: "timeout", tokens: ["timeout", "timed out"] },
	{ category: "network", tokens: ["busy", "temporarily unavailable"] },
	{
		category: "validation",
		tokens: ["invalid", "malformed", "outside configured baseDir"],
	},
	{ category: "config", tokens: ["config", "configuration"] },
];

const readErrorCode = (error: unknown) => {
	const details = asRecord(error);
	const code = details?.code;
	return typeof code === "string" ? code : undefined;
};

const errnoCategory = (code: string | undefined): FilesystemErrorCategory => {
	switch (code) {
		case "ETIMEDOUT": {
			return "timeout";
		}
		case "EAGAIN":
		case "EBUSY":
		case "EMFILE":
		case "ENFILE": {
			return "network";
		}
		case "EINVAL":
		case "EISDIR":
		case "ENOTDIR":
		case "ENOENT":
		case "EEXIST": {
			return "validation";
		}
		case "EACCES":
		case "EPERM": {
			return "config";
		}
		default: {
			return "unknown";
		}
	}
};

const classifyByMessage = (message: string): FilesystemErrorCategory => {
	const lower = message.toLowerCase();
	for (const matcher of CATEGORY_MATCHERS) {
		if (matcher.tokens.some((token) => lower.includes(token))) {
			return matcher.category;
		}
	}
	return "unknown";
};

/**
 * Creates a catalog-backed filesystem adapter error.
 *
 * @param input - Error category, message, optional details, and optional catalog override.
 * @returns A normalized filesystem adapter invocation error.
 */
export const createFilesystemError = (input: {
	readonly catalogCode?: StorageFilesystemErrorCode;
	readonly category: FilesystemErrorCategory;
	readonly details?: Readonly<Record<string, unknown>>;
	readonly message: string;
}): FilesystemAdapterInvocationError => {
	const catalogEntry = resolveStorageFilesystemErrorCatalogEntry(
		input.catalogCode ??
			(input.category === "unknown"
				? "STORAGE_FILESYSTEM_UNCATALOGED_ERROR"
				: "STORAGE_FILESYSTEM_RUNTIME_ERROR")
	);
	return new FilesystemInvocationError({
		category: input.category,
		details: {
			...input.details,
			docsUrl: catalogEntry.docsUrl,
			errorCode: catalogEntry.code,
			errorId: catalogEntry.id,
			status: catalogEntry.status,
		},
		message: input.message,
	});
};

/**
 * Checks whether an error represents a missing filesystem path.
 *
 * @param error - Raw provider error.
 * @returns Whether the provider reported `ENOENT`.
 */
export const isPathMissingError = (error: unknown): boolean =>
	readErrorCode(error) === "ENOENT";

/**
 * Normalizes provider-specific filesystem errors into the adapter contract.
 *
 * @param error - Raw provider error value.
 * @returns A normalized filesystem adapter invocation error.
 */
export const normalizeFilesystemProviderError = (
	error: unknown
): FilesystemAdapterInvocationError => {
	if (error instanceof FilesystemInvocationError) {
		return error;
	}
	const message =
		error instanceof Error
			? error.message
			: "Filesystem adapter invocation failed.";
	const errorCode = readErrorCode(error);
	const category = errorCode
		? errnoCategory(errorCode)
		: classifyByMessage(message);
	return createFilesystemError({
		category,
		details: asRecord(error),
		message,
	});
};

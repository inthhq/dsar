import {
	createFilesystemError,
	normalizeFilesystemProviderError,
} from "./errors";

/**
 * Retries a filesystem operation until it succeeds or retry budget is exhausted.
 *
 * @param run - Filesystem operation to execute.
 * @param retryMaxAttempts - Maximum number of attempts before failing.
 * @typeParam T - Successful result type returned by the filesystem operation.
 * @returns The successful operation result.
 * @throws {FilesystemAdapterInvocationError} When retry budget is exhausted or a non-retriable error occurs.
 */
export const runWithRetry = async <T>(
	run: () => Promise<T>,
	retryMaxAttempts: number
): Promise<T> => {
	for (let attempt = 1; attempt <= retryMaxAttempts; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			const normalized = normalizeFilesystemProviderError(error);
			if (!normalized.retriable) {
				throw error;
			}
			if (attempt === retryMaxAttempts) {
				throw createFilesystemError({
					catalogCode: "STORAGE_FILESYSTEM_RETRY_EXHAUSTED",
					category: "unknown",
					details: {
						lastError: error instanceof Error ? error.message : String(error),
					},
					message: "Filesystem adapter retry failed.",
				});
			}
		}
	}
	throw createFilesystemError({
		catalogCode: "STORAGE_FILESYSTEM_RETRY_EXHAUSTED",
		category: "unknown",
		message: "Filesystem adapter retry failed.",
	});
};

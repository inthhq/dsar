import { Persistence } from "@dsar/persistence";
import type { PersistenceService } from "@dsar/persistence";

import type { RuntimeRepos } from "./types/runtime";

export { Persistence };

/**
 * Adapts a {@link PersistenceService} into the {@link RuntimeRepos}
 * shape expected by backend services.
 *
 * @param persistence - The `@dsar/persistence` service registry providing
 *   tenant-scoped repository implementations (requests, timeline, audit,
 *   etc.).
 * @returns A {@link RuntimeRepos} object exposing the persistence
 *   repositories through the backend's runtime interface.
 */
export const runtimeReposFromPersistence = (
	persistence: PersistenceService
): RuntimeRepos => ({
	persistence,
});

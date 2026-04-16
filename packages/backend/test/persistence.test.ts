import type { PersistenceService } from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";

import { runtimeReposFromPersistence } from "../src";

describe(runtimeReposFromPersistence, () => {
	it("adapts persistence service into runtime repos", () => {
		const persistence = {} as PersistenceService;
		const repos = runtimeReposFromPersistence(persistence);
		expect(repos.persistence).toBe(persistence);
	});
});

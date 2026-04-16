import { describe, expect, it } from "@effect/vitest";

import { allCommands } from "#src/commands/registry";
import { routeParityMap } from "#src/parity/route-map";

describe("cLI e2e parity guard", () => {
	it("covers every registry command id in e2e matrix", () => {
		const allIds = new Set(allCommands.map((command) => command.id));
		const matrixIds = new Set(routeParityMap.map((route) => route.id));
		for (const id of allIds) {
			expect(matrixIds.has(id)).toBeTruthy();
		}
		expect(matrixIds.size).toBe(allIds.size);
	});
});

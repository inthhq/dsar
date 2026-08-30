/* oxlint-disable jest/no-conditional-in-test -- guard test branches on allowlisted command ids. */
import { describe, expect, it } from "@effect/vitest";

import { allCommands } from "#src/commands/registry";
import { routeParityMap } from "#src/parity/route-map";

const NON_ROUTE_COMMAND_IDS = new Set(["audit_tail", "doctor_runtime"]);

describe("cLI e2e parity guard", () => {
	it("covers every registry command id in e2e matrix", () => {
		const allIds = new Set(allCommands.map((command) => command.id));
		const matrixIds = new Set(routeParityMap.map((route) => route.id));
		for (const id of allIds) {
			if (NON_ROUTE_COMMAND_IDS.has(id)) {
				continue;
			}
			expect(matrixIds.has(id)).toBeTruthy();
		}
		expect(matrixIds.size).toBe(allIds.size - NON_ROUTE_COMMAND_IDS.size);
	});
});

import { createOpenApiSpec } from "@dsar/backend";
import { describe, expect, it } from "@effect/vitest";

import { allCommands } from "#src/commands/registry";
import { deferredCapabilities, routeParityMap } from "#src/parity/route-map";

const supportedMethods = ["get", "post", "put"] as const;

const buildOpenApiRouteSet = () => {
	const spec = createOpenApiSpec("/");
	const routeSet = new Set<string>();
	for (const [path, item] of Object.entries(spec.paths ?? {})) {
		for (const method of supportedMethods) {
			if (item?.[method]) {
				routeSet.add(`${method.toUpperCase()} ${path}`);
			}
		}
	}
	return routeSet;
};

describe("cLI parity", () => {
	it("maps every backend OpenAPI route to at least one CLI command", () => {
		const openApiRoutes = buildOpenApiRouteSet();
		const mapped = new Set(
			routeParityMap.map((route) => `${route.method} ${route.path}`)
		);
		for (const route of openApiRoutes) {
			expect(mapped.has(route)).toBeTruthy();
		}
	});

	it("tracks deferred ticket capability exceptions explicitly", () => {
		expect(deferredCapabilities).toHaveLength(0);
	});

	it("exposes every parity-mapped route id as a callable CLI command", () => {
		const mappedRouteIds = new Set(routeParityMap.map((route) => route.id));
		const callableRouteIds = new Set(
			allCommands
				.map((command) => command.routeId)
				.filter((routeId): routeId is string => typeof routeId === "string")
		);
		for (const routeId of mappedRouteIds) {
			expect(callableRouteIds.has(routeId)).toBeTruthy();
		}
	});
});

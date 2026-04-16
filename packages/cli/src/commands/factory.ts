import { requestFromRoute } from "../commands/helpers";
import { routeParityMap } from "../parity/route-map";
import type { CommandDefinition } from "../types";

const mapById = new Map(routeParityMap.map((route) => [route.id, route]));

/**
 * Creates a {@link CommandDefinition} from a route-parity identifier, wiring
 * the route's description, usage pattern, and an executor that delegates to
 * {@link requestFromRoute} and the API client.
 *
 * @param routeId - Identifier matching a `routeParityMap` entry (e.g.
 *   `"requests_create"`).
 * @returns A fully-assembled {@link CommandDefinition} ready for CLI dispatch.
 * @throws `Error` When `routeId` does not match any entry in the route-parity
 *   map.
 */
export const makeRouteCommand = (routeId: string): CommandDefinition => {
	const route = mapById.get(routeId);
	if (!route) {
		throw new Error(`Unknown route parity id '${routeId}'.`);
	}
	return {
		description: route.description,
		execute: async (ctx) => {
			const request = await requestFromRoute(route, ctx.input, ctx.params);
			return await ctx.api.invoke(request);
		},
		id: route.id,
		routeId: route.id,
		usage: route.command,
	};
};

/**
 * Batch variant of {@link makeRouteCommand} — maps an array of route-parity
 * identifiers into an array of {@link CommandDefinition} entries.
 *
 * @param routeIds - Route-parity identifiers to resolve.
 * @returns An ordered array of command definitions, one per `routeId`.
 * @throws `Error` When any `routeId` is not found in the route-parity map.
 */
export const makeRouteCommands = (
	routeIds: readonly string[]
): readonly CommandDefinition[] => routeIds.map(makeRouteCommand);

import * as Effect from "effect/Effect";

import { ok } from "./helpers";
import type { RouteDefinition } from "./types";

/**
 * Health-check route definitions exposing `GET /status` for runtime liveness.
 */
export const statusRoutes: readonly RouteDefinition[] = [
	{
		handler: () =>
			Effect.succeed(
				ok({
					service: "@dsar/backend",
					status: "ok",
				})
			),
		method: "GET",
		path: "/status",
		protected: false,
		summary: "Runtime health status",
	},
];

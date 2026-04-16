import * as Effect from "effect/Effect";

import { ok } from "./helpers";
import type { RouteDefinition } from "./types";

/**
 * Route definitions for initializing the DSAR runtime context.
 */
export const initRoutes: readonly RouteDefinition[] = [
	{
		handler: () =>
			Effect.succeed(
				ok({
					initialized: true,
				})
			),
		method: "POST",
		path: "/init",
		protected: false,
		summary: "Initialize DSAR runtime context",
	},
];

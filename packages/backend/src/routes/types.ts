import type { Effect } from "effect";

import type { BackendRuntimeError } from "../types/errors";
import type { RuntimeServicesTag } from "../types/runtime";

/**
 * Dynamic path parameter values extracted during route matching.
 */
export interface RouteMatchResult {
	/** URL path params keyed by route token name. */
	readonly params: Readonly<Record<string, string>>;
}

/**
 * Route registration contract consumed by the `dsarInstance` router.
 */
export interface RouteDefinition {
	/** HTTP method used for route matching. */
	readonly method: string;
	/** Route path pattern, supporting `:param` segments. */
	readonly path: string;
	/** Whether actor context is required before handler execution. */
	readonly protected: boolean;
	/** Whether this route receives public DSAR intake and should be rate limited. */
	readonly publicIntake?: boolean;
	/** Human-readable route description for docs/debugging. */
	readonly summary: string;
	/**
	 * Handler effect evaluated at the runtime boundary with shared services.
	 */
	readonly handler: (input: {
		readonly request: Request;
		readonly params: Readonly<Record<string, string>>;
	}) => Effect.Effect<Response, BackendRuntimeError, RuntimeServicesTag>;
}

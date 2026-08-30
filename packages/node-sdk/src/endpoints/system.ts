import type { DsarResult, RequestOptions } from "../types";
import type {
	EndpointContext,
	InitResponse,
	StatusDiagnosticsResponse,
	StatusResponse,
} from "./types";

/**
 * SDK surface for system-level operations: runtime initialisation
 * and health-check status.
 */
export interface SystemApi {
	/** Returns operator-scoped persistence and adapter diagnostics. */
	readonly diagnostics: (
		options?: RequestOptions
	) => Promise<DsarResult<StatusDiagnosticsResponse>>;
	/** Initialises the backend runtime context. */
	readonly init: (
		options?: RequestOptions
	) => Promise<DsarResult<InitResponse>>;
	/** Returns current runtime health and readiness status. */
	readonly status: (
		options?: RequestOptions
	) => Promise<DsarResult<StatusResponse>>;
}

/**
 * Creates the {@link SystemApi} surface bound to the given endpoint context.
 *
 * @param ctx - Shared endpoint context providing the authenticated HTTP caller.
 * @returns Wired system API namespace.
 */
export const makeSystemApi = (ctx: EndpointContext): SystemApi => ({
	diagnostics: (options) =>
		ctx.call({
			method: "GET",
			options,
			path: "/status/diagnostics",
		}),
	init: (options) =>
		ctx.call({
			method: "POST",
			options,
			path: "/init",
		}),
	status: (options) =>
		ctx.call({
			method: "GET",
			options,
			path: "/status",
		}),
});

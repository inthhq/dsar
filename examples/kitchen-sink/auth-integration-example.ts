/**
 * Auth integration reference showing how to wire a real auth provider into
 * the DSAR runtime using `resolveTrustedRequestIdentity`.
 *
 * This module is NOT imported by the default kitchen-sink server. It
 * demonstrates the pattern for host applications that authenticate users
 * themselves and project that identity into DSAR.
 *
 * Replace the `verifySession` function with your actual auth provider
 * (e.g. Better Auth, Clerk, Auth.js, Lucia, or a custom JWT).
 */

import type {
	AuthenticatedRequestIdentity,
	RuntimeAuthConfig,
} from "dsar/backend";

// -------------------------------------------------------------------
// 1. Your auth provider session verifier
// -------------------------------------------------------------------

interface SessionPayload {
	email: string;
	role: "admin" | "user";
	tenantId: string;
	userId: string;
}

/**
 * Replace this with your real session verification logic.
 * For example, with Better Auth:
 *   const session = await auth.api.getSession({ headers: request.headers });
 *
 * Or with a signed cookie / JWT:
 *   const token = request.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
 *   const payload = await verifyJwt(token);
 */
const verifySession = (request: Request): SessionPayload | null => {
	const cookie = request.headers.get("cookie");
	if (!cookie) {
		return null;
	}

	const _sessionToken = cookie.match(/session=([^;]+)/)?.[1];
	if (!_sessionToken) {
		return null;
	}

	// In production, decode and verify a JWT or look up the session in your
	// database/cache. This is a stub for illustration.
	return null;
};

// -------------------------------------------------------------------
// 2. The DSAR identity resolver
// -------------------------------------------------------------------

/**
 * Maps a verified session from the host application into a DSAR
 * `AuthenticatedRequestIdentity`. This is the glue between your auth
 * system and the DSAR runtime.
 *
 * When this resolver returns a value, DSAR trusts it and skips bearer
 * token checks. When it returns `null`, DSAR falls back to bearer auth
 * (static tokens or `resolveBearerToken`).
 */
const resolveTrustedRequestIdentity = async ({
	request,
}: {
	readonly request: Request;
}): Promise<AuthenticatedRequestIdentity | null> => {
	const session = await verifySession(request);
	if (!session) {
		return null;
	}

	return {
		actorId: session.userId,
		email: session.email,
		principalKind: session.role === "admin" ? "operator" : "subject",
		role: session.role,
		tenantId: session.tenantId,
	};
};

// -------------------------------------------------------------------
// 3. Wire it into the DSAR runtime auth config
// -------------------------------------------------------------------

/**
 * Example auth config that combines trusted host identity with a static
 * fallback token for machine-to-machine (CLI, SDK, CI) access.
 *
 * Usage in your `runtime.config.ts`:
 *
 * ```ts
 * import { authConfig } from "./auth-integration-example";
 *
 * export const runtimeConfig: DsarConfigOptions = {
 *   config: {
 *     auth: authConfig,
 *     // ...
 *   },
 *   // ...
 * };
 * ```
 */
export const authConfig: RuntimeAuthConfig = {
	resolveTrustedRequestIdentity,

	// Keep static tokens for machine access (CLI, SDK, CI pipelines).
	// The trusted resolver takes priority for browser requests; these
	// tokens are only checked when the resolver returns null.
	staticBearerTokens: process.env.DSAR_API_TOKEN
		? {
				[process.env.DSAR_API_TOKEN]: {
					actorId: "machine-admin",
					principalKind: "service",
					role: "admin",
					tenantId: process.env.DSAR_TENANT_ID ?? "tenant-default",
				},
			}
		: {},
};

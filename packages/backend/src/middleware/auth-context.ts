import { UnauthorizedRequestError } from "../types/errors";
import type {
	AuthenticatedRequestIdentity,
	RuntimeAuthConfig,
	RuntimeRequestContext,
} from "../types/runtime";

const extractBearerToken = (request: Request): string | undefined => {
	const authorization = request.headers.get("authorization") ?? "";
	if (!authorization.startsWith("Bearer ")) {
		return undefined;
	}
	const token = authorization.slice("Bearer ".length).trim();
	if (token.length === 0) {
		throw new UnauthorizedRequestError({
			message: "Bearer token is present but empty.",
		});
	}
	return token;
};

const resolveBearerIdentity = async (
	request: Request,
	auth: RuntimeAuthConfig | undefined
): Promise<AuthenticatedRequestIdentity | undefined> => {
	const token = extractBearerToken(request);
	if (!token) {
		return undefined;
	}
	const staticIdentity = auth?.staticBearerTokens?.[token];
	if (staticIdentity) {
		return staticIdentity;
	}
	if (auth?.resolveBearerToken) {
		const resolved = await auth.resolveBearerToken({ request, token });
		if (resolved) {
			return resolved;
		}
	}
	throw new UnauthorizedRequestError({
		message: "Bearer token is invalid or not configured for DSAR access.",
	});
};

const resolveTrustedIdentity = async (
	request: Request,
	auth: RuntimeAuthConfig | undefined
): Promise<AuthenticatedRequestIdentity | undefined> => {
	if (!auth?.resolveTrustedRequestIdentity) {
		return undefined;
	}
	const resolved = await auth.resolveTrustedRequestIdentity({ request });
	return resolved ?? undefined;
};

const toPrincipalKind = (
	identity: AuthenticatedRequestIdentity
): NonNullable<RuntimeRequestContext["actor"]>["principalKind"] =>
	identity.principalKind ??
	(identity.role === "subject" ? "subject" : "operator");

/**
 * Resolves the authenticated request context for protected DSAR routes.
 *
 * Protected routes accept either verified bearer-backed identities or a trusted
 * host identity projected by the embedding application.
 *
 * @param request - Incoming HTTP request whose `Authorization` header is
 *   inspected for DSAR bearer credentials.
 * @param auth - Optional runtime authentication configuration used to resolve
 *   static or dynamic bearer token identities.
 * @returns A promise resolving to the authenticated actor plus tenant/workspace
 *   scoping fields for the request context.
 */
export const resolveRequestContext = async (
	request: Request,
	auth: RuntimeAuthConfig | undefined
): Promise<
	Pick<RuntimeRequestContext, "actor" | "tenantId" | "workspaceId">
> => {
	const identity =
		(await resolveBearerIdentity(request, auth)) ??
		(await resolveTrustedIdentity(request, auth));
	if (!identity) {
		throw new UnauthorizedRequestError({
			message: "Missing DSAR credentials or trusted caller context.",
		});
	}
	if (!identity.tenantId) {
		throw new UnauthorizedRequestError({
			message:
				"Authenticated bearer identity is missing tenantId. Ensure the configured identity includes tenantId before accessing protected routes.",
		});
	}
	return {
		actor: {
			email: identity.email,
			id: identity.actorId,
			principalKind: toPrincipalKind(identity),
			role: identity.role ?? "member",
		},
		tenantId: identity.tenantId,
		workspaceId: identity.workspaceId ?? undefined,
	};
};

/**
 * Generates a unique request identifier, using `crypto.randomUUID()` when
 * available or a cryptographic-RNG fallback otherwise.
 *
 * @returns A UUID string (e.g. `"a1b2c3d4-..."`) or a `req_` prefixed
 *   hex identifier built from `crypto.getRandomValues` (e.g.
 *   `"req_4f3a...b7c1"`).
 */
export const makeRequestId = (): string => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.getRandomValues === "function"
	) {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		let hex = "";
		for (const b of bytes) {
			hex += b.toString(16).padStart(2, "0");
		}
		return `req_${hex}`;
	}
	throw new Error(
		"No cryptographic RNG available (neither crypto.randomUUID nor crypto.getRandomValues). Cannot generate secure request IDs."
	);
};

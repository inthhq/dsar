import type { AuthenticatedRequestIdentity } from "dsar/backend";

const DEFAULT_TENANT_ID =
	process.env.DSAR_TENANT_ID ??
	process.env.DSAR_TEST_TENANT ??
	"tenant-default";

/** Subject portal Next app (`examples/subject-portal`). */
export const SUBJECT_PORTAL_ORIGINS = [
	"http://localhost:1356",
	"http://127.0.0.1:1356",
] as const;

/** Operator dashboard Next app (`examples/dashboard`). */
export const DASHBOARD_ORIGINS = [
	"http://localhost:1357",
	"http://127.0.0.1:1357",
] as const;

export const LOCAL_UI_ORIGINS = [
	...SUBJECT_PORTAL_ORIGINS,
	...DASHBOARD_ORIGINS,
] as const;

const extraOrigins = (process.env.DSAR_CORS_ORIGINS ?? "")
	.split(",")
	.map((value) => value.trim())
	.filter((value) => value.length > 0);

export const corsAllowlist = (): ReadonlySet<string> =>
	new Set<string>([...LOCAL_UI_ORIGINS, ...extraOrigins]);

export const corsOrigin = (
	requestOrigin: string | undefined,
	allowlist: ReadonlySet<string>
): string | undefined => {
	if (requestOrigin && allowlist.has(requestOrigin)) {
		return requestOrigin;
	}
	return undefined;
};

export const localUiIdentityFromOrigin = (
	origin: string | undefined
): AuthenticatedRequestIdentity | undefined => {
	if (origin === undefined) {
		return undefined;
	}
	if ((SUBJECT_PORTAL_ORIGINS as readonly string[]).includes(origin)) {
		return {
			actorId: "subject-portal-user",
			email: "subject@example.com",
			principalKind: "subject",
			role: "subject",
			tenantId: DEFAULT_TENANT_ID,
		};
	}
	if ((DASHBOARD_ORIGINS as readonly string[]).includes(origin)) {
		return {
			actorId: "dashboard-admin",
			principalKind: "operator",
			role: "admin",
			tenantId: DEFAULT_TENANT_ID,
		};
	}
	return undefined;
};

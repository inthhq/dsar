import type { CommandDefinition, CommandExecutionContext } from "../types";

type DoctorCheckStatus = "fail" | "pass" | "skip" | "warn";

interface DoctorCheck {
	readonly details?: unknown;
	readonly message: string;
	readonly name: string;
	readonly status: DoctorCheckStatus;
}

interface DoctorSummary {
	readonly failed: number;
	readonly passed: number;
	readonly skipped: number;
	readonly warnings: number;
}

interface DoctorReport {
	readonly checks: readonly DoctorCheck[];
	readonly ok: boolean;
	readonly summary: DoctorSummary;
}

interface MutableDoctorSummary {
	failed: number;
	passed: number;
	skipped: number;
	warnings: number;
}

const CHECK_CONFIG = "config.apiUrl";
const CHECK_STATUS = "runtime.status";
const CHECK_AUTH = "auth.protectedRequest";
const CHECK_MIGRATIONS = "persistence.migrations";
const CHECK_ADAPTERS = "adapters.health";

const messageFromError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const statusLabel = (status: DoctorCheckStatus): string => `[${status}]`;

const incrementSummary = (
	summary: MutableDoctorSummary,
	status: DoctorCheckStatus
): void => {
	if (status === "fail") {
		summary.failed += 1;
		return;
	}
	if (status === "pass") {
		summary.passed += 1;
		return;
	}
	if (status === "skip") {
		summary.skipped += 1;
		return;
	}
	summary.warnings += 1;
};

const summarize = (checks: readonly DoctorCheck[]): DoctorSummary => {
	const summary: MutableDoctorSummary = {
		failed: 0,
		passed: 0,
		skipped: 0,
		warnings: 0,
	};
	for (const check of checks) {
		incrementSummary(summary, check.status);
	}
	return summary;
};

const checkApiUrl = (ctx: CommandExecutionContext): DoctorCheck => {
	const { apiUrl } = ctx.input.global;
	if (apiUrl.length === 0) {
		return {
			message:
				"Missing DSAR API URL. Set --api-url or DSAR_API_URL before running remote checks.",
			name: CHECK_CONFIG,
			status: "fail",
		};
	}
	try {
		const parsedUrl = new URL(apiUrl);
		return {
			details: { apiUrl: parsedUrl.toString() },
			message: "DSAR API URL is configured.",
			name: CHECK_CONFIG,
			status: "pass",
		};
	} catch (error) {
		return {
			details: { apiUrl },
			message: `Invalid DSAR API URL: ${messageFromError(error)}`,
			name: CHECK_CONFIG,
			status: "fail",
		};
	}
};

const checkRuntimeStatus = async (
	ctx: CommandExecutionContext,
	configCheck: DoctorCheck
): Promise<DoctorCheck> => {
	if (configCheck.status !== "pass") {
		return {
			message: "Skipped because DSAR API URL is not usable.",
			name: CHECK_STATUS,
			status: "skip",
		};
	}
	try {
		const result = await ctx.api.invoke({
			method: "GET",
			path: "/status",
		});
		return {
			details: result,
			message: "Runtime status endpoint responded successfully.",
			name: CHECK_STATUS,
			status: "pass",
		};
	} catch (error) {
		return {
			message: `Runtime status check failed: ${messageFromError(error)}`,
			name: CHECK_STATUS,
			status: "fail",
		};
	}
};

const checkProtectedRead = async (
	ctx: CommandExecutionContext,
	statusCheck: DoctorCheck
): Promise<DoctorCheck> => {
	if (statusCheck.status !== "pass") {
		return {
			message: "Skipped because runtime status did not pass.",
			name: CHECK_AUTH,
			status: "skip",
		};
	}
	if (!ctx.input.global.token) {
		return {
			message:
				"No DSAR API token provided. Set --token or DSAR_API_TOKEN to validate authenticated requests.",
			name: CHECK_AUTH,
			status: "warn",
		};
	}
	try {
		await ctx.api.invoke({
			method: "GET",
			path: "/requests",
			query: { limit: "1" },
		});
		return {
			details: {
				probe: "GET /requests?limit=1",
			},
			message:
				"Authenticated request list probe succeeded; auth and persistence read path are reachable.",
			name: CHECK_AUTH,
			status: "pass",
		};
	} catch (error) {
		return {
			message: `Authenticated request probe failed: ${messageFromError(error)}`,
			name: CHECK_AUTH,
			status: "fail",
		};
	}
};

const checkMigrations = (authCheck: DoctorCheck): DoctorCheck => {
	if (authCheck.status !== "pass") {
		return {
			message:
				"Skipped because the authenticated persistence-backed probe did not pass.",
			name: CHECK_MIGRATIONS,
			status: "skip",
		};
	}
	return {
		message:
			"No dedicated migration diagnostic endpoint is exposed. The authenticated persistence read probe passed, but migration freshness cannot be proven from the CLI alone.",
		name: CHECK_MIGRATIONS,
		status: "warn",
	};
};

const checkAdapters = (): DoctorCheck => ({
	message:
		"No public adapter health endpoint is exposed. Add backend diagnostics to validate storage, inbound, and outbound adapter initialization from the CLI.",
	name: CHECK_ADAPTERS,
	status: "skip",
});

const runDoctor = async (
	ctx: CommandExecutionContext
): Promise<DoctorReport> => {
	const configCheck = checkApiUrl(ctx);
	const statusCheck = await checkRuntimeStatus(ctx, configCheck);
	const authCheck = await checkProtectedRead(ctx, statusCheck);
	const checks = [
		configCheck,
		statusCheck,
		authCheck,
		checkMigrations(authCheck),
		checkAdapters(),
	] as const;
	const summary = summarize(checks);
	return {
		checks,
		ok: summary.failed === 0,
		summary,
	};
};

const isDoctorReport = (result: unknown): result is DoctorReport =>
	typeof result === "object" &&
	result !== null &&
	"ok" in result &&
	typeof (result as { readonly ok?: unknown }).ok === "boolean";

const formatDoctorReport = (result: unknown): string => {
	if (!isDoctorReport(result)) {
		return JSON.stringify(result, null, 2);
	}
	const lines = [
		`DSAR doctor ${result.ok ? "passed" : "failed"}`,
		`Summary: ${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.skipped} skipped, ${result.summary.failed} failed`,
		"",
	];
	for (const check of result.checks) {
		lines.push(`${statusLabel(check.status)} ${check.name} - ${check.message}`);
	}
	return lines.join("\n");
};

/**
 * Diagnostic command that validates CLI config, runtime reachability,
 * authenticated request access, and the currently exposed backend health
 * surfaces.
 */
export const doctorCommand: CommandDefinition = {
	allowMissingApiUrl: true,
	description:
		"Run DSAR CLI diagnostics for config, runtime reachability, auth, persistence, and exposed health checks.",
	execute: runDoctor,
	formatTextResult: formatDoctorReport,
	id: "doctor_runtime",
	isSuccessfulResult: (result) => isDoctorReport(result) && result.ok,
	usage: ["doctor"],
};

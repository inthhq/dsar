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

interface DiagnosticsMigration {
	readonly id: number;
	readonly name: string;
}

interface DiagnosticsAdapter {
	readonly capability: string;
	readonly key: string;
	readonly status: string;
}

interface AdapterStatusSummary {
	readonly capability: string;
	readonly key: string;
	readonly status: string;
}

interface DiagnosticsData {
	readonly adapters: readonly DiagnosticsAdapter[];
	readonly migrations: {
		readonly applied: readonly DiagnosticsMigration[];
		readonly current: boolean;
		readonly expected: readonly DiagnosticsMigration[];
	};
	readonly persistence: { readonly reachable: true };
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

const LEGACY_MIGRATION_MESSAGE =
	"No dedicated migration diagnostic endpoint is exposed. The authenticated persistence read probe passed, but migration freshness cannot be proven from the CLI alone.";

const LEGACY_ADAPTER_MESSAGE =
	"No public adapter health endpoint is exposed. Add backend diagnostics to validate storage, inbound, and outbound adapter initialization from the CLI.";

const messageFromError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === "object" && value !== null;

const isMigration = (value: unknown): value is DiagnosticsMigration =>
	isRecord(value) &&
	typeof value.id === "number" &&
	typeof value.name === "string";

const isAdapter = (value: unknown): value is DiagnosticsAdapter =>
	isRecord(value) &&
	typeof value.capability === "string" &&
	typeof value.key === "string" &&
	typeof value.status === "string";

const isDiagnosticsData = (value: unknown): value is DiagnosticsData => {
	if (!isRecord(value)) {
		return false;
	}
	const { adapters, migrations, persistence } = value;
	return (
		Array.isArray(adapters) &&
		adapters.every(isAdapter) &&
		isRecord(migrations) &&
		Array.isArray(migrations.applied) &&
		migrations.applied.every(isMigration) &&
		typeof migrations.current === "boolean" &&
		Array.isArray(migrations.expected) &&
		migrations.expected.every(isMigration) &&
		isRecord(persistence) &&
		persistence.reachable === true
	);
};

const unwrapDiagnostics = (value: unknown): DiagnosticsData | undefined => {
	if (isDiagnosticsData(value)) {
		return value;
	}
	if (isRecord(value) && isDiagnosticsData(value.data)) {
		return value.data;
	}
	return undefined;
};

const isUnavailableDiagnosticsError = (error: unknown): boolean =>
	error instanceof Error && /\(404\)/.test(error.message);

const isForbiddenDiagnosticsError = (error: unknown): boolean =>
	error instanceof Error && /\((?:401|403)\)/.test(error.message);

const FORBIDDEN_MIGRATION_MESSAGE =
	"The configured token is not an operator or service principal, so migration freshness could not be verified. Rerun doctor with an operator or service token for full diagnostics.";

const FORBIDDEN_ADAPTER_MESSAGE =
	"The configured token is not an operator or service principal, so adapter health could not be verified. Rerun doctor with an operator or service token for full diagnostics.";

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

const unavailableMigrationCheck = (diagnosticsError: unknown): DoctorCheck => {
	if (isForbiddenDiagnosticsError(diagnosticsError)) {
		return {
			message: FORBIDDEN_MIGRATION_MESSAGE,
			name: CHECK_MIGRATIONS,
			status: "warn",
		};
	}
	if (diagnosticsError && !isUnavailableDiagnosticsError(diagnosticsError)) {
		return {
			message: `Migration diagnostics failed: ${messageFromError(diagnosticsError)}`,
			name: CHECK_MIGRATIONS,
			status: "fail",
		};
	}
	return {
		message: LEGACY_MIGRATION_MESSAGE,
		name: CHECK_MIGRATIONS,
		status: "warn",
	};
};

const missingMigrations = (
	migrations: DiagnosticsData["migrations"]
): readonly DiagnosticsMigration[] => {
	const appliedKeys = new Set(
		migrations.applied.map((migration) => `${migration.id}:${migration.name}`)
	);
	return migrations.expected.filter(
		(migration) => !appliedKeys.has(`${migration.id}:${migration.name}`)
	);
};

const checkMigrations = (
	authCheck: DoctorCheck,
	diagnostics: DiagnosticsData | undefined,
	diagnosticsError: unknown
): DoctorCheck => {
	if (authCheck.status !== "pass") {
		return {
			message:
				"Skipped because the authenticated persistence-backed probe did not pass.",
			name: CHECK_MIGRATIONS,
			status: "skip",
		};
	}
	if (!diagnostics) {
		return unavailableMigrationCheck(diagnosticsError);
	}
	if (diagnostics.migrations.current) {
		return {
			details: {
				applied: diagnostics.migrations.applied.length,
				expected: diagnostics.migrations.expected.length,
			},
			message: "Persistence is reachable and schema migrations are current.",
			name: CHECK_MIGRATIONS,
			status: "pass",
		};
	}
	const missing = missingMigrations(diagnostics.migrations);
	return {
		details: { missing },
		message:
			missing.length > 0
				? `Schema migrations are not current. Missing migrations: ${missing.map((migration) => `${migration.id} ${migration.name}`).join(", ")}.`
				: "Schema migration metadata does not match the expected registry.",
		name: CHECK_MIGRATIONS,
		status: "fail",
	};
};

const unavailableAdapterCheck = (diagnosticsError: unknown): DoctorCheck => {
	if (isForbiddenDiagnosticsError(diagnosticsError)) {
		return {
			message: FORBIDDEN_ADAPTER_MESSAGE,
			name: CHECK_ADAPTERS,
			status: "warn",
		};
	}
	if (diagnosticsError && !isUnavailableDiagnosticsError(diagnosticsError)) {
		return {
			message: `Adapter diagnostics failed: ${messageFromError(diagnosticsError)}`,
			name: CHECK_ADAPTERS,
			status: "fail",
		};
	}
	return {
		message: LEGACY_ADAPTER_MESSAGE,
		name: CHECK_ADAPTERS,
		status: "skip",
	};
};

const adapterNames = (adapters: readonly AdapterStatusSummary[]): string =>
	adapters.map((adapter) => `${adapter.capability}:${adapter.key}`).join(", ");

const checkRegisteredAdapters = (
	adapterStatuses: readonly AdapterStatusSummary[]
): DoctorCheck => {
	const down = adapterStatuses.filter((adapter) => adapter.status === "down");
	if (down.length > 0) {
		return {
			details: { adapters: adapterStatuses },
			message: `One or more adapters are down: ${adapterNames(down)}.`,
			name: CHECK_ADAPTERS,
			status: "fail",
		};
	}
	const degraded = adapterStatuses.filter(
		(adapter) => adapter.status !== "healthy"
	);
	if (degraded.length > 0) {
		return {
			details: { adapters: adapterStatuses },
			message: `One or more adapters are degraded: ${adapterNames(degraded)}.`,
			name: CHECK_ADAPTERS,
			status: "warn",
		};
	}
	return {
		details: { adapters: adapterStatuses },
		message: "All registered adapters reported healthy status.",
		name: CHECK_ADAPTERS,
		status: "pass",
	};
};

const checkAdapters = (
	authCheck: DoctorCheck,
	diagnostics: DiagnosticsData | undefined,
	diagnosticsError: unknown
): DoctorCheck => {
	if (authCheck.status !== "pass") {
		return {
			message: "Skipped because authenticated diagnostics did not pass.",
			name: CHECK_ADAPTERS,
			status: "skip",
		};
	}
	if (!diagnostics) {
		return unavailableAdapterCheck(diagnosticsError);
	}
	if (diagnostics.adapters.length === 0) {
		return {
			message:
				"No adapters are registered with the runtime; storage, inbound, and notification adapter health checks were skipped.",
			name: CHECK_ADAPTERS,
			status: "skip",
		};
	}
	const adapterStatuses = diagnostics.adapters.map((adapter) => ({
		capability: adapter.capability,
		key: adapter.key,
		status: adapter.status,
	}));
	return checkRegisteredAdapters(adapterStatuses);
};

const fetchDiagnostics = async (
	ctx: CommandExecutionContext,
	authCheck: DoctorCheck
): Promise<{
	readonly data: DiagnosticsData | undefined;
	readonly error: unknown;
}> => {
	if (authCheck.status !== "pass") {
		return { data: undefined, error: undefined };
	}
	try {
		const result = await ctx.api.invoke({
			method: "GET",
			path: "/status/diagnostics",
		});
		const data = unwrapDiagnostics(result);
		if (!data) {
			return {
				data: undefined,
				error: new Error("Diagnostics response did not match expected shape."),
			};
		}
		return { data, error: undefined };
	} catch (error) {
		return { data: undefined, error };
	}
};

const runDoctor = async (
	ctx: CommandExecutionContext
): Promise<DoctorReport> => {
	const configCheck = checkApiUrl(ctx);
	const statusCheck = await checkRuntimeStatus(ctx, configCheck);
	const authCheck = await checkProtectedRead(ctx, statusCheck);
	const diagnostics = await fetchDiagnostics(ctx, authCheck);
	const checks = [
		configCheck,
		statusCheck,
		authCheck,
		checkMigrations(authCheck, diagnostics.data, diagnostics.error),
		checkAdapters(authCheck, diagnostics.data, diagnostics.error),
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

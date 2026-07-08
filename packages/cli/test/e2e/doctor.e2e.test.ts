import { describe, expect, it } from "@effect/vitest";

import { runCli } from "#src/runtime";

import { E2E_API_TOKEN, E2E_API_URL, makeRuntimeFetch } from "./harness";

interface DoctorEnvelope {
	readonly data: {
		readonly checks: readonly {
			readonly details?: unknown;
			readonly message: string;
			readonly name: string;
			readonly status: string;
		}[];
		readonly ok: boolean;
	};
	readonly ok: boolean;
}

const asJsonText = (value: unknown): string => JSON.stringify(value);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
	typeof value === "object" && value !== null;

const isDoctorCheck = (
	value: unknown
): value is DoctorEnvelope["data"]["checks"][number] => {
	if (!isRecord(value)) {
		return false;
	}
	return (
		typeof value.message === "string" &&
		typeof value.name === "string" &&
		typeof value.status === "string"
	);
};

const isDoctorEnvelope = (value: unknown): value is DoctorEnvelope => {
	if (!isRecord(value) || typeof value.ok !== "boolean") {
		return false;
	}
	const { data } = value;
	return (
		isRecord(data) &&
		typeof data.ok === "boolean" &&
		Array.isArray(data.checks) &&
		data.checks.every(isDoctorCheck)
	);
};

const parseDoctorEnvelope = (stdout: readonly string[]): DoctorEnvelope => {
	const output = stdout.join("\n");
	if (!output) {
		throw new Error("Missing CLI output.");
	}
	const parsed: unknown = JSON.parse(output);
	if (!isDoctorEnvelope(parsed)) {
		throw new Error("Malformed doctor JSON envelope.");
	}
	return parsed;
};

const findCheck = (
	report: DoctorEnvelope,
	name: string
): DoctorEnvelope["data"]["checks"][number] => {
	const check = report.data.checks.find((entry) => entry.name === name);
	if (!check) {
		throw new Error(`Missing doctor check '${name}'.`);
	}
	return check;
};

const isDiagnosticsUrl = (input: string | URL | Request): boolean => {
	const url = input instanceof Request ? input.url : input.toString();
	return url.includes("/status/diagnostics");
};

const forbiddenDiagnosticsResponse = (): Response =>
	Response.json(
		{
			error: {
				code: "AUTH_REQUEST_ACCESS_FORBIDDEN",
				message:
					"Runtime diagnostics are reserved for operator or service principals.",
			},
			ok: false,
		},
		{ status: 403 }
	);

const runtimeFetchForForbiddenDiagnostics = makeRuntimeFetch();

const forbiddenDiagnosticsFetch = async (
	input: string | URL | Request,
	init?: RequestInit
): Promise<Response> =>
	isDiagnosticsUrl(input)
		? forbiddenDiagnosticsResponse()
		: await runtimeFetchForForbiddenDiagnostics(input, init);

const runDoctorJson = async (
	argv: readonly string[],
	fetchImpl: ReturnType<typeof makeRuntimeFetch> = makeRuntimeFetch()
): Promise<{
	readonly exitCode: number;
	readonly report: DoctorEnvelope;
}> => {
	const stdout: string[] = [];
	const exitCode = await runCli({
		argv: ["doctor", "--api-url", E2E_API_URL, "--output", "json", ...argv],
		fetch: fetchImpl,
		stdout: (line) => stdout.push(line),
	});
	return {
		exitCode,
		report: parseDoctorEnvelope(stdout),
	};
};

const expectSanitizedAuthProbe = (report: DoctorEnvelope): void => {
	const authCheck = findCheck(report, "auth.protectedRequest");
	expect(authCheck).toMatchObject({
		details: {
			probe: "GET /requests?limit=1",
		},
		status: "pass",
	});
	const authCheckText = asJsonText(authCheck);
	expect(authCheckText).not.toContain("items");
	expect(authCheckText).not.toContain("subject");
};

const makeStaleMigrationFetch = (): typeof fetch => {
	const runtimeFetch = makeRuntimeFetch();
	return async (input, init) => {
		const request =
			input instanceof Request
				? new Request(input, init)
				: new Request(input.toString(), init);
		const path = new URL(request.url).pathname;
		return path === "/status/diagnostics"
			? Response.json(
					{
						data: {
							adapters: [],
							migrations: {
								applied: [{ id: 1, name: "initial" }],
								current: false,
								expected: [
									{ id: 1, name: "initial" },
									{ id: 2, name: "webhook-endpoints" },
								],
							},
							persistence: { reachable: true },
						},
						ok: true,
					},
					{ status: 200 }
				)
			: await runtimeFetch(request);
	};
};

describe("doctor command", () => {
	it("reports missing API URL as a diagnostic result", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: ["doctor", "--output", "json"],
			env: {},
			stdout: (line) => stdout.push(line),
		});
		const report = parseDoctorEnvelope(stdout);
		expect(exitCode).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.data.ok).toBe(false);
		expect(findCheck(report, "config.apiUrl")).toMatchObject({
			status: "fail",
		});
	});

	it("passes when status and authenticated persistence probes succeed", async () => {
		const { exitCode, report } = await runDoctorJson([
			"--token",
			E2E_API_TOKEN,
		]);
		expect(exitCode).toBe(0);
		expect(report.ok).toBe(true);
		expect(report.data.ok).toBe(true);
		expect(findCheck(report, "runtime.status")).toMatchObject({
			status: "pass",
		});
		expectSanitizedAuthProbe(report);
		expect(findCheck(report, "persistence.migrations")).toMatchObject({
			status: "pass",
		});
		expect(findCheck(report, "adapters.health")).toMatchObject({
			status: "skip",
		});
	});

	it("fails when diagnostics report missing migrations", async () => {
		const { exitCode, report } = await runDoctorJson(
			["--token", E2E_API_TOKEN],
			makeStaleMigrationFetch()
		);
		expect(exitCode).toBe(1);
		expect(report.data.ok).toBe(false);
		expect(findCheck(report, "persistence.migrations")).toMatchObject({
			status: "fail",
		});
		expect(findCheck(report, "persistence.migrations").message).toContain(
			"2 webhook-endpoints"
		);
	});

	it("fails when authenticated probe rejects the configured token", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: [
				"doctor",
				"--api-url",
				E2E_API_URL,
				"--output",
				"json",
				"--token",
				"invalid-token",
			],
			fetch: makeRuntimeFetch(),
			stdout: (line) => stdout.push(line),
		});
		const report = parseDoctorEnvelope(stdout);
		expect(exitCode).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.data.ok).toBe(false);
		expect(findCheck(report, "auth.protectedRequest")).toMatchObject({
			status: "fail",
		});
	});

	it("warns instead of failing when diagnostics are forbidden for the token", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: [
				"doctor",
				"--api-url",
				E2E_API_URL,
				"--output",
				"json",
				"--token",
				E2E_API_TOKEN,
			],
			fetch: forbiddenDiagnosticsFetch,
			stdout: (line) => stdout.push(line),
		});
		const report = parseDoctorEnvelope(stdout);
		expect(exitCode).toBe(0);
		expect(report.ok).toBe(true);
		expect(findCheck(report, "persistence.migrations")).toMatchObject({
			status: "warn",
		});
		expect(findCheck(report, "adapters.health")).toMatchObject({
			status: "warn",
		});
		const output = stdout.join("\n");
		expect(output).toContain("operator or service");
	});

	it("renders readable text output by default", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: ["doctor", "--api-url", E2E_API_URL, "--token", E2E_API_TOKEN],
			fetch: makeRuntimeFetch(),
			stdout: (line) => stdout.push(line),
		});
		const output = stdout.join("\n");
		expect(exitCode).toBe(0);
		expect(() => JSON.parse(output)).toThrow();
		expect(output).not.toContain('"items"');
	});
});

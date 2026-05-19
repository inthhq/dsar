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

const runDoctorJson = async (
	argv: readonly string[]
): Promise<{
	readonly exitCode: number;
	readonly report: DoctorEnvelope;
}> => {
	const stdout: string[] = [];
	const exitCode = await runCli({
		argv: ["doctor", "--api-url", E2E_API_URL, "--output", "json", ...argv],
		fetch: makeRuntimeFetch(),
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
			status: "warn",
		});
		expect(findCheck(report, "adapters.health")).toMatchObject({
			status: "skip",
		});
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

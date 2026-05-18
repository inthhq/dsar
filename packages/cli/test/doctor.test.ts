import { describe, expect, it } from "@effect/vitest";

import { runCli } from "#src/runtime";

import { E2E_API_TOKEN, E2E_API_URL, makeRuntimeFetch } from "./e2e/harness";

interface DoctorEnvelope {
	readonly data: {
		readonly checks: readonly {
			readonly message: string;
			readonly name: string;
			readonly status: string;
		}[];
		readonly ok: boolean;
	};
	readonly ok: boolean;
}

const parseDoctorEnvelope = (line: string | undefined): DoctorEnvelope => {
	if (!line) {
		throw new Error("Missing CLI output.");
	}
	return JSON.parse(line) as DoctorEnvelope;
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

describe("doctor command", () => {
	it("reports missing API URL as a diagnostic result", async () => {
		const stdout: string[] = [];
		const exitCode = await runCli({
			argv: ["doctor", "--output", "json"],
			env: {},
			stdout: (line) => stdout.push(line),
		});
		const report = parseDoctorEnvelope(stdout[0]);
		expect(exitCode).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.data.ok).toBe(false);
		expect(findCheck(report, "config.apiUrl")).toMatchObject({
			status: "fail",
		});
	});

	it("passes when status and authenticated persistence probes succeed", async () => {
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
			fetch: makeRuntimeFetch(),
			stdout: (line) => stdout.push(line),
		});
		const report = parseDoctorEnvelope(stdout[0]);
		expect(exitCode).toBe(0);
		expect(report.ok).toBe(true);
		expect(report.data.ok).toBe(true);
		expect(findCheck(report, "runtime.status")).toMatchObject({
			status: "pass",
		});
		expect(findCheck(report, "auth.protectedRequest")).toMatchObject({
			status: "pass",
		});
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
		const report = parseDoctorEnvelope(stdout[0]);
		expect(exitCode).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.data.ok).toBe(false);
		expect(findCheck(report, "auth.protectedRequest")).toMatchObject({
			status: "fail",
		});
	});
});

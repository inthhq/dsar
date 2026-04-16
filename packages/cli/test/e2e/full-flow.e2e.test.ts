import { describe, expect, it } from "@effect/vitest";

import {
	BASE_JSON_BODY,
	DEFAULT_IDS,
	getRelevantOutput,
	makeRuntimeFetch,
	runE2eCli,
} from "./harness";

const asJson = (input: unknown): string => JSON.stringify(input);
const asRecord = (value: unknown): Record<string, unknown> | undefined => {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
};

const extractId = (obj: Record<string, unknown>): string | undefined => {
	const inner = asRecord(obj.data);
	const request = asRecord(inner?.data);
	if (typeof request?.id === "string") {
		return request.id;
	}
	if (typeof inner?.id === "string") {
		return inner.id;
	}
	if (typeof obj.id === "string") {
		return obj.id;
	}
	return undefined;
};

const getCreatedRequestId = (stdoutJson: unknown): string => {
	if (typeof stdoutJson !== "object" || stdoutJson === null) {
		return DEFAULT_IDS.id;
	}
	return extractId(stdoutJson as Record<string, unknown>) ?? DEFAULT_IDS.id;
};

describe("cLI e2e extra cross-endpoint flow", () => {
	it("runs a DSAR lifecycle chain through request, authority, verification, delivery, manifest, and audit surfaces", async () => {
		const fetch = makeRuntimeFetch();

		const create = await runE2eCli({
			argv: [
				"requests",
				"create",
				"--json",
				asJson({
					intakeSource: BASE_JSON_BODY.intakeSource,
					jurisdiction: "uk",
				}),
			],
			fetch,
		});
		expect(create.exitCode).toBe(0);
		const requestId = getCreatedRequestId(create.stdoutJson);

		const steps: readonly {
			readonly argv: readonly string[];
			readonly expectedExitCode: 0 | 1;
			readonly expectedText: string;
		}[] = [
			{
				argv: [
					"requests",
					"authority",
					"submit",
					requestId,
					"--json",
					asJson(BASE_JSON_BODY),
				],
				expectedExitCode: 0,
				expectedText: '"submittedAt"',
			},
			{
				argv: ["requests", "authority", "approve", requestId],
				expectedExitCode: 0,
				expectedText: '"verifiedAt"',
			},
			{
				argv: [
					"requests",
					"verification",
					"request",
					requestId,
					"--json",
					asJson(BASE_JSON_BODY),
				],
				expectedExitCode: 0,
				expectedText: '"status":"verification_pending"',
			},
			{
				argv: [
					"requests",
					"verification",
					"evidence",
					requestId,
					"--json",
					asJson({ ...BASE_JSON_BODY, level: "reasonable" }),
				],
				expectedExitCode: 0,
				expectedText: '"surface":"verification_evidence"',
			},
			{
				argv: ["requests", "verification", "approve", requestId],
				expectedExitCode: 0,
				expectedText: '"status":"in_progress"',
			},
			{
				argv: [
					"requests",
					"delivery",
					"prepare",
					requestId,
					"--json",
					asJson(BASE_JSON_BODY),
				],
				expectedExitCode: 1,
				expectedText: "No fulfillment artifact found",
			},
			{
				argv: [
					"requests",
					"manifest",
					"validate",
					requestId,
					"--json",
					asJson(BASE_JSON_BODY),
				],
				expectedExitCode: 1,
				expectedText: "action",
			},
			{
				argv: ["requests", "audit", "export", requestId, "--format", "jsonl"],
				expectedExitCode: 0,
				expectedText: '"events":',
			},
			{
				argv: [
					"requests",
					"audit",
					"verify",
					requestId,
					"--json",
					asJson(BASE_JSON_BODY),
				],
				expectedExitCode: 0,
				expectedText: '"verified":true',
			},
		];

		for (const step of steps) {
			const result = await runE2eCli({ argv: step.argv, fetch });
			expect(result.exitCode).toBe(step.expectedExitCode);
			const output = getRelevantOutput(result, step.expectedExitCode);
			expect(output).toContain(step.expectedText);
		}
	});
});

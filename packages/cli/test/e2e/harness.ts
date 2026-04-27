import { dsarInstance } from "@dsar/backend";
import { makeMinimalPersistenceSync } from "@dsar/backend/testing/minimal-persistence";

import { runCli } from "#src/runtime";

export const E2E_API_URL = "https://example.test";
export const E2E_API_TOKEN = "cli-e2e-token";
const E2E_RUNTIME_AUTH = {
	config: {
		auth: {
			staticBearerTokens: {
				[E2E_API_TOKEN]: {
					actorId: "cli-e2e",
					role: "admin",
					tenantId: "tenant-default",
				},
			},
		},
		notificationWebhook: {
			endpointId: "default",
			retryDelayMs: 1,
			retryMaxAttempts: 1,
			signingSecret: "cli-e2e-secret",
			timeoutMs: 1000,
			url: "https://tenant.example/webhook",
		},
	},
} as const;

export interface E2eRunResult {
	readonly exitCode: number;
	readonly stderr: readonly string[];
	readonly stderrJson: unknown | undefined;
	readonly stdout: readonly string[];
	readonly stdoutJson: unknown | undefined;
}

export const getRelevantOutput = (
	result: E2eRunResult,
	expectedExitCode: 0 | 1
): string => {
	if (expectedExitCode === 0) {
		if (result.stdoutJson === undefined) {
			return result.stdout[0] ?? "";
		}
		return JSON.stringify(result.stdoutJson);
	}

	if (result.stderrJson === undefined) {
		return result.stderr[0] ?? "";
	}
	return JSON.stringify(result.stderrJson);
};

export const makeRuntimeFetch = (): ((
	input: string | URL | Request,
	init?: RequestInit
) => Promise<Response>) => {
	const runtime = dsarInstance({
		...E2E_RUNTIME_AUTH,
		repos: { persistence: makeMinimalPersistenceSync() },
	});
	return async (input: string | URL | Request, init?: RequestInit) => {
		const request =
			input instanceof Request
				? new Request(input, init)
				: new Request(input.toString(), init);
		return await runtime.handler(request);
	};
};

export const parseJsonLine = (
	line: string | undefined
): unknown | undefined => {
	if (!line) {
		return undefined;
	}
	try {
		return JSON.parse(line) as unknown;
	} catch {
		return undefined;
	}
};

export const runE2eCli = async (input: {
	readonly argv: readonly string[];
	readonly fetch?: ReturnType<typeof makeRuntimeFetch>;
}): Promise<E2eRunResult> => {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const fetchImpl = input.fetch ?? makeRuntimeFetch();
	const hasTokenFlag = input.argv.some(
		(argument) =>
			argument === "-t" ||
			argument === "--token" ||
			argument.startsWith("-t") ||
			argument.startsWith("--token")
	);
	const argv = [
		...input.argv,
		"--api-url",
		E2E_API_URL,
		"--output",
		"json",
		...(hasTokenFlag ? [] : ["--token", E2E_API_TOKEN]),
	];
	const exitCode = await runCli({
		argv,
		fetch: fetchImpl,
		stderr: (line: string) => stderr.push(line),
		stdout: (line: string) => stdout.push(line),
	});
	return {
		exitCode,
		stderr,
		stderrJson: parseJsonLine(stderr[0]),
		stdout,
		stdoutJson: parseJsonLine(stdout[0]),
	};
};

export const BASE_JSON_BODY = {
	challengeId: "challenge-1",
	channel: "email",
	class: "request_record",
	decision: "approve",
	id: "retention-general",
	intakeSource: {
		channel: "api",
		receivedAt: "2026-02-20T00:00:00.000Z",
		type: "api",
	},
	jurisdiction: "uk",
	legalHoldEnabled: false,
	level: "standard",
	manifest: {
		artifacts: [],
	},
	maxDays: 30,
	metadata: {
		jurisdiction: "uk",
		name: "pack",
		version: "1.0.0",
	},
	method: "document",
	minDays: 1,
	pack: {
		rules: [],
	},
	purgeEnabled: true,
	response: "123456",
	tenantId: "tenant-default",
	updatedAt: "2026-02-20T00:00:00.000Z",
};

export const DEFAULT_IDS = {
	appealId: "appeal-1",
	artifactId: "artifact-1",
	id: "req-1",
	proposalId: "proposal-1",
	subjectId: "subject-1",
	tenantId: "tenant-default",
} as const;

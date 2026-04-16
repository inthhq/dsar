import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

type JsonRecord = Readonly<Record<string, unknown>>;

interface StepOutput {
	readonly payload: unknown;
	readonly response: Response;
	readonly url: string;
}

type StepMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

interface Step {
	readonly assert: (output: StepOutput) => boolean;
	readonly auth?: boolean;
	readonly body?: unknown | (() => unknown);
	readonly headers?: Readonly<Record<string, string>>;
	readonly method?: StepMethod;
	readonly name: string;
	readonly path: string | (() => string);
}

interface Result {
	readonly details: string;
	readonly name: string;
	readonly pass: boolean;
}

interface ArtifactManifestEntry {
	readonly description: string;
	readonly id: string;
	readonly mediaType: string;
	readonly sha256: string;
	readonly sizeBytes: number;
	readonly sourceSystem: string;
	readonly title: string;
	readonly type: string;
}

interface KitchenSinkState {
	artifactLink: string;
	artifactManifestEntry: ArtifactManifestEntry | null;
	lifecycleRequestId: string;
}

const asRecord = (value: unknown): JsonRecord | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: undefined;

const port = process.env.PORT ?? "3021";
const basePath = process.env.DSAR_BASE_PATH ?? "/api/v1";
const rootUrl = process.env.DSAR_TEST_ROOT_URL ?? `http://localhost:${port}`;
const baseUrl =
	process.env.DSAR_TEST_BASE_URL ??
	`${rootUrl.replace(/\/$/, "")}${basePath === "/" ? "" : basePath}`;
const requestId =
	process.env.DSAR_TEST_REQUEST_ID ?? "kitchen-sink-request-001";
const REQUIRED_POLICY_VERSION = "1.0.0";
const POLICY_PACK_SUBSTRING = "uk";
const testTenant =
	process.env.DSAR_TEST_TENANT ??
	process.env.DSAR_TENANT_ID ??
	"tenant-default";
const testToken =
	process.env.DSAR_ADMIN_API_TOKEN ??
	process.env.DSAR_API_TOKEN ??
	process.env.DSAR_TEST_API_TOKEN;

if (!testToken) {
	throw new Error(
		"Missing DSAR API token. Set DSAR_ADMIN_API_TOKEN, DSAR_API_TOKEN, or DSAR_TEST_API_TOKEN."
	);
}

const kitchenSinkState: KitchenSinkState = {
	artifactLink: "",
	artifactManifestEntry: null,
	lifecycleRequestId: requestId,
};

const defaultHeaders: Readonly<Record<string, string>> = {
	Authorization: `Bearer ${testToken}`,
	"content-type": "application/json",
};

const toIsoNow = (): string => new Date().toISOString();

const toDetails = (response: Response, payload: unknown): string =>
	`status=${response.status} payload=${JSON.stringify(payload)}`;

const hasPolicyEvaluationFields = (data: JsonRecord | undefined): boolean => {
	const decision = asRecord(data?.decision);
	const trace = data?.explainabilityTrace;
	return (
		decision !== undefined &&
		typeof decision.verificationRequired === "boolean" &&
		typeof decision.appealEligible === "boolean" &&
		typeof decision.refusalEligible === "boolean" &&
		Array.isArray(data?.requiredActions) &&
		Array.isArray(trace) &&
		trace.length > 0
	);
};

const isAcceptedMappedJurisdiction = (
	payload: unknown,
	response: Response
): boolean => {
	const envelope = asRecord(payload);
	const data = asRecord(envelope?.data);
	return (
		response.status === 202 &&
		envelope?.ok === true &&
		typeof data?.id === "string"
	);
};

const parseBody = async (response: Response): Promise<unknown> => {
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return await response.text();
	}

	try {
		return await response.json();
	} catch {
		return { parseError: "invalid_json" } as const;
	}
};

const sendRequest = async (step: Step): Promise<StepOutput> => {
	const stepPath = typeof step.path === "function" ? step.path() : step.path;
	const stepBody = typeof step.body === "function" ? step.body() : step.body;
	const url = `${baseUrl}${stepPath}`;
	const headers =
		step.auth === false
			? { ...step.headers }
			: { ...defaultHeaders, ...step.headers };

	const response = await fetch(url, {
		body: stepBody === undefined ? undefined : JSON.stringify(stepBody),
		headers,
		method: step.method ?? "GET",
	});
	const payload = await parseBody(response);

	return { payload, response, url };
};

const addResult = (
	results: Result[],
	name: string,
	pass: boolean,
	details: string
): void => {
	results.push({ details, name, pass });
	console.log(`${pass ? "[PASS]" : "[FAIL]"} ${name}`);
	if (!pass) {
		console.log(`       ${details}`);
	}
};

const runSingleStep = async (
	results: Result[],
	step: Step
): Promise<boolean> => {
	try {
		const output = await sendRequest(step);
		addResult(
			results,
			step.name,
			step.assert(output),
			toDetails(output.response, output.payload)
		);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		addResult(results, step.name, false, `Network error: ${message}`);
		console.log("");
		console.log("Hint: start the server first with `bun run dev`.");
		return false;
	}
};

const steps: readonly Step[] = [
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 200 &&
				envelope?.ok === true &&
				data?.status === "ok"
			);
		},
		method: "GET",
		name: "GET /status returns runtime ok",
		path: "/status",
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 200 &&
				envelope?.ok === true &&
				data?.initialized === true
			);
		},
		auth: false,
		method: "POST",
		name: "POST /init returns initialized=true",
		path: "/init",
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			const createdId = data?.id;
			if (typeof createdId === "string" && createdId.length > 0) {
				kitchenSinkState.lifecycleRequestId = createdId;
			}
			return isAcceptedMappedJurisdiction(payload, response);
		},
		body: {
			intakeSource: { channel: "api", receivedAt: toIsoNow(), type: "api" },
			jurisdiction: "uk",
		},
		method: "POST",
		name: "POST /requests accepts UK policy-pack jurisdiction",
		path: "/requests",
	},
	{
		assert: ({ payload, response }) =>
			isAcceptedMappedJurisdiction(payload, response),
		body: {
			intakeSource: { channel: "api", receivedAt: toIsoNow(), type: "api" },
			jurisdiction: "eu",
		},
		method: "POST",
		name: "POST /requests accepts EU policy-pack jurisdiction",
		path: "/requests",
	},
	{
		assert: ({ payload, response }) =>
			isAcceptedMappedJurisdiction(payload, response),
		body: {
			intakeSource: { channel: "api", receivedAt: toIsoNow(), type: "api" },
			jurisdiction: "us",
		},
		method: "POST",
		name: "POST /requests accepts US policy-pack jurisdiction",
		path: "/requests",
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			if (
				response.status !== 200 ||
				envelope?.ok !== true ||
				data?.policyVersion !== REQUIRED_POLICY_VERSION
			) {
				return false;
			}
			if (typeof data?.policyPack !== "string") {
				return false;
			}
			const policyPack = data.policyPack as string;
			return (
				policyPack.includes(POLICY_PACK_SUBSTRING) &&
				hasPolicyEvaluationFields(data)
			);
		},
		method: "GET",
		name: "GET /requests/:id/clock/explain returns resolved policy pack and evaluation data",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/clock/explain`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const error = asRecord(envelope?.error);
			return (
				response.status === 409 &&
				envelope?.ok === false &&
				error?.code === "LIFECYCLE_TRANSITION_DISALLOWED"
			);
		},
		method: "POST",
		name: "POST /requests/:id/verification/approve blocks invalid transition",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/verification/approve`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			return response.status === 202 && envelope?.ok === true;
		},
		method: "POST",
		name: "POST /requests/:id/verification/request opens verification",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/verification/request`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			return response.status === 202 && envelope?.ok === true;
		},
		method: "POST",
		name: "POST /requests/:id/verification/approve approves verification",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/verification/approve`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 202 &&
				envelope?.ok === true &&
				data?.surface === "verification_evidence"
			);
		},
		method: "POST",
		name: "POST /requests/:id/verification/evidence records evidence",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/verification/evidence`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 202 &&
				envelope?.ok === true &&
				data?.status === "recorded" &&
				kitchenSinkState.artifactLink.startsWith("file://")
			);
		},
		body: () => ({
			manifest: {
				artifacts: kitchenSinkState.artifactManifestEntry
					? [kitchenSinkState.artifactManifestEntry]
					: [],
				supplementaryInfoRef: kitchenSinkState.artifactLink,
			},
		}),
		method: "POST",
		name: "POST /requests/:id/fulfilment/callback records fulfillment artifact",
		path: () =>
			`/requests/${kitchenSinkState.lifecycleRequestId}/fulfilment/callback`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 202 &&
				envelope?.ok === true &&
				data?.tenantId === testTenant
			);
		},
		body: {
			class: "general",
			id: "retention-general",
			legalHoldEnabled: true,
			maxDays: 365,
			minDays: 30,
			purgeEnabled: true,
			updatedAt: toIsoNow(),
		},
		method: "PUT",
		name: "PUT /tenants/:tenantId/retention upserts retention policy",
		path: () => `/tenants/${testTenant}/retention`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const data = asRecord(envelope?.data);
			return (
				response.status === 200 &&
				envelope?.ok === true &&
				(typeof data?.status === "string" || typeof data?.class === "string")
			);
		},
		method: "GET",
		name: "GET /tenants/:tenantId/retention fetches retention policy",
		path: () => `/tenants/${testTenant}/retention`,
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const error = asRecord(envelope?.error);
			return (
				response.status === 400 &&
				envelope?.ok === false &&
				error?.code === "REQUEST_VALIDATION_FAILED"
			);
		},
		body: {
			intakeSource: { channel: "api", receivedAt: toIsoNow(), type: "api" },
		},
		method: "POST",
		name: "POST /requests rejects missing jurisdiction",
		path: "/requests",
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const error = asRecord(envelope?.error);
			return (
				response.status === 400 &&
				envelope?.ok === false &&
				error?.code === "POLICY_JURISDICTION_UNMAPPED"
			);
		},
		body: {
			intakeSource: { channel: "api", receivedAt: toIsoNow(), type: "api" },
			jurisdiction: "zz-unknown",
		},
		method: "POST",
		name: "POST /requests rejects unmapped jurisdiction",
		path: "/requests",
	},
	{
		assert: ({ payload, response }) => {
			const envelope = asRecord(payload);
			const error = asRecord(envelope?.error);
			const message = error?.message;
			return (
				response.status === 400 &&
				envelope?.ok === false &&
				typeof message === "string" &&
				message.includes("svix headers")
			);
		},
		auth: false,
		headers: { "content-type": "text/plain" },
		method: "POST",
		name: "POST /webhooks/inbound/resend validates webhook headers",
		path: "/webhooks/inbound/resend",
	},
];

const runAllSteps = async (): Promise<readonly Result[]> => {
	const results: Result[] = [];
	for (const step of steps) {
		const shouldContinue = await runSingleStep(results, step);
		if (!shouldContinue) {
			break;
		}
	}
	return results;
};

// oxlint-disable-next-line max-statements
const buildArtifactFixture = async (): Promise<void> => {
	const artifactDir = ".dsar-kitchen-sink-artifacts/fixture";
	const artifactFileName = `kitchen-sink-attachment-${Date.now()}.txt`;
	const artifactRelativePath = `${artifactDir}/${artifactFileName}`;
	const artifactAbsolutePath = `${process.cwd().replace(/\/$/, "")}/${artifactRelativePath}`;
	const attachmentPayload = {
		description: "Kitchen sink attachment payload for fulfillment callback.",
		formatVersion: "kitchen-sink-v1",
		requestShape: {
			channel: "api",
			requiredFields: ["jurisdiction", "intakeSource", "requestor"],
			workflow: ["capture", "verification", "fulfillment"],
		},
	};
	const attachmentText = JSON.stringify(attachmentPayload, null, 2);

	await mkdir(artifactDir, { recursive: true });
	await writeFile(artifactRelativePath, attachmentText, "utf8");

	const sha256 = createHash("sha256").update(attachmentText).digest("hex");
	kitchenSinkState.artifactLink = `file://${artifactAbsolutePath}`;
	kitchenSinkState.artifactManifestEntry = {
		description: "Kitchen sink JSON attachment in text form",
		id: `artifact-kitchen-sink-${Date.now()}`,
		mediaType: "text/plain",
		sha256,
		sizeBytes: Buffer.byteLength(attachmentText, "utf8"),
		sourceSystem: "kitchen-sink-example",
		title: artifactFileName,
		type: "other",
	};
};

const printSummary = (results: readonly Result[]): void => {
	const failed = results.filter((result) => !result.pass).length;
	const passed = results.length - failed;

	console.log("");
	console.log(`Summary: ${passed}/${results.length} checks passed.`);
	if (failed > 0) {
		console.log("Kitchen sink run failed.");
		process.exitCode = 1;
		return;
	}
	console.log("Kitchen sink run passed.");
};

const run = async (): Promise<void> => {
	await buildArtifactFixture();
	console.log(`Running kitchen sink example against ${baseUrl}`);
	console.log(`Artifact attachment link: ${kitchenSinkState.artifactLink}`);
	console.log("");
	const results = await runAllSteps();
	printSummary(results);
};

await run();

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PersistenceService } from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";

import { makePgPersistenceService } from "../../../persistence-pg/src";
import { makeSqlitePersistenceService } from "../../../persistence-sqlite/src";
import { makeFilesystemStorageAdapter } from "../../../storage-filesystem/src";
import type { SuccessEnvelope } from "../../src";
import { ACTOR_HEADERS, startApiE2eServer } from "./harness";
import type { ApiE2eServer } from "./harness";

const E2E_TEST_TIMEOUT_MS = 30_000;

const postgresUrl =
	process.env.DSAR_TEST_DATABASE_URL?.trim() ||
	process.env.DSAR_TEST_PG_URL?.trim() ||
	"";
const hasPostgresUrl = postgresUrl.length > 0;

const asEnvelope = async <T>(response: Response): Promise<SuccessEnvelope<T>> =>
	(await response.json()) as SuccessEnvelope<T>;

const makeTempRoot = (): Promise<string> =>
	mkdtemp(join(tmpdir(), "dsar-real-adapter-e2e-"));

const startRealAdapterServer = (input: {
	readonly artifactsDir: string;
	readonly persistence: PersistenceService;
}): Promise<ApiE2eServer> =>
	startApiE2eServer({
		adapters: {
			inbound: "stub",
			notifications: "stub",
			storage: makeFilesystemStorageAdapter({
				baseDir: input.artifactsDir,
				prefix: "artifacts",
				retryMaxAttempts: 1,
			}),
		},
		persistence: input.persistence,
	});

const runCaptureVerifyFulfil = async (
	server: ApiE2eServer,
	artifactsDir: string
): Promise<void> => {
	const diagnostics = await server.request({
		headers: ACTOR_HEADERS,
		method: "GET",
		path: "/status/diagnostics",
	});
	const diagnosticsBody = await asEnvelope<{
		readonly adapters: readonly {
			readonly capability: string;
			readonly key: string;
			readonly status: string;
		}[];
		readonly persistence: { readonly reachable: boolean };
	}>(diagnostics);

	const capture = await server.request({
		headers: ACTOR_HEADERS,
		json: {
			intakeSource: {
				channel: "api",
				receivedAt: "2026-03-01T00:00:00.000Z",
				type: "api",
			},
			jurisdiction: "uk",
			requestType: "access",
			requestor: {
				email: `real-adapter-${crypto.randomUUID()}@example.test`,
				type: "subject",
			},
			requiresVerification: true,
		},
		method: "POST",
		path: "/requests/capture",
	});
	const captureBody = await asEnvelope<{
		readonly id: string;
		readonly status: string;
	}>(capture);
	const requestId = captureBody.data.id;

	const verificationRequest = await server.request({
		headers: ACTOR_HEADERS,
		method: "POST",
		path: `/requests/${requestId}/verification/request`,
	});
	const verificationRequestBody = await asEnvelope<{
		readonly status: string;
	}>(verificationRequest);

	const verificationApprove = await server.request({
		headers: ACTOR_HEADERS,
		method: "POST",
		path: `/requests/${requestId}/verification/approve`,
	});
	const verificationApproveBody = await asEnvelope<{
		readonly status: string;
	}>(verificationApprove);

	const evidenceBytes = new TextEncoder().encode("identity-document");
	const evidenceUpload = await server.request({
		body: evidenceBytes,
		headers: {
			...ACTOR_HEADERS,
			"content-type": "text/plain",
			"x-evidence-content-type": "text/plain",
			"x-evidence-filename": "identity.txt",
		},
		method: "POST",
		path: `/requests/${requestId}/verification/evidence/upload`,
	});
	const evidenceUploadBody = await asEnvelope<{
		readonly artifactKey: string;
		readonly evidenceId: string;
		readonly requestId: string;
		readonly status: string;
	}>(evidenceUpload);

	const storedEvidence = await stat(
		join(artifactsDir, ...evidenceUploadBody.data.artifactKey.split("/"))
	);

	const fulfil = await server.request({
		headers: ACTOR_HEADERS,
		method: "POST",
		path: `/requests/${requestId}/fulfilment`,
	});
	const fulfilBody = await asEnvelope<{ readonly status: string }>(fulfil);

	const loaded = await server.request({
		headers: ACTOR_HEADERS,
		method: "GET",
		path: `/requests/${requestId}`,
	});
	const loadedBody = await asEnvelope<{
		readonly id: string;
		readonly status: string;
	}>(loaded);

	const timeline = await server.request({
		headers: ACTOR_HEADERS,
		method: "GET",
		path: `/requests/${requestId}/timeline`,
	});
	const timelineBody = await asEnvelope<{
		readonly events: readonly { readonly eventType: string }[];
	}>(timeline);

	const clock = await server.request({
		headers: ACTOR_HEADERS,
		method: "GET",
		path: `/requests/${requestId}/clock/explain`,
	});
	const clockBody = await asEnvelope<{
		readonly policyPack: string;
		readonly policyVersion: string;
	}>(clock);

	expect([
		diagnostics.status,
		diagnosticsBody.data.persistence.reachable,
		capture.status,
		captureBody.data.status,
		verificationRequest.status,
		verificationRequestBody.data.status,
		verificationApprove.status,
		verificationApproveBody.data.status,
		evidenceUpload.status,
		evidenceUploadBody.data.requestId,
		evidenceUploadBody.data.status,
		fulfil.status,
		fulfilBody.data.status,
		loaded.status,
		loadedBody.data.id,
		loadedBody.data.status,
		timeline.status,
		clock.status,
	]).toStrictEqual([
		200,
		true,
		202,
		"captured",
		202,
		"verification_pending",
		202,
		"in_progress",
		202,
		requestId,
		"pending",
		202,
		"fulfilled",
		200,
		requestId,
		"fulfilled",
		200,
		200,
	]);
	expect(
		diagnosticsBody.data.adapters.map((adapter) => ({
			capability: adapter.capability,
			key: adapter.key,
			status: adapter.status,
		}))
	).toStrictEqual([
		{
			capability: "storage",
			key: "storage-filesystem",
			status: "healthy",
		},
	]);
	expect(storedEvidence.isFile()).toBe(true);
	expect(storedEvidence.size).toBe(evidenceBytes.byteLength);
	expect(
		timelineBody.data.events.map((event) => event.eventType)
	).toStrictEqual([
		"captured",
		"verification_requested",
		"verification_resolved",
		"verification_evidence_uploaded",
		"fulfilled",
	]);
	expect([
		clockBody.data.policyPack,
		clockBody.data.policyVersion,
	]).toStrictEqual(["launch-uk-uk", "1.0.0"]);
};

describe("api e2e lifecycle over real adapters", () => {
	it(
		"runs capture verify fulfil on sqlite and filesystem storage",
		async () => {
			const root = await makeTempRoot();
			const artifactsDir = join(root, "artifacts");
			const persistence = await makeSqlitePersistenceService({
				create: true,
				filename: join(root, "dsar.sqlite"),
			});
			const server = await startRealAdapterServer({
				artifactsDir,
				persistence,
			});
			try {
				await runCaptureVerifyFulfil(server, artifactsDir);
			} finally {
				await server.close();
				await rm(root, { force: true, recursive: true });
			}
		},
		E2E_TEST_TIMEOUT_MS
	);

	it.skipIf(!hasPostgresUrl)(
		"runs capture verify fulfil on postgres and filesystem storage",
		async () => {
			const root = await makeTempRoot();
			const artifactsDir = join(root, "artifacts");
			const persistence = await makePgPersistenceService({
				connectionUrl: postgresUrl,
			});
			const server = await startRealAdapterServer({
				artifactsDir,
				persistence,
			});
			try {
				await runCaptureVerifyFulfil(server, artifactsDir);
			} finally {
				await server.close();
				await rm(root, { force: true, recursive: true });
			}
		},
		E2E_TEST_TIMEOUT_MS
	);
});

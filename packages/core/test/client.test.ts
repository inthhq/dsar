/* oxlint-disable max-statements */
/* oxlint-disable jest/no-conditional-in-test */
import { describe, expect, it } from "@effect/vitest";

import { buildCoreClient } from "#src/client";

const makeStatusFetch = (service: string): typeof fetch =>
	(() =>
		Response.json({
			data: { service, status: "ok" },
			ok: true,
		})) as unknown as typeof fetch;

describe("@dsar/core client", () => {
	it("uses the same call site across all modes", async () => {
		const managed = buildCoreClient({
			baseUrl: "https://managed.test/api/v1",
			fetch: makeStatusFetch("managed-service"),
			mode: "managed",
		});
		const selfHosted = buildCoreClient({
			baseUrl: "https://self-hosted.test/api/v1",
			fetch: makeStatusFetch("self-hosted-service"),
			mode: "self-hosted",
		});
		const custom = buildCoreClient({
			handler: (invocation) => {
				if (invocation.path.join(".") === "status") {
					return { service: "custom-service", status: "ok" };
				}
				return { status: "stubbed" };
			},
			mode: "custom",
		});
		const offline = buildCoreClient({
			fixtures: {
				status: { service: "offline-service", status: "ok" },
			},
			mode: "offline",
		});

		const managedStatus = await managed.sdk.status();
		const selfHostedStatus = await selfHosted.sdk.status();
		const customStatus = await custom.sdk.status();
		const offlineStatus = await offline.sdk.status();

		expect(managedStatus.unwrap().service).toBe("managed-service");
		expect(selfHostedStatus.unwrap().service).toBe("self-hosted-service");
		expect(customStatus.unwrap().service).toBe("custom-service");
		expect(offlineStatus.unwrap().service).toBe("offline-service");
	});

	it("defaults aiEnabled to false and supports explicit true", () => {
		const defaultAi = buildCoreClient({
			mode: "offline",
		});
		const explicitAi = buildCoreClient({
			aiEnabled: true,
			mode: "offline",
		});
		expect(defaultAi.aiEnabled).toBeFalsy();
		expect(explicitAi.aiEnabled).toBeTruthy();
	});
});

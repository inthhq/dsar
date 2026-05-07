import { withTenant } from "@dsar/persistence";
import { describe, expect, it } from "@effect/vitest";
import { runPromise } from "effect/Effect";

import { makeMinimalPersistence } from "../../src/testing/minimal-persistence";

describe(makeMinimalPersistence, () => {
	it("isolates webhook endpoint signing keys by tenant", async () => {
		const persistence = await runPromise(makeMinimalPersistence());

		await runPromise(
			persistence.webhookEndpoints
				.ensureConfigured({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "default",
					signingSecret: "tenant-a-secret",
					url: "https://tenant-a.example/webhook",
				})
				.pipe(withTenant("tenant-a"))
		);
		await runPromise(
			persistence.webhookEndpoints
				.ensureConfigured({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "default",
					signingSecret: "tenant-b-secret",
					url: "https://tenant-b.example/webhook",
				})
				.pipe(withTenant("tenant-b"))
		);

		const [tenantAEndpoint, tenantAKeys, tenantBEndpoint, tenantBKeys] =
			await Promise.all([
				runPromise(
					persistence.webhookEndpoints
						.getById("default")
						.pipe(withTenant("tenant-a"))
				),
				runPromise(
					persistence.webhookEndpoints
						.listActiveKeys("default", "2026-01-02T00:00:00.000Z")
						.pipe(withTenant("tenant-a"))
				),
				runPromise(
					persistence.webhookEndpoints
						.getById("default")
						.pipe(withTenant("tenant-b"))
				),
				runPromise(
					persistence.webhookEndpoints
						.listActiveKeys("default", "2026-01-02T00:00:00.000Z")
						.pipe(withTenant("tenant-b"))
				),
			]);

		expect(tenantAEndpoint).toMatchObject({
			tenantId: "tenant-a",
			url: "https://tenant-a.example/webhook",
		});
		expect(tenantBEndpoint).toMatchObject({
			tenantId: "tenant-b",
			url: "https://tenant-b.example/webhook",
		});
		expect(tenantAKeys).toStrictEqual([
			expect.objectContaining({
				secret: "tenant-a-secret",
				tenantId: "tenant-a",
			}),
		]);
		expect(tenantBKeys).toStrictEqual([
			expect.objectContaining({
				secret: "tenant-b-secret",
				tenantId: "tenant-b",
			}),
		]);
	});

	it("returns rotation active keys from the same atomic update", async () => {
		const persistence = await runPromise(makeMinimalPersistence());
		await runPromise(
			persistence.webhookEndpoints
				.ensureConfigured({
					createdAt: "2026-01-01T00:00:00.000Z",
					id: "default",
					signingSecret: "old-secret",
					url: "https://tenant.example/webhook",
				})
				.pipe(withTenant("tenant-a"))
		);

		const rotation = await runPromise(
			persistence.webhookEndpoints
				.rotateSigningKey({
					endpointId: "default",
					graceExpiresAt: "2026-01-08T00:00:00.000Z",
					newKeyId: "key-new",
					newSecret: "new-secret",
					rotatedAt: "2026-01-02T00:00:00.000Z",
				})
				.pipe(withTenant("tenant-a"))
		);

		expect(rotation).toMatchObject({
			activeKeys: [
				{ id: "key-new", role: "primary" },
				{ id: "default:primary", role: "secondary" },
			],
			newPrimary: { id: "key-new" },
			previousPrimary: { id: "default:primary" },
		});
	});
});

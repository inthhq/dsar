import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { normalizeAdapterError } from "../../../src/adapters";
import {
	makeInboundFixture,
	makeNotificationFixture,
	makeStorageFixture,
} from "./fixtures";

describe("adapter conformance baseline", () => {
	it.effect(
		"validates init/config/health/diagnostics shape for notification adapters",
		() =>
			Effect.gen(function* _() {
				const adapter = makeNotificationFixture();
				yield* adapter.validateConfig({});
				yield* adapter.init({});
				const health = yield* adapter.healthCheck();
				const diagnostics = yield* adapter.diagnostics();

				expect(health.ok).toBeTruthy();
				expect(["healthy", "degraded", "down"]).toContain(health.status);
				expect(diagnostics.capability).toBe("notifications");
			})
	);

	it.effect("accepts skipped notification delivery outcomes", () =>
		Effect.gen(function* _() {
			const adapter = makeNotificationFixture({
				send: () =>
					Effect.succeed({
						error: "disabled by policy",
						status: "skipped",
					}),
			});
			const result = yield* adapter.send({
				correlationId: "corr_1",
				eventId: "evt_1",
				eventType: "request_captured",
				idempotencyKey: "idem_1",
				locale: "en-GB",
				payload: {},
				policyVersion: "policy-v1",
				requestId: "req_1",
			});
			expect(result.status).toBe("skipped");
		})
	);

	it("normalizes adapter errors with retriable classification", () => {
		const error = normalizeAdapterError({
			adapterKey: "fixture-notifications",
			capability: "notifications",
			error: new Error("network timeout while dispatching"),
		});
		expect(error.category).toBe("timeout");
		expect(error.retriable).toBeTruthy();
	});

	it.effect(
		"supports storage and inbound fixtures under shared contract lifecycle",
		() =>
			Effect.gen(function* _() {
				const storage = makeStorageFixture();
				const inbound = makeInboundFixture();

				yield* storage.validateConfig({});
				yield* storage.init({});
				yield* storage.healthCheck();
				const putResult = yield* storage.putObject({
					bytes: new Uint8Array([7]),
					contentType: "application/octet-stream",
					key: "file-1",
					manifestHash: "manifest-hash-1",
					manifestId: "manifest-1",
					manifestSignature: "sig-1",
					requestId: "request-1",
				});
				const headResult = yield* storage.headObject("file-1");
				const getResult = yield* storage.getObject("file-1");
				const deleteResult = yield* storage.deleteObject("file-1");
				expect(putResult.reference.manifestId).toBe("manifest-1");
				expect(headResult.key).toBe("file-1");
				expect(getResult.key).toBe("file-1");
				expect(deleteResult.deleted).toBeTruthy();

				yield* inbound.validateConfig({});
				yield* inbound.init({});
				const received = yield* inbound.receive({
					payload: { foo: "bar" },
					source: "email",
				});
				expect(received.sourceId.length).toBeGreaterThan(0);
			})
	);

	it.effect(
		"supports c15t-style inbound fixture keys in conformance suite",
		() =>
			Effect.gen(function* _() {
				const inbound = makeInboundFixture({
					diagnostics: () =>
						Effect.succeed({
							capability: "inbound",
							key: "c15t",
						}),
					key: "c15t",
				});
				yield* inbound.validateConfig({});
				const diagnostics = yield* inbound.diagnostics();
				expect(diagnostics.key).toBe("c15t");
				expect(diagnostics.capability).toBe("inbound");
			})
	);

	it.effect(
		"supports resend-style inbound fixture keys in conformance suite",
		() =>
			Effect.gen(function* _() {
				const inbound = makeInboundFixture({
					diagnostics: () =>
						Effect.succeed({
							capability: "inbound",
							key: "resend",
						}),
					key: "resend",
				});
				yield* inbound.validateConfig({});
				const diagnostics = yield* inbound.diagnostics();
				expect(diagnostics.key).toBe("resend");
				expect(diagnostics.capability).toBe("inbound");
			})
	);

	it.effect(
		"supports provider-keyed storage fixtures in conformance suite",
		() =>
			Effect.gen(function* _() {
				const storage = makeStorageFixture({
					diagnostics: () =>
						Effect.succeed({
							capability: "storage",
							key: "vercel-blob",
						}),
					key: "vercel-blob",
				});
				yield* storage.validateConfig({});
				const diagnostics = yield* storage.diagnostics();
				expect(diagnostics.key).toBe("vercel-blob");
				expect(diagnostics.capability).toBe("storage");
			})
	);
});

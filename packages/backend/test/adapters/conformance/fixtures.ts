import * as Effect from "effect/Effect";

import type {
	InboundAdapterContract,
	NotificationAdapterContract,
	StorageAdapterContract,
} from "../../../src/adapters";

export const makeNotificationFixture = (
	overrides: Partial<NotificationAdapterContract> = {}
): NotificationAdapterContract => ({
	capability: "notifications",
	diagnostics: () =>
		Effect.succeed({
			capability: "notifications",
			details: {
				provider: "fixture",
			},
			key: "fixture-notifications",
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "fixture-notifications",
	send: () =>
		Effect.succeed({
			responseCode: 202,
			status: "delivered",
		}),
	validateConfig: () => Effect.void,
	...overrides,
});

export const makeStorageFixture = (
	overrides: Partial<StorageAdapterContract> = {}
): StorageAdapterContract => ({
	capability: "storage",
	deleteObject: (key) => Effect.succeed({ deleted: true, key }),
	diagnostics: () =>
		Effect.succeed({
			capability: "storage",
			details: {
				provider: "fixture",
			},
			key: "fixture-storage",
		}),
	getObject: (key) =>
		Effect.succeed({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: "application/octet-stream",
			key,
			metadata: {
				contentType: "application/octet-stream",
				key,
				sizeBytes: 3,
			},
		}),
	headObject: (key) =>
		Effect.succeed({
			contentType: "application/octet-stream",
			key,
			sizeBytes: 3,
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "fixture-storage",
	putObject: (input) =>
		Effect.succeed({
			key: input.key,
			metadata: {
				contentType: input.contentType,
				key: input.key,
				manifestHash: input.manifestHash,
				manifestId: input.manifestId,
				manifestSignature: input.manifestSignature,
				requestId: input.requestId,
				sizeBytes: input.bytes.byteLength,
			},
			reference: {
				key: input.key,
				manifestHash: input.manifestHash,
				manifestId: input.manifestId,
				manifestSignature: input.manifestSignature,
				requestId: input.requestId,
			},
		}),
	validateConfig: () => Effect.void,
	...overrides,
});

export const makeInboundFixture = (
	overrides: Partial<InboundAdapterContract> = {}
): InboundAdapterContract => ({
	capability: "inbound",
	diagnostics: () =>
		Effect.succeed({
			capability: "inbound",
			details: {
				provider: "fixture",
			},
			key: "fixture-inbound",
		}),
	healthCheck: () =>
		Effect.succeed({
			ok: true,
			status: "healthy",
		}),
	init: () => Effect.void,
	key: "fixture-inbound",
	receive: (input) =>
		Effect.succeed({
			payload:
				typeof input.payload === "object" &&
				input.payload !== null &&
				!Array.isArray(input.payload)
					? (input.payload as Readonly<Record<string, unknown>>)
					: {},
			receivedAt: new Date().toISOString(),
			sourceId: "fixture-source-id",
		}),
	validateConfig: () => Effect.void,
	...overrides,
});

import { describe, expect, it } from "@effect/vitest";

import { makeUnkeyBearerResolver } from "#src";
import type { DsarResolvedIdentity } from "#src";

const DSAR_UNKEY_REQUIRED_PERMISSION = "dsar.api";

const verifyAdminKey = () =>
	Promise.resolve({
		data: {
			identity: {
				email: "ignored@example.com",
				externalId: "tenant-admin-1",
			},
			keyId: "key_123",
			meta: {
				email: "operator@example.com",
				principalKind: "operator",
				role: "admin",
				tenantId: "tenant-1",
				workspaceId: "workspace-1",
			},
			valid: true,
		},
		meta: {
			requestId: "req_verify",
		},
	});

const verifyMemberKey = () =>
	Promise.resolve({
		data: {
			keyId: "key_123",
			meta: {
				tenantId: "tenant-1",
			},
			roles: ["member"],
			valid: true,
		},
	});

const verifyInvalidKey = () =>
	Promise.resolve({
		data: {
			code: "INVALID",
			valid: false,
		},
	});

const createPermissionAwareVerifyKey =
	(
		inputs: {
			readonly key: string;
			readonly permissions?: string;
		}[],
		allowedPermissions: readonly string[]
	) =>
	(input: { readonly key: string; readonly permissions?: string }) => {
		inputs.push(input);
		return allowedPermissions.includes(input.permissions ?? "")
			? verifyMemberKey()
			: verifyInvalidKey();
	};

const verifyTenantlessKey = () =>
	Promise.resolve({
		data: {
			identity: {
				externalId: "subject-1",
			},
			keyId: "key_123",
			meta: {},
			valid: true,
		},
	});

const verifySubjectKey = () =>
	Promise.resolve({
		data: {
			identity: {
				externalId: "subject-1",
			},
			keyId: "key_123",
			meta: {
				tenantId: "tenant-1",
			},
			valid: true,
		},
	});

const mapVerifiedSubjectIdentity = ({
	defaultIdentity,
}: {
	readonly defaultIdentity: DsarResolvedIdentity | null;
}) => {
	if (!defaultIdentity) {
		throw new Error("Expected default identity for verified subject key.");
	}
	return {
		...defaultIdentity,
		email: "subject@example.com",
		principalKind: "subject" as const,
		role: "subject",
	};
};

describe("makeUnkeyBearerResolver", () => {
	it("maps Unkey verification metadata into a DSAR identity", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyAdminKey,
				},
			},
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toStrictEqual({
			actorId: "tenant-admin-1",
			email: "operator@example.com",
			principalKind: "operator",
			role: "admin",
			tenantId: "tenant-1",
			workspaceId: "workspace-1",
		});
	});

	it("falls back to key id and configured defaults", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyMemberKey,
				},
			},
			fallbackPrincipalKind: "service",
			fallbackRole: "service",
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toStrictEqual({
			actorId: "key_123",
			principalKind: "service",
			role: "member",
			tenantId: "tenant-1",
		});
	});

	it("returns undefined for invalid keys", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyInvalidKey,
				},
			},
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();
	});

	it("passes config.permissions to Unkey verification", async () => {
		const verifyInputs: {
			readonly key: string;
			readonly permissions?: string;
		}[] = [];
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: createPermissionAwareVerifyKey(verifyInputs, [
						DSAR_UNKEY_REQUIRED_PERMISSION,
					]),
				},
			},
			fallbackPrincipalKind: "service",
			permissions: DSAR_UNKEY_REQUIRED_PERMISSION,
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toStrictEqual({
			actorId: "key_123",
			principalKind: "service",
			role: "member",
			tenantId: "tenant-1",
		});
		expect(verifyInputs).toStrictEqual([
			{
				key: "token-1",
				permissions: DSAR_UNKEY_REQUIRED_PERMISSION,
			},
		]);
	});

	it("returns undefined when Unkey rejects the configured permission", async () => {
		const verifyInputs: {
			readonly key: string;
			readonly permissions?: string;
		}[] = [];
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: createPermissionAwareVerifyKey(verifyInputs, []),
				},
			},
			permissions: DSAR_UNKEY_REQUIRED_PERMISSION,
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();
		expect(verifyInputs).toStrictEqual([
			{
				key: "token-1",
				permissions: DSAR_UNKEY_REQUIRED_PERMISSION,
			},
		]);
	});

	it("returns undefined when required tenant metadata is absent", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyTenantlessKey,
				},
			},
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();
	});

	it("allows hosts to override identity projection", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifySubjectKey,
				},
			},
			mapIdentity: mapVerifiedSubjectIdentity,
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toStrictEqual({
			actorId: "subject-1",
			email: "subject@example.com",
			principalKind: "subject",
			role: "subject",
			tenantId: "tenant-1",
		});
	});
});

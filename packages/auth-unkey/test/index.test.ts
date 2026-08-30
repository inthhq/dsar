import { describe, expect, it } from "@effect/vitest";

import { makeUnkeyBearerResolver } from "#src";
import type { DsarResolvedIdentity } from "#src";

const DSAR_UNKEY_REQUIRED_PERMISSION = "dsar.api";

const INVALID_VERIFY_RESULTS = [
	{
		code: "EXPIRED",
		name: "expired keys",
	},
	{
		code: "REVOKED",
		name: "revoked keys",
	},
	{
		code: "MALFORMED",
		name: "malformed keys",
	},
	{
		code: "RATE_LIMITED",
		name: "rate-limited keys",
	},
] as const;

const MALFORMED_TOKEN_CASES = [
	"",
	"   ",
	"short",
	"not-an-unkey-token",
	"sk_invalid whitespace",
	"sk_invalid_!",
] as const;

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

const createInvalidVerifyKey =
	(code: string) => (_input: { readonly key: string }) =>
		Promise.resolve({
			data: {
				code,
				valid: false,
			},
		});

const createRecordingInvalidVerifyKey =
	(inputs: string[]) => (input: { readonly key: string }) => {
		inputs.push(input.key);
		return verifyInvalidKey();
	};

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

const verifyTenantTwoKey = () =>
	Promise.resolve({
		data: {
			identity: {
				externalId: "tenant-two-admin",
			},
			keyId: "key_456",
			meta: {
				role: "admin",
				tenantId: "tenant-2",
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

const mapRequestedTenantIdentity = ({
	defaultIdentity,
	request,
}: {
	readonly defaultIdentity: DsarResolvedIdentity | null;
	readonly request: Request;
}) => {
	const requestedTenantId = request.headers.get("x-requested-tenant-id");
	if (defaultIdentity?.tenantId !== requestedTenantId) {
		return null;
	}
	return defaultIdentity;
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

describe("makeUnkeyBearerResolver fail-closed coverage", () => {
	it.each(INVALID_VERIFY_RESULTS)(
		"returns undefined for $name",
		async ({ code }) => {
			const resolver = makeUnkeyBearerResolver({
				client: {
					keys: {
						verifyKey: createInvalidVerifyKey(code),
					},
				},
			});

			await expect(
				resolver({
					request: new Request("https://example.test"),
					token: "token-1",
				})
			).resolves.toBeUndefined();
		}
	);

	it("returns undefined when Unkey verification fails before returning a result", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: () =>
						Promise.reject(new Error("Unkey verification unavailable.")),
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

	it("reports thrown verification failures to onVerifyError while failing closed", async () => {
		const observedErrors: unknown[] = [];
		const verifyError = new Error("Unkey verification unavailable.");
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: () => Promise.reject(verifyError),
				},
			},
			onVerifyError: (error) => {
				observedErrors.push(error);
			},
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();

		expect(observedErrors).toStrictEqual([verifyError]);
	});

	it("continues failing closed when onVerifyError throws", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: () =>
						Promise.reject(new Error("Unkey verification unavailable.")),
				},
			},
			onVerifyError: () => {
				throw new Error("Observability unavailable.");
			},
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();
	});

	it("continues failing closed when onVerifyError rejects", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: () =>
						Promise.reject(new Error("Unkey verification unavailable.")),
				},
			},
			onVerifyError: () =>
				Promise.reject(new Error("Observability unavailable.")),
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toBeUndefined();
	});

	it.each(MALFORMED_TOKEN_CASES)(
		"delegates malformed-looking token %p to Unkey and fails closed",
		async (token) => {
			const verifyInputs: string[] = [];
			const resolver = makeUnkeyBearerResolver({
				client: {
					keys: {
						verifyKey: createRecordingInvalidVerifyKey(verifyInputs),
					},
				},
			});

			await expect(
				resolver({
					request: new Request("https://example.test"),
					token,
				})
			).resolves.toBeUndefined();

			expect(verifyInputs).toStrictEqual([token]);
		}
	);

	it("preserves tenant metadata for downstream tenant-scoped authorization", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyTenantTwoKey,
				},
			},
			fallbackPrincipalKind: "operator",
		});

		await expect(
			resolver({
				request: new Request("https://example.test"),
				token: "token-1",
			})
		).resolves.toStrictEqual({
			actorId: "tenant-two-admin",
			principalKind: "operator",
			role: "admin",
			tenantId: "tenant-2",
		});
	});

	it("lets tenant-scoped hosts reject keys for a different requested tenant", async () => {
		const resolver = makeUnkeyBearerResolver({
			client: {
				keys: {
					verifyKey: verifyAdminKey,
				},
			},
			mapIdentity: mapRequestedTenantIdentity,
		});

		await expect(
			resolver({
				request: new Request("https://example.test", {
					headers: {
						"x-requested-tenant-id": "tenant-2",
					},
				}),
				token: "tenant-a-token",
			})
		).resolves.toBeUndefined();
	});
});

import { describe, expect, it } from "@effect/vitest";

import { resolveRequestContext } from "../../src/middleware/auth-context";
import type { RuntimeAuthConfig } from "../../src/types/runtime";

const resolveTrustedSubjectIdentity = () => ({
	actorId: "subject-1",
	email: "subject@example.com",
	principalKind: "subject" as const,
	role: "subject",
	tenantId: "tenant-default",
	workspaceId: "workspace-a",
});

const resolveTrustedSubjectIdentityWithoutWorkspace = () => ({
	actorId: "subject-1",
	role: "subject",
	tenantId: "tenant-default",
});

const resolveTrustedOperatorIdentity = () => ({
	actorId: "operator-1",
	role: "admin",
	tenantId: "tenant-default",
});

describe(resolveRequestContext, () => {
	it("resolves bearer-backed identities before trusted host identity", async () => {
		let trustedCalls = 0;
		const auth: RuntimeAuthConfig = {
			resolveTrustedRequestIdentity: () => {
				trustedCalls += 1;
				return {
					actorId: "trusted-subject",
					principalKind: "subject",
					role: "subject",
					tenantId: "tenant-trusted",
				};
			},
			staticBearerTokens: {
				"test-admin-token": {
					actorId: "tester-admin",
					principalKind: "operator",
					role: "admin",
					tenantId: "tenant-default",
				},
			},
		};

		const context = await resolveRequestContext(
			new Request("https://example.test/requests/req-1", {
				headers: { authorization: "Bearer test-admin-token" },
			}),
			auth
		);

		expect(context).toStrictEqual({
			actor: {
				email: undefined,
				id: "tester-admin",
				principalKind: "operator",
				role: "admin",
			},
			tenantId: "tenant-default",
			workspaceId: undefined,
		});
		expect(trustedCalls).toBe(0);
	});

	it("resolves trusted host identity when bearer credentials are absent", async () => {
		const context = await resolveRequestContext(
			new Request("https://example.test/requests/req-1"),
			{
				resolveTrustedRequestIdentity: resolveTrustedSubjectIdentity,
			}
		);

		expect(context).toStrictEqual({
			actor: {
				email: "subject@example.com",
				id: "subject-1",
				principalKind: "subject",
				role: "subject",
			},
			tenantId: "tenant-default",
			workspaceId: "workspace-a",
		});
	});

	it("defaults trusted subject identities to subject principal kind", async () => {
		const context = await resolveRequestContext(
			new Request("https://example.test/requests/req-1"),
			{
				resolveTrustedRequestIdentity:
					resolveTrustedSubjectIdentityWithoutWorkspace,
			}
		);

		expect(context.actor?.principalKind).toBe("subject");
	});

	it("defaults non-subject identities to operator principal kind", async () => {
		const context = await resolveRequestContext(
			new Request("https://example.test/requests/req-1"),
			{
				resolveTrustedRequestIdentity: resolveTrustedOperatorIdentity,
			}
		);

		expect(context.actor?.principalKind).toBe("operator");
		expect(context.actor?.role).toBe("admin");
	});

	it("rejects invalid bearer tokens before trusted host fallback", async () => {
		let trustedCalls = 0;

		await expect(
			resolveRequestContext(
				new Request("https://example.test/requests/req-1", {
					headers: { authorization: "Bearer invalid-token" },
				}),
				{
					resolveTrustedRequestIdentity: () => {
						trustedCalls += 1;
						return {
							actorId: "subject-1",
							principalKind: "subject",
							role: "subject",
							tenantId: "tenant-default",
						};
					},
				}
			)
		).rejects.toMatchObject({
			message: "Bearer token is invalid or not configured for DSAR access.",
		});
		expect(trustedCalls).toBe(0);
	});

	it("rejects trusted identities that omit tenant scope", async () => {
		await expect(
			resolveRequestContext(
				new Request("https://example.test/requests/req-1"),
				{
					resolveTrustedRequestIdentity: () => ({
						actorId: "subject-1",
						role: "subject",
					}),
				}
			)
		).rejects.toMatchObject({
			message: expect.stringContaining("missing tenantId"),
		});
	});
});

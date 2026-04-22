import {
	activateCustomPolicyPack,
	deactivateCustomPolicyPack,
	PolicyPacksLive,
	PolicyRegistry,
	PolicyUpgrade,
	registerCustomPolicyPack,
} from "@dsar/policy-packs";
import * as Effect from "effect/Effect";

import { makeRequestId } from "../middleware/auth-context";
import { backendErrorCatalogByCode } from "../types/error-codes";
import { ForbiddenRequestError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "./authz";
import { accepted, decodeJsonBody, ok, parseParam } from "./helpers";
import { proposePolicyUpgrade } from "./policies/handlers";
import {
	PolicyActivationBodySchema,
	PolicyDeactivationBodySchema,
	PolicyRegistrationBodySchema,
	PolicyUpgradeBodySchema,
} from "./schemas";
import type { RouteDefinition } from "./types";

const toPolicyScopeForbiddenError = (message: string): ForbiddenRequestError =>
	new ForbiddenRequestError({
		message,
		reasonCode: backendErrorCatalogByCode.AUTH_REQUEST_ACCESS_FORBIDDEN.code,
	});

const requireRoleContext = (
	services: {
		readonly requestContext: {
			readonly actor?: {
				readonly id: string;
				readonly principalKind: "operator" | "service" | "subject";
				readonly role: string;
			};
			readonly tenantId?: string;
			readonly workspaceId?: string;
		};
	},
	requestedScope?: {
		readonly tenantId?: string;
		readonly workspaceId?: string;
	}
) =>
	Effect.gen(function* requireRoleContextEffect() {
		const actor = yield* requireRequestActor(services.requestContext);
		yield* requirePrincipalKinds({
			actor,
			allowedKinds: ["operator", "service"],
			message:
				"Policy operations are reserved for operator and service principals.",
		});
		const tenantId = yield* requireRequestTenantId(services.requestContext);
		const workspaceId = services.requestContext.workspaceId ?? undefined;
		if (requestedScope?.tenantId && requestedScope.tenantId !== tenantId) {
			return yield* Effect.fail(
				toPolicyScopeForbiddenError(
					"Policy operation tenant scope must match the authenticated tenant context."
				)
			);
		}
		if (
			workspaceId &&
			requestedScope?.workspaceId &&
			requestedScope.workspaceId !== workspaceId
		) {
			return yield* Effect.fail(
				toPolicyScopeForbiddenError(
					"Policy operation workspace scope must match the authenticated workspace context."
				)
			);
		}
		return {
			actor: actor.id,
			role: actor.role,
			tenantId,
			workspaceId: workspaceId ?? requestedScope?.workspaceId,
		};
	});

interface PolicyActorContext {
	readonly actor: string;
	readonly role: string;
	readonly tenantId: string;
	readonly workspaceId: string | undefined;
}

const requireProposalScope = (
	proposalId: string,
	actorContext: PolicyActorContext
) =>
	Effect.gen(function* requireProposalScopeEffect() {
		const upgrade = yield* Effect.service(PolicyUpgrade);
		const proposal = yield* upgrade.get(proposalId);
		if (proposal.tenantId !== actorContext.tenantId) {
			return yield* Effect.fail(
				toPolicyScopeForbiddenError(
					"Policy upgrade proposal tenant scope must match the authenticated tenant context."
				)
			);
		}
		if (
			actorContext.workspaceId &&
			proposal.workspaceId &&
			proposal.workspaceId !== actorContext.workspaceId
		) {
			return yield* Effect.fail(
				toPolicyScopeForbiddenError(
					"Policy upgrade proposal workspace scope must match the authenticated workspace context."
				)
			);
		}
		return upgrade;
	});

const withPolicyRouteAuthorization = (
	route: RouteDefinition
): RouteDefinition => ({
	...route,
	handler: (input) =>
		Effect.gen(function* authorizePolicyRouteHandler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			yield* requireRoleContext(services);
			return yield* route.handler(input);
		}),
});

/**
 * Route definitions for the `/policies` namespace: listing available
 * policy packs, proposing and approving version upgrades, and
 * registering, activating, or deactivating custom policy packs.
 */
const rawPolicyRoutes: readonly RouteDefinition[] = [
	{
		handler: () =>
			Effect.gen(function* handler() {
				const registry = yield* Effect.service(PolicyRegistry);
				const jurisdictions = [
					"uk",
					"eu",
					"us",
					"us-ca",
					"us-va",
					"us-co",
				] as const;
				const packs = yield* Effect.all(
					jurisdictions.map((j) => registry.listByJurisdiction(j)),
					{ concurrency: "unbounded" }
				);
				const catalog = jurisdictions.flatMap((jurisdiction, index) =>
					(packs[index] ?? []).map((record) => ({
						jurisdiction,
						name: record.name,
						packId: record.pack.packId,
						publishedAt: record.publishedAt,
						version: record.version,
					}))
				);
				return ok(catalog);
			}).pipe(Effect.provide(PolicyPacksLive)),
		method: "GET",
		path: "/policies",
		protected: true,
		summary: "List policy surfaces",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* handler() {
				const body = yield* decodeJsonBody(request, PolicyUpgradeBodySchema);
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services, {
					tenantId: body.tenantId,
					workspaceId: body.workspaceId,
				});
				const proposalId = makeRequestId();
				const result = yield* proposePolicyUpgrade({
					actor: actorContext.actor,
					fromVersion: body.fromVersion,
					now: new Date().toISOString(),
					proposalId,
					tenantId: actorContext.tenantId,
					toVersion: body.toVersion,
					workspaceId: actorContext.workspaceId,
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted(result);
			}),
		method: "POST",
		path: "/policies/upgrades/propose",
		protected: true,
		summary: "Propose policy upgrade",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* handler() {
				const body = yield* decodeJsonBody(
					request,
					PolicyRegistrationBodySchema
				);
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services);
				const publishedAt = body.publishedAt ?? new Date().toISOString();
				const record = yield* registerCustomPolicyPack({
					actor: actorContext.actor,
					jurisdiction: body.jurisdiction,
					metadata: body.metadata,
					name: body.name,
					pack: body.pack as Parameters<
						typeof registerCustomPolicyPack
					>[0]["pack"],
					publishedAt,
					role: actorContext.role,
					version: body.version,
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted({
					jurisdiction: record.jurisdiction,
					name: record.name,
					status: "registered",
					version: record.version,
				});
			}),
		method: "POST",
		path: "/policies/custom/register",
		protected: true,
		summary: "Register custom policy pack",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* handler() {
				const body = yield* decodeJsonBody(request, PolicyActivationBodySchema);
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services, {
					tenantId: body.tenantId,
					workspaceId: body.workspaceId,
				});
				const pin = yield* activateCustomPolicyPack({
					actor: actorContext.actor,
					jurisdiction: body.jurisdiction,
					now: new Date().toISOString(),
					role: actorContext.role,
					scope: {
						tenantId: actorContext.tenantId,
						workspaceId: actorContext.workspaceId,
					},
					version: body.version,
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted({
					jurisdiction: body.jurisdiction,
					status: "activated",
					tenantId: pin.tenantId,
					version: pin.policyVersion,
					workspaceId: pin.workspaceId,
				});
			}),
		method: "POST",
		path: "/policies/custom/activate",
		protected: true,
		summary: "Activate custom policy pack for scope",
	},
	{
		handler: ({ request }) =>
			Effect.gen(function* handler() {
				const body = yield* decodeJsonBody(
					request,
					PolicyDeactivationBodySchema
				);
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services, {
					tenantId: body.tenantId,
					workspaceId: body.workspaceId,
				});
				yield* deactivateCustomPolicyPack({
					actor: actorContext.actor,
					now: new Date().toISOString(),
					role: actorContext.role,
					scope: {
						tenantId: actorContext.tenantId,
						workspaceId: actorContext.workspaceId,
					},
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted({
					status: "deactivated",
					tenantId: actorContext.tenantId,
					workspaceId: actorContext.workspaceId,
				});
			}),
		method: "POST",
		path: "/policies/custom/deactivate",
		protected: true,
		summary: "Deactivate scoped custom policy assignment",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const proposalId = yield* parseParam(params, "proposalId");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services);
				const result = yield* Effect.gen(function* approveScopedUpgrade() {
					const upgrade = yield* requireProposalScope(proposalId, actorContext);
					return yield* upgrade.approve({
						approverId: actorContext.actor,
						approverRole: actorContext.role,
						now: new Date().toISOString(),
						proposalId,
					});
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted(result);
			}),
		method: "POST",
		path: "/policies/upgrades/:proposalId/approve",
		protected: true,
		summary: "Approve policy upgrade",
	},
	{
		handler: ({ params }) =>
			Effect.gen(function* handler() {
				const proposalId = yield* parseParam(params, "proposalId");
				const services = yield* Effect.service(RuntimeServicesTag);
				const actorContext = yield* requireRoleContext(services);
				const result = yield* Effect.gen(function* applyScopedUpgrade() {
					const upgrade = yield* requireProposalScope(proposalId, actorContext);
					return yield* upgrade.apply({
						actor: actorContext.actor,
						now: new Date().toISOString(),
						proposalId,
					});
				}).pipe(Effect.provide(PolicyPacksLive));
				return accepted(result);
			}),
		method: "POST",
		path: "/policies/upgrades/:proposalId/apply",
		protected: true,
		summary: "Apply policy upgrade",
	},
];

/**
 * Route definitions for the `/policies` namespace with operator/service
 * authorization enforced before handler execution.
 */
export const policyRoutes: readonly RouteDefinition[] = rawPolicyRoutes.map(
	withPolicyRouteAuthorization
);

import { currentPersistenceMigrationStatus } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { RuntimeServicesTag } from "../types/runtime";
import { requirePrincipalKinds, requireRequestActor } from "./authz";
import { ok } from "./helpers";
import type { RouteDefinition } from "./types";

const OPERATOR_MESSAGE =
	"Runtime diagnostics are reserved for operator or service principals.";

const messageFromError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const toDetails = (
	version: string | undefined,
	diagnosticsDetails: Readonly<Record<string, unknown>> | undefined,
	healthDetails: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined => {
	const details: Record<string, unknown> = {};
	if (version) {
		details.version = version;
	}
	if (diagnosticsDetails) {
		details.diagnostics = diagnosticsDetails;
	}
	if (healthDetails) {
		details.health = healthDetails;
	}
	return Object.keys(details).length > 0 ? details : undefined;
};

/**
 * Health-check route definitions exposing runtime liveness and operator diagnostics.
 */
export const statusRoutes: readonly RouteDefinition[] = [
	{
		handler: () =>
			Effect.succeed(
				ok({
					service: "@dsar/backend",
					status: "ok",
				})
			),
		method: "GET",
		path: "/status",
		protected: false,
		summary: "Runtime health status",
	},
	{
		handler: () =>
			Effect.gen(function* diagnosticsHandler() {
				const services = yield* Effect.service(RuntimeServicesTag);
				const actor = yield* requireRequestActor(services.requestContext);
				yield* requirePrincipalKinds({
					actor,
					allowedKinds: ["operator", "service"],
					message: OPERATOR_MESSAGE,
				});
				const migrationStatusEffect =
					services.repos.persistence.migrationStatus?.() ??
					Effect.succeed(currentPersistenceMigrationStatus());

				const migrationCheck = yield* migrationStatusEffect.pipe(
					Effect.map((status) => ({
						migrations: status,
						persistence: { reachable: true },
					})),
					Effect.catch((error) =>
						Effect.succeed({
							migrations: {
								applied: [],
								current: false,
								expected: [],
							},
							persistence: {
								error: messageFromError(error),
								reachable: false,
							},
						})
					)
				);
				const adapters: {
					readonly capability: string;
					readonly details?: Readonly<Record<string, unknown>>;
					readonly key: string;
					readonly status: string;
				}[] = [];
				for (const adapter of services.adapterRegistry.list()) {
					const health = yield* adapter.healthCheck().pipe(
						Effect.catch((error) =>
							Effect.succeed({
								details: { error: messageFromError(error) },
								ok: false,
								status: "down" as const,
							})
						)
					);
					const diagnostics = yield* adapter.diagnostics().pipe(
						Effect.catch((error) =>
							Effect.succeed({
								capability: adapter.capability,
								details: { error: messageFromError(error) },
								key: adapter.key,
								version: undefined,
							})
						)
					);
					adapters.push({
						capability: diagnostics.capability,
						details: toDetails(
							diagnostics.version,
							diagnostics.details,
							health.details
						),
						key: diagnostics.key,
						status: health.status,
					});
				}
				return ok({
					adapters,
					migrations: migrationCheck.migrations,
					persistence: migrationCheck.persistence,
				});
			}),
		method: "GET",
		path: "/status/diagnostics",
		protected: true,
		summary: "Runtime diagnostics",
	},
];

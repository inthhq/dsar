import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as OpenApi from "effect/unstable/httpapi/OpenApi";

import { auditGroup } from "./groups/audit";
import { initGroup } from "./groups/init";
import { policiesGroup } from "./groups/policies";
import { requestsGroup } from "./groups/requests";
import { statusGroup } from "./groups/status";
import { subjectsGroup } from "./groups/subjects";
import { webhooksGroup } from "./groups/webhooks";

export { HttpApiSchemaCoverage } from "./request-schemas";

/**
 * Builds the DSAR backend HTTP API description and OpenAPI annotations.
 *
 * @param basePath - Base path used when generating server URLs in the spec.
 * @returns The composed DSAR backend {@link HttpApi.HttpApi}.
 */
export const makeDsarHttpApi = (basePath: string) =>
	HttpApi.make("dsar-backend")
		.add(initGroup)
		.add(statusGroup)
		.add(webhooksGroup)
		.add(subjectsGroup)
		.add(auditGroup)
		.add(policiesGroup)
		.add(requestsGroup)
		.annotateMerge(
			OpenApi.annotations({
				description:
					"Developer-first DSAR backend contract surface for runtime APIs.",
				servers: [
					{
						url: basePath === "/" ? "/" : basePath,
					},
				],
				title: "DSAR Backend API",
				transform: (spec) => ({
					...spec,
					components: {
						...spec.components,
						securitySchemes: {
							...spec.components?.securitySchemes,
							BearerAuth: {
								bearerFormat: "JWT",
								scheme: "bearer",
								type: "http",
							},
						},
					},
				}),
				version: "0.0.0",
			})
		);

/** Materialized DSAR backend HTTP API type. */
export type DsarHttpApi = ReturnType<typeof makeDsarHttpApi>;

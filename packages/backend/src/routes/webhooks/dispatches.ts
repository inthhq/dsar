import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { requireRequestTenantId } from "../authz";
import type { RouteDefinition } from "../types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export const listWebhooksDispatchesRoute: RouteDefinition = {
	kind: "http",
	method: "GET",
	path: "/webhooks/dispatches",
	format: "json",
	handler: (request) =>
		Effect.gen(function* listWebhooksDispatches() {
			const url = new URL(request.url);
			const statusParam = url.searchParams.get("status") ?? "dead";
			const limitParam = url.searchParams.get("limit");
			const limit = Math.min(
				Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10)),
				MAX_LIMIT
			);

			const tenantId = yield* requireRequestTenantId;
			const services = yield* Effect.service(
				import("../../types/runtime").then((m) => m.RuntimeServicesTag)
			);

			const dispatches = yield* services.repos.persistence.notificationDeliveryAttempts
				.listByStatus(statusParam as "dead", limit)
				.pipe(withTenant(tenantId));

			return {
				status: 200,
				body: {
					dispatches: dispatches.map((d) => ({
						attempt: d.attempt,
						channel: d.channel,
						createdAt: d.createdAt,
						destination: d.destination,
						error: d.error,
						id: d.id,
						notificationEventId: d.notificationEventId,
						requestId: d.requestId,
						responseCode: d.responseCode,
						status: d.status,
					})),
				},
			};
		}),
};
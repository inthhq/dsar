import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { requireRequestTenantId } from "../authz";
import type { RouteDefinition } from "../types";
import { RuntimeServicesTag } from "../../types/runtime";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const VALID_STATUSES = ["dead", "failed", "delivered", "pending", "skipped"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

const parseStatusParam = (param: string | null): ValidStatus => {
	const normalized = (param ?? "dead").toLowerCase();
	return VALID_STATUSES.includes(normalized as ValidStatus)
		? (normalized as ValidStatus)
		: "dead";
};

const parseLimitParam = (param: string | null): number => {
	const parsed = parseInt(param ?? String(DEFAULT_LIMIT), 10);
	if (Number.isNaN(parsed)) {
		return DEFAULT_LIMIT;
	}
	return Math.min(Math.max(1, parsed), MAX_LIMIT);
};

export const listWebhooksDispatchesRoute: RouteDefinition = {
	kind: "http",
	method: "GET",
	path: "/webhooks/dispatches",
	format: "json",
	handler: (request) =>
		Effect.gen(function* listWebhooksDispatches() {
			const url = new URL(request.url);
			const status = parseStatusParam(url.searchParams.get("status"));
			const limit = parseLimitParam(url.searchParams.get("limit"));

			const tenantId = yield* requireRequestTenantId();
			const services = yield* Effect.service(RuntimeServicesTag);

			const dispatches = yield* services.repos.persistence.notificationDeliveryAttempts
				.listByStatus(status, limit)
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
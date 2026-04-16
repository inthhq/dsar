import { initRoutes } from "./init";
import { policyRoutes } from "./policies";
import { requestRoutes } from "./requests";
import { statusRoutes } from "./status";
import { subjectRoutes } from "./subjects";
import type { RouteDefinition } from "./types";
import { webhookRoutes } from "./webhooks";

/**
 * Aggregate route table combining all backend endpoint groups (init,
 * webhooks, requests, subjects, policies, status) into a single
 * ordered array matched by the request router.
 */
export const coreRoutes: readonly RouteDefinition[] = [
	...initRoutes,
	...webhookRoutes,
	...requestRoutes,
	...subjectRoutes,
	...policyRoutes,
	...statusRoutes,
];

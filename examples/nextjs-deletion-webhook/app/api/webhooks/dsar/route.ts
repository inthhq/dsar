import { createRoutePostHandler } from "@/lib/receiver";

/** Keep the JSON file store off the Edge runtime. */
export const runtime = "nodejs";

/**
 * Verified DSAR webhook endpoint. Deletes a demo user only on
 * `request_fulfilled`.
 */
export const POST = (request: Request): Promise<Response> =>
	createRoutePostHandler()(request);

import { createWebhookReceiver } from "@dsar/node-sdk/webhooks";
import { nextWebhookHandler } from "@dsar/node-sdk/webhooks/next";

import { deleteDemoUserForRequest } from "../../../../lib/db.ts";

const makePostHandler = () => {
	const signingSecret = process.env.DSAR_WEBHOOK_SECRET?.trim();
	if (!signingSecret) {
		throw new Error("DSAR_WEBHOOK_SECRET is required.");
	}

	const receiver = createWebhookReceiver({ signingSecret }).on(
		"request_captured",
		(event) => {
			deleteDemoUserForRequest({
				eventId: event.eventId,
				eventType: event.eventType,
				idempotencyKey: event.idempotencyKey,
				locale: event.locale,
				policyVersion: event.policyVersion,
				requestId: event.requestId,
			});
		}
	);
	return nextWebhookHandler(receiver);
};

let postHandler: ReturnType<typeof makePostHandler> | undefined;

/**
 * Next.js App Router route handler for verified DSAR deletion webhooks.
 */
export const POST = (request: Request): Promise<Response> => {
	postHandler ??= makePostHandler();
	return postHandler(request);
};

/** Keep the SQLite-backed example on the Node.js runtime. */
export const runtime = "nodejs";

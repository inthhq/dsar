import { createWebhookReceiver } from "@dsar/node-sdk/webhooks";
import { nextWebhookHandler } from "@dsar/node-sdk/webhooks/next";

import { getDemoStore } from "./store";
import type { DemoStore } from "./store";

/**
 * Builds a receiver that ACKs capture events and deletes only on fulfilment.
 */
export const createDeletionWebhookReceiver = (options: {
	readonly signingSecret: string;
	readonly store: DemoStore;
}) =>
	createWebhookReceiver({ signingSecret: options.signingSecret })
		.on("request_captured", (event) => {
			options.store.ignoreUntilFulfilment(event);
		})
		.on("request_fulfilled", (event) => {
			options.store.deleteOnFulfilment(event);
		});

/**
 * Next.js App Router POST handler backed by {@link createDeletionWebhookReceiver}.
 */
export const createDeletionWebhookPostHandler = (options: {
	readonly signingSecret: string;
	readonly store: DemoStore;
}) => nextWebhookHandler(createDeletionWebhookReceiver(options));

/**
 * Route-handler factory that reads `DSAR_WEBHOOK_SECRET` on each request.
 */
export const createRoutePostHandler = () => {
	const signingSecret = process.env.DSAR_WEBHOOK_SECRET?.trim();
	if (!signingSecret) {
		throw new Error("DSAR_WEBHOOK_SECRET is required.");
	}
	return createDeletionWebhookPostHandler({
		signingSecret,
		store: getDemoStore(),
	});
};

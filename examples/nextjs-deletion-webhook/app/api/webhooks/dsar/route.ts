import { createWebhookReceiver } from "@dsar/node-sdk/webhooks";
import { nextWebhookHandler } from "@dsar/node-sdk/webhooks/next";

import { deleteDemoUserByEmail } from "../../../../lib/db";

const signingSecret =
	process.env.DSAR_WEBHOOK_SECRET ?? "whsec_demo_secret_key_12345";

const receiver = createWebhookReceiver({ signingSecret });

receiver.on("request_captured", (event) => {
	const email =
		typeof event.payload.email === "string"
			? event.payload.email
			: undefined;
	if (email) {
		const deleted = deleteDemoUserByEmail(email);
		console.log(
			`[DSAR Webhook] Processed request_captured event (record_deleted: ${deleted})`
		);
	}
});

receiver.on("request_fulfilled", (event) => {
	const email =
		typeof event.payload.email === "string"
			? event.payload.email
			: undefined;
	if (email) {
		const deleted = deleteDemoUserByEmail(email);
		console.log(
			`[DSAR Webhook] Processed request_fulfilled event (record_deleted: ${deleted})`
		);
	}
});

/**
 * Next.js App Router route handler for DSAR webhooks.
 *
 * Verifies HMAC signature, extracts subject payload, and executes data erasure.
 */
export const POST = nextWebhookHandler(receiver);

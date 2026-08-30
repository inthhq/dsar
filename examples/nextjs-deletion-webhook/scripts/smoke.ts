import "dotenv/config";
import { runSmokeTest } from "../lib/smoke.ts";

const signingSecret = process.env.DSAR_WEBHOOK_SECRET?.trim();
if (!signingSecret) {
	throw new Error("Set DSAR_WEBHOOK_SECRET before running the smoke test.");
}

runSmokeTest(signingSecret)
	.then(({ auditRecordCount, eventId, requestId }) => {
		console.info(
			`Deleted the user linked to ${requestId}; audit event ${eventId} persisted (${auditRecordCount} record).`
		);
	})
	.catch((error: unknown) => {
		console.error("Deletion webhook smoke test failed.", error);
		process.exitCode = 1;
	});

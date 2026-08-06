import { POST } from "../app/api/webhooks/dsar/route";
import { findDemoUserByEmail, seedDemoUsers } from "../lib/db";

const SIGNING_SECRET =
	process.env.DSAR_WEBHOOK_SECRET ?? "whsec_demo_secret_key_12345";

const textEncoder = new TextEncoder();

const computeHmacHex = async (
	body: string,
	secret: string
): Promise<string> => {
	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		textEncoder.encode(body)
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
};

const runSmokeTest = async (): Promise<void> => {
	console.log("--> Initializing demo database with seed users...");
	seedDemoUsers();

	const targetEmail = "alex.subject@example.com";
	const initialUser = findDemoUserByEmail(targetEmail);
	if (!initialUser) {
		throw new Error(`Expected seed user ${targetEmail} to exist before deletion.`);
	}
	console.log(`--> Found active demo user record id=${initialUser.id}`);

	const payload = {
		correlationId: "corr_smoke_123",
		eventId: "evt_smoke_456",
		eventType: "request_captured",
		idempotencyKey: "idem_smoke_789",
		locale: "en-US",
		payload: { email: targetEmail },
		policyVersion: "2026.1",
		requestId: "req_smoke_001",
	};

	const rawBody = JSON.stringify(payload);
	const signature = await computeHmacHex(rawBody, SIGNING_SECRET);

	console.log("--> Dispatching signed DSAR webhook payload to Next.js POST route...");
	const request = new Request("http://localhost:3000/api/webhooks/dsar", {
		body: rawBody,
		headers: {
			"content-type": "application/json",
			"x-dsar-signature": signature,
		},
		method: "POST",
	});

	const response = await POST(request);
	console.log(`--> Response HTTP status: ${response.status}`);
	if (response.status !== 200) {
		throw new Error(`Expected HTTP 200 but received ${response.status}`);
	}

	const responseBody = (await response.json()) as { ok: boolean };
	if (!responseBody.ok) {
		throw new Error("Expected response body { ok: true }");
	}

	const remainingUser = findDemoUserByEmail(targetEmail);
	if (remainingUser !== undefined) {
		throw new Error(`User ${targetEmail} was not deleted from database.`);
	}

	console.log("✔ Success: Demo user was deleted and webhook ACKed with { ok: true }");
};

runSmokeTest().catch((error) => {
	console.error("❌ Smoke test failed:", error);
	process.exit(1);
});

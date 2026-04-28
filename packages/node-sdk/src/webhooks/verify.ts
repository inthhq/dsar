/**
 * Input required to verify a DSAR webhook request signature.
 */
export interface VerifyWebhookInput {
	/** Raw request body, exactly as received. */
	readonly payload: string;
	/** Value of the `x-dsar-signature` header. */
	readonly signature: string;
	/** Shared secret configured on the DSAR webhook endpoint. */
	readonly signingSecret: string;
}

/**
 * Machine-readable webhook verification failure code.
 */
export type WebhookVerificationErrorCode =
	| "missing_signature"
	| "invalid_signature";

/**
 * Error thrown when DSAR webhook signature verification fails.
 */
export class WebhookVerificationError extends Error {
	/** Stable verification error code for caller branching. */
	readonly code: WebhookVerificationErrorCode;

	constructor(code: WebhookVerificationErrorCode) {
		super(
			code === "missing_signature"
				? "Webhook signature is required."
				: "Webhook signature verification failed."
		);
		this.name = "WebhookVerificationError";
		this.code = code;
	}
}

const textEncoder = new TextEncoder();
const emptyBytes = new Uint8Array(0);
const hexBytePattern = /^[0-9a-f]{2}$/i;

const bytesToHex = (bytes: ArrayBuffer): string =>
	[...new Uint8Array(bytes)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const hexToBytes = (hex: string): Uint8Array | undefined => {
	if (hex.length % 2 !== 0) {
		return undefined;
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < hex.length; index += 2) {
		const pair = hex.slice(index, index + 2);
		if (!hexBytePattern.test(pair)) {
			return undefined;
		}
		bytes[index / 2] = Number.parseInt(pair, 16);
	}
	return bytes;
};

const constantTimeEqualHex = (expected: string, provided: string): boolean => {
	const expectedBytes = hexToBytes(expected) ?? emptyBytes;
	const providedBytes = hexToBytes(provided) ?? emptyBytes;
	const maxLength = Math.max(
		expectedBytes.byteLength,
		providedBytes.byteLength
	);
	let difference = Math.abs(
		expectedBytes.byteLength - providedBytes.byteLength
	);
	for (let index = 0; index < maxLength; index += 1) {
		difference += Math.abs(
			(expectedBytes[index] ?? 0) - (providedBytes[index] ?? 0)
		);
	}
	return difference === 0;
};

/**
 * Verifies an outbound DSAR webhook HMAC signature against the raw request body.
 *
 * @param input - Raw payload, received signature, and shared signing secret.
 */
export const verifyWebhook = async (
	input: VerifyWebhookInput
): Promise<void> => {
	if (input.signingSecret.trim().length === 0) {
		throw new Error("Webhook signing secret is required.");
	}

	const signature = input.signature.trim().toLowerCase();
	if (signature.length === 0) {
		throw new WebhookVerificationError("missing_signature");
	}

	const key = await crypto.subtle.importKey(
		"raw",
		textEncoder.encode(input.signingSecret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const expectedSignature = bytesToHex(
		await crypto.subtle.sign("HMAC", key, textEncoder.encode(input.payload))
	);

	if (!constantTimeEqualHex(expectedSignature, signature)) {
		throw new WebhookVerificationError("invalid_signature");
	}
};

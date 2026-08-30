import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

import * as Effect from "effect/Effect";

import type { PersistenceError } from "../../types/errors";
import {
	PersistenceInvalidRecordError,
	UnsupportedPersistenceOperationError,
} from "../../types/errors";

const AES_256_GCM = "aes-256-gcm";
const AES_256_KEY_BYTES = 32;
const GCM_NONCE_BYTES = 12;

/**
 * Key material used to encrypt persisted webhook signing secrets.
 */
export interface WebhookSigningSecretEncryptionOptions {
	/** Symmetric key material or passphrase used as the envelope master key. */
	readonly key: string | Uint8Array;
	/** Stable key identifier stored with ciphertext for future key rotation. */
	readonly keyId: string;
}

/**
 * Tenant-scoped identity fields authenticated into webhook secret ciphertext.
 */
export interface WebhookSigningSecretEncryptionContext {
	/** Webhook endpoint that owns the signing key. */
	readonly endpointId: string;
	/** Signing-key record identifier. */
	readonly signingKeyId: string;
	/** Tenant that owns the endpoint and signing key. */
	readonly tenantId: string;
}

/**
 * SQL insert payload containing envelope-encrypted webhook signing secret fields.
 */
export interface EncryptedWebhookSigningSecret {
	/** AES-GCM ciphertext for the plaintext signing secret. */
	readonly secret_ciphertext: string;
	/** AES-GCM nonce used to encrypt the generated data key. */
	readonly secret_data_key_nonce: string;
	/** AES-GCM authentication tag for the encrypted data key. */
	readonly secret_data_key_tag: string;
	/** Generated per-row data key encrypted by the configured master key. */
	readonly secret_encrypted_data_key: string;
	/** Identifier of the master key used to encrypt the row data key. */
	readonly secret_key_id: string;
	/** AES-GCM nonce used to encrypt the signing secret. */
	readonly secret_nonce: string;
	/** AES-GCM authentication tag for the encrypted signing secret. */
	readonly secret_tag: string;
}

/**
 * SQL row projection containing encrypted webhook signing secret fields.
 */
export interface WebhookSigningSecretCiphertextRow {
	/** AES-GCM ciphertext for the plaintext signing secret. */
	readonly secret_ciphertext: string;
	/** AES-GCM nonce used to encrypt the generated data key. */
	readonly secret_data_key_nonce: string;
	/** AES-GCM authentication tag for the encrypted data key. */
	readonly secret_data_key_tag: string;
	/** Generated per-row data key encrypted by the configured master key. */
	readonly secret_encrypted_data_key: string;
	/** Identifier of the master key used to encrypt the row data key. */
	readonly secret_key_id: string;
	/** AES-GCM nonce used to encrypt the signing secret. */
	readonly secret_nonce: string;
	/** AES-GCM authentication tag for the encrypted signing secret. */
	readonly secret_tag: string;
}

/**
 * Encrypts and decrypts webhook signing secrets at the persistence boundary.
 */
export interface WebhookSigningSecretCipher {
	/** Decrypts an encrypted SQL row back to the plaintext signing secret. */
	readonly open: (
		row: WebhookSigningSecretCiphertextRow,
		context: WebhookSigningSecretEncryptionContext
	) => Effect.Effect<string, PersistenceError>;
	/** Encrypts a plaintext signing secret for insertion into SQL storage. */
	readonly seal: (
		secret: string,
		context: WebhookSigningSecretEncryptionContext
	) => Effect.Effect<EncryptedWebhookSigningSecret, PersistenceError>;
}

interface CiphertextParts {
	readonly ciphertext: Buffer;
	readonly nonce: Buffer;
	readonly tag: Buffer;
}

const asBase64 = (value: Buffer): string => value.toString("base64");

const fromBase64 = (value: string): Buffer => Buffer.from(value, "base64");

// normalizeMasterKey uses raw AES_256_KEY_BYTES keys directly; any other
// length is SHA-256 hashed to produce a 32-byte AES key.
const normalizeMasterKey = (key: string | Uint8Array): Buffer => {
	const keyBytes =
		typeof key === "string" ? Buffer.from(key, "utf8") : Buffer.from(key);
	if (keyBytes.length === AES_256_KEY_BYTES) {
		return keyBytes;
	}
	return createHash("sha256").update(keyBytes).digest();
};

const authenticatedData = (
	context: WebhookSigningSecretEncryptionContext,
	keyId: string
): Buffer =>
	Buffer.from(
		[context.tenantId, context.endpointId, context.signingKeyId, keyId].join(
			"\0"
		),
		"utf8"
	);

const encryptBytes = (
	key: Buffer,
	plaintext: Buffer,
	aad: Buffer
): CiphertextParts => {
	const nonce = randomBytes(GCM_NONCE_BYTES);
	const cipher = createCipheriv(AES_256_GCM, key, nonce);
	cipher.setAAD(aad);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return {
		ciphertext,
		nonce,
		tag: cipher.getAuthTag(),
	};
};

const decryptBytes = (
	key: Buffer,
	parts: CiphertextParts,
	aad: Buffer
): Buffer => {
	const decipher = createDecipheriv(AES_256_GCM, key, parts.nonce);
	decipher.setAAD(aad);
	decipher.setAuthTag(parts.tag);
	return Buffer.concat([decipher.update(parts.ciphertext), decipher.final()]);
};

const encryptionFailure = (
	field: string,
	value: string
): PersistenceInvalidRecordError =>
	new PersistenceInvalidRecordError({
		entity: "webhook_signing_keys",
		field,
		value,
	});

/**
 * Creates an envelope-encryption helper for webhook signing secrets.
 *
 * @param options - Optional encryption key material; missing options produce a
 *   cipher that fails closed when webhook secrets are read or written.
 * @returns Cipher helper used by the SQL persistence repository.
 */
export const makeWebhookSigningSecretCipher = (
	options?: WebhookSigningSecretEncryptionOptions
): WebhookSigningSecretCipher => {
	if (!options) {
		const unsupported = new UnsupportedPersistenceOperationError({
			operation: "webhook signing secret encryption",
			reason:
				"Webhook signing secret encryption key material was not configured.",
		});
		return {
			open: () => Effect.fail(unsupported),
			seal: () => Effect.fail(unsupported),
		};
	}

	const masterKey = normalizeMasterKey(options.key);

	return {
		open: (row, context) =>
			Effect.try({
				catch: (error) =>
					encryptionFailure(
						"secret_ciphertext",
						error instanceof Error ? error.message : String(error)
					),
				try: () => {
					const aad = authenticatedData(context, row.secret_key_id);
					const dataKey = decryptBytes(
						masterKey,
						{
							ciphertext: fromBase64(row.secret_encrypted_data_key),
							nonce: fromBase64(row.secret_data_key_nonce),
							tag: fromBase64(row.secret_data_key_tag),
						},
						aad
					);
					return decryptBytes(
						dataKey,
						{
							ciphertext: fromBase64(row.secret_ciphertext),
							nonce: fromBase64(row.secret_nonce),
							tag: fromBase64(row.secret_tag),
						},
						aad
					).toString("utf8");
				},
			}),
		seal: (secret, context) =>
			Effect.sync(() => {
				const aad = authenticatedData(context, options.keyId);
				const dataKey = randomBytes(AES_256_KEY_BYTES);
				const secretParts = encryptBytes(
					dataKey,
					Buffer.from(secret, "utf8"),
					aad
				);
				const dataKeyParts = encryptBytes(masterKey, dataKey, aad);
				return {
					secret_ciphertext: asBase64(secretParts.ciphertext),
					secret_data_key_nonce: asBase64(dataKeyParts.nonce),
					secret_data_key_tag: asBase64(dataKeyParts.tag),
					secret_encrypted_data_key: asBase64(dataKeyParts.ciphertext),
					secret_key_id: options.keyId,
					secret_nonce: asBase64(secretParts.nonce),
					secret_tag: asBase64(secretParts.tag),
				};
			}),
	};
};

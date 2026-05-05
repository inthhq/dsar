import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { appendAuditEvent } from "../../audit/service";
import { makeRequestId } from "../../middleware/auth-context";
import { RequestValidationError } from "../../types/errors";
import { RuntimeServicesTag } from "../../types/runtime";
import {
	requirePrincipalKinds,
	requireRequestActor,
	requireRequestTenantId,
} from "../authz";
import { ok } from "../helpers";
import { WebhookRotateKeyBodySchema } from "../schemas";
import type { RouteDefinition } from "../types";

const DEFAULT_WEBHOOK_ENDPOINT_ID = "default";
const DEFAULT_GRACE_PERIOD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_DATE_MS = 8_640_000_000_000_000;
const SECRET_BYTES = 32;

const generateSigningSecret = (): string => {
	const bytes = new Uint8Array(SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const parseBody = (request: Request) =>
	Effect.tryPromise({
		catch: (error) =>
			new RequestValidationError({
				details: {
					cause: error instanceof Error ? error.message : String(error),
				},
				message: "Invalid webhook key rotation payload.",
				reasonCode: "REQUEST_BODY_INVALID_JSON",
			}),
		try: async () => {
			const text = await request.text();
			return text.trim().length === 0 ? {} : (JSON.parse(text) as unknown);
		},
	}).pipe(
		Effect.flatMap((body) =>
			Schema.decodeUnknownEffect(WebhookRotateKeyBodySchema)(body)
		),
		Effect.mapError((error) =>
			error instanceof RequestValidationError
				? error
				: new RequestValidationError({
						message: "Invalid webhook key rotation payload.",
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
		)
	);

const resolveGracePeriodDays = (value: number | undefined): number => {
	const days = value ?? DEFAULT_GRACE_PERIOD_DAYS;
	const maxGracePeriodDays = Math.floor(
		(MAX_DATE_MS - Date.now()) / MS_PER_DAY
	);
	if (!Number.isSafeInteger(days) || days < 0 || days > maxGracePeriodDays) {
		throw new RequestValidationError({
			message:
				"gracePeriodDays must be a non-negative integer within the supported date range.",
			reasonCode: "REQUEST_VALIDATION_FAILED",
		});
	}
	return days;
};

const ensureConfiguredEndpoint = (endpointId: string) =>
	Effect.gen(function* ensureConfiguredEndpointProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const { tenantId } = services.requestContext;
		const webhookConfig = services.config.notificationWebhook;
		const configuredEndpointId =
			webhookConfig?.endpointId ?? DEFAULT_WEBHOOK_ENDPOINT_ID;
		if (
			tenantId &&
			webhookConfig &&
			webhookConfig.url.length > 0 &&
			endpointId === configuredEndpointId
		) {
			yield* services.repos.persistence.webhookEndpoints
				.ensureConfigured({
					createdAt: new Date().toISOString(),
					id: endpointId,
					signingSecret: webhookConfig.signingSecret,
					url: webhookConfig.url,
				})
				.pipe(withTenant(tenantId));
		}
	});

const definedObject = (
	input: Readonly<
		Record<string, string | number | readonly string[] | undefined>
	>
) => {
	const output: Record<string, string | number | readonly string[]> = {};
	for (const [key, value] of Object.entries(input)) {
		if (value !== undefined) {
			output[key] = value;
		}
	}
	return output;
};

/** Route definition for rotating outbound webhook signing keys. */
export const rotateWebhookKeyRoute: RouteDefinition = {
	handler: ({ params, request }) =>
		Effect.gen(function* rotateWebhookSigningKeyHandler() {
			const services = yield* Effect.service(RuntimeServicesTag);
			const actor = yield* requireRequestActor(services.requestContext);
			yield* requirePrincipalKinds({
				actor,
				allowedKinds: ["operator", "service"],
				message:
					"Webhook signing key rotation is reserved for operator and service principals.",
			});
			const tenantId = yield* requireRequestTenantId(services.requestContext);
			const endpointId = params.id;
			if (!endpointId) {
				return yield* Effect.fail(
					new RequestValidationError({
						message: "Webhook endpoint id is required.",
						reasonCode: "REQUEST_VALIDATION_FAILED",
					})
				);
			}
			const body = yield* parseBody(request);
			const gracePeriodDays = yield* Effect.try({
				catch: (error) =>
					error instanceof RequestValidationError
						? error
						: new RequestValidationError({
								message: "Invalid grace period.",
								reasonCode: "REQUEST_VALIDATION_FAILED",
							}),
				try: () => resolveGracePeriodDays(body.gracePeriodDays),
			});
			yield* ensureConfiguredEndpoint(endpointId);

			const rotatedAtMs = Date.now();
			const rotatedAt = new Date(rotatedAtMs).toISOString();
			const graceExpiresAt = new Date(
				rotatedAtMs + gracePeriodDays * MS_PER_DAY
			).toISOString();
			const rotation = yield* services.repos.persistence.webhookEndpoints
				.rotateSigningKey({
					endpointId,
					graceExpiresAt,
					newKeyId: makeRequestId(),
					newSecret: generateSigningSecret(),
					rotatedAt,
				})
				.pipe(withTenant(tenantId));

			yield* appendAuditEvent({
				action: "webhook_signing_key_rotated",
				actor: actor.id,
				after: definedObject({
					activeKeyIds: rotation.activeKeys.map((key) => key.id),
					endpointId,
					primaryKeyId: rotation.newPrimary.id,
				}),
				before: definedObject({
					endpointId,
					primaryKeyId: rotation.previousPrimary?.id,
				}),
				object: `webhook_endpoint:${endpointId}`,
				reason: definedObject({
					gracePeriodDays,
					previousKeyExpiresAt: rotation.previousPrimary?.expiresAt,
				}),
				tenantId,
			});

			return ok({
				activeKeyIds: rotation.activeKeys.map((key) => key.id),
				endpointId,
				newPrimaryKeyId: rotation.newPrimary.id,
				newSigningSecret: rotation.newPrimary.secret,
				previousKeyExpiresAt: rotation.previousPrimary?.expiresAt,
				previousKeyId: rotation.previousPrimary?.id,
			});
		}),
	method: "POST",
	path: "/webhooks/endpoints/:id/rotate-key",
	protected: true,
	summary: "Rotate webhook endpoint signing key",
};

import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type {
	NotificationDispatchInput,
	NotificationDispatchResult,
} from "../../types/runtime";

const encodeBody = (payload: Readonly<Record<string, unknown>>): string =>
	JSON.stringify(payload);

const signPayload = (body: string, secret: string): Effect.Effect<string> =>
	Effect.tryPromise(async () => {
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ hash: "SHA-256", name: "HMAC" },
			false,
			["sign"]
		);
		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(body)
		);
		return [...new Uint8Array(signature)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}).pipe(
		Effect.tapError((cause) =>
			Effect.logWarning("HMAC signing failed, proceeding without signature", {
				cause,
			})
		),
		Effect.catch(() => Effect.succeed("hmac_unavailable"))
	);

const DEFAULT_WEBHOOK_TIMEOUT_MS = 30_000;

/**
 * Sends a signed webhook notification to the configured endpoint.
 *
 * @param input - Dispatch parameters.
 * @param input.url - Webhook endpoint URL.
 * @param input.signingSecret - HMAC secret used to sign the JSON payload
 *   (signature sent in the `x-dsar-signature` header).
 * @param input.timeoutMs - Per-attempt timeout in milliseconds; the request
 *   is aborted if the endpoint does not respond in time.
 * @param input.event - {@link NotificationDispatchInput} carrying the event
 *   type, payload, correlation IDs, and locale.
 * @returns An `Effect` yielding a {@link NotificationDispatchResult} with the
 *   delivery outcome (`delivered` or `failed`), plus optional HTTP status code
 *   and error details when delivery fails.
 */
export const dispatchWebhookNotification = (input: {
	readonly url: string;
	readonly signingSecret: string;
	readonly timeoutMs: number;
	readonly event: NotificationDispatchInput;
}): Effect.Effect<NotificationDispatchResult> =>
	Effect.gen(function* dispatchWebhookNotificationProgram() {
		const body = encodeBody({
			correlationId: input.event.correlationId,
			eventId: input.event.eventId,
			eventType: input.event.eventType,
			idempotencyKey: input.event.idempotencyKey,
			locale: input.event.locale,
			payload: input.event.payload,
			policyVersion: input.event.policyVersion,
			requestId: input.event.requestId,
		});
		const signature = yield* signPayload(body, input.signingSecret);
		const controller = new AbortController();
		const safeTimeout = Duration.millis(
			Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
				? Math.floor(input.timeoutMs)
				: DEFAULT_WEBHOOK_TIMEOUT_MS
		);
		const timer = setTimeout(
			() => controller.abort(),
			Duration.toMillis(safeTimeout)
		);

		const result = yield* Effect.tryPromise({
			catch: (cause) =>
				cause instanceof Error ? cause : new Error("Webhook delivery failed."),
			try: () =>
				fetch(input.url, {
					body,
					headers: {
						"content-type": "application/json",
						"x-dsar-correlation-id": input.event.correlationId,
						"x-dsar-event-id": input.event.eventId,
						"x-dsar-idempotency-key": input.event.idempotencyKey,
						"x-dsar-signature": signature,
					},
					method: "POST",
					signal: controller.signal,
				}),
		}).pipe(
			Effect.map(
				(response): NotificationDispatchResult =>
					response.ok
						? { responseCode: response.status, status: "delivered" }
						: {
								error: `Webhook delivery failed: HTTP ${response.status}`,
								responseCode: response.status,
								status: "failed",
							}
			),
			Effect.catch((error) =>
				Effect.succeed({
					error:
						error instanceof Error ? error.message : "Webhook delivery failed.",
					status: "failed",
				} as NotificationDispatchResult)
			),
			Effect.ensuring(Effect.sync(() => clearTimeout(timer)))
		);

		return result;
	});

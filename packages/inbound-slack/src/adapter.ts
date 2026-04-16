/* oxlint-disable complexity */
/* oxlint-disable max-statements */
import { createHash } from "node:crypto";

import type { InboundAdapterContract } from "@dsar/backend";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import {
	defaultSlackInboundConfig,
	parseSlackInboundAdapterConfig,
} from "./config";
import { normalizeSlackError, nowIso, SlackInvocationError } from "./errors";
import { toNormalizedPayload } from "./normalize";
import {
	defaultVerifySignature,
	isSlackUrlVerification,
	parseEnvelope,
	parseSlackRequest,
} from "./parse";
import type {
	SlackInboundAdapterConfig,
	SlackInboundAdapterDependencies,
} from "./types";

/**
 * Public inbound adapter contract alias for the Slack integration.
 */
export type SlackInboundAdapterContract = InboundAdapterContract;

/**
 * Creates a Slack inbound adapter that verifies webhook requests and normalizes
 * Slack events into DSAR request-capture payloads.
 *
 * @param config - Adapter configuration for verification, routing, and Chat SDK parsing.
 * @param dependencies - Optional overrides for time, signature verification, profile lookup, and parsing.
 * @returns A Slack-backed inbound adapter contract.
 */
export const makeSlackInboundAdapter = (
	config: SlackInboundAdapterConfig,
	dependencies: SlackInboundAdapterDependencies = {}
): SlackInboundAdapterContract => {
	const resolved = defaultSlackInboundConfig(config);
	const now = dependencies.now ?? nowIso;
	return {
		capability: "inbound",
		diagnostics: () =>
			Effect.succeed({
				capability: "inbound",
				details: {
					dedupeTtlMs: resolved.dedupeTtlMs,
					hasBotToken: Boolean(resolved.botToken),
					replayToleranceSeconds: resolved.replayToleranceSeconds,
					teamCount: Object.keys(resolved.teamRoutes).length,
				},
				key: "slack",
				version: "0.0.0",
			}),
		healthCheck: () =>
			Effect.succeed({
				details: {
					hasBotToken: Boolean(resolved.botToken),
				},
				ok: true,
				status: "healthy",
			}),
		init: () => Effect.void,
		key: "slack",
		receive: (input) =>
			Effect.tryPromise({
				catch: (error) => normalizeSlackError(error),
				try: async () => {
					const envelope = parseEnvelope(input.payload);
					const { signature } = envelope.headers;
					const { timestamp } = envelope.headers;
					if (!signature || !timestamp) {
						throw new SlackInvocationError({
							category: "validation",
							message:
								"Slack webhook requires x-slack-signature and x-slack-request-timestamp headers.",
						});
					}
					if (dependencies.verifySignature) {
						dependencies.verifySignature({
							headers: { signature, timestamp },
							payload: envelope.rawBody,
							replayToleranceSeconds: resolved.replayToleranceSeconds,
							signingSecret: resolved.signingSecret,
						});
					} else {
						defaultVerifySignature({
							headers: { signature, timestamp },
							now,
							payload: envelope.rawBody,
							replayToleranceSeconds: resolved.replayToleranceSeconds,
							signingSecret: resolved.signingSecret,
						});
					}
					const parsed = parseSlackRequest(envelope, now());
					if (isSlackUrlVerification(parsed)) {
						return {
							payload: {
								challenge: parsed.challenge,
								kind: "url_verification",
								provider: "slack",
							} as Readonly<Record<string, unknown>>,
							receivedAt: now(),
							sourceId: `slack:url_verification:${createHash("sha256").update(parsed.challenge).digest("hex")}`,
						};
					}
					const inboundEvent = parsed;
					const normalizedPayload = await toNormalizedPayload(
						inboundEvent,
						resolved,
						dependencies
					);
					return {
						payload: normalizedPayload as unknown as Readonly<
							Record<string, unknown>
						>,
						receivedAt: inboundEvent.receivedAt,
						sourceId: inboundEvent.eventId,
					};
				},
			}),
		validateConfig: (input) =>
			Effect.suspend(() => {
				const parsed = parseSlackInboundAdapterConfig(input);
				if (Exit.isFailure(parsed)) {
					return Effect.fail({
						category: "config",
						details: {
							parseError: Cause.pretty(parsed.cause),
						},
						message: "Invalid Slack inbound adapter configuration.",
						retriable: false,
					});
				}
				return Effect.void;
			}),
	} satisfies InboundAdapterContract;
};

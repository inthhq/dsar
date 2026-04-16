import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type { OutboundResendAdapterConfig } from "./types";

const PositiveNumber = Schema.Number.pipe(
	Schema.check(Schema.isGreaterThan(0))
);

/**
 * Schema validating the outbound Resend adapter configuration: requires
 * `apiKey` and `from`, with optional `replyTo`, `subjectPrefix`, and
 * `timeoutMs` (positive number).
 */
export const OutboundResendAdapterConfigSchema = Schema.Struct({
	apiKey: Schema.NonEmptyString,
	from: Schema.NonEmptyString,
	replyTo: Schema.optional(Schema.NonEmptyString),
	subjectPrefix: Schema.optional(Schema.NonEmptyString),
	timeoutMs: Schema.optional(PositiveNumber),
});

/**
 * Parses and validates an unknown value as an outbound Resend adapter
 * configuration.
 *
 * @param input - Raw configuration value to validate against
 *   {@link OutboundResendAdapterConfigSchema}.
 * @returns An `Exit` that succeeds with an
 *   {@link OutboundResendAdapterConfig} when validation passes, or fails with
 *   a `SchemaError` describing the first validation violation.
 */
export const parseOutboundResendAdapterConfig = (
	input: unknown
): Exit.Exit<OutboundResendAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(OutboundResendAdapterConfigSchema)(input);

/**
 * Applies defaults to a validated adapter configuration, filling in omitted
 * optional fields.
 *
 * @param config - Already-validated adapter configuration.
 * @returns The same configuration with `timeoutMs` guaranteed to be present
 *   (defaults to `5000`).
 */
export const defaultOutboundResendConfig = (
	config: OutboundResendAdapterConfig
): OutboundResendAdapterConfig & { readonly timeoutMs: number } => ({
	...config,
	timeoutMs: config.timeoutMs ?? 5000,
});

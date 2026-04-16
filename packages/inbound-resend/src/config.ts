import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type { ResendInboundAdapterConfig, ResendInboundRoute } from "./types";

const UrlString = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter((value: string) =>
			URL.canParse(value) ? undefined : "Expected a valid URL."
		)
	)
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const EmailString = Schema.String.pipe(
	Schema.check(
		Schema.makeFilter((value: string) =>
			EMAIL_PATTERN.test(value) ? undefined : "Expected a valid email address."
		)
	)
);

const PositiveNumber = Schema.Number.pipe(
	Schema.check(Schema.isGreaterThan(0))
);

const RouteSchema = Schema.Struct({
	jurisdiction: Schema.NonEmptyString,
	tenantId: Schema.NonEmptyString,
	workspaceId: Schema.optional(Schema.NonEmptyString),
});

/**
 * Effect Schema for validating raw Resend inbound adapter configuration,
 * including webhook credentials, routing rules, and optional fetch/retry
 * tunables.
 */
export const ResendInboundAdapterConfigSchema = Schema.Struct({
	apiKey: Schema.optional(Schema.NonEmptyString),
	defaultFromAddress: Schema.optional(EmailString),
	defaultFromName: Schema.optional(Schema.NonEmptyString),
	defaultRoute: Schema.optional(RouteSchema),
	fetchEmailContent: Schema.optional(Schema.Boolean),
	retryMaxAttempts: Schema.optional(PositiveNumber),
	routeMap: Schema.optional(Schema.Record(Schema.NonEmptyString, RouteSchema)),
	timeoutMs: Schema.optional(PositiveNumber),
	webhookSecret: Schema.NonEmptyString,
	webhookUrl: Schema.optional(UrlString),
});

/**
 * Parses and validates a raw configuration value against
 * {@link ResendInboundAdapterConfigSchema}.
 *
 * @param input - Untyped configuration object (e.g. parsed JSON or
 *   environment-derived values) to validate.
 * @returns An `Exit` containing either the validated
 *   {@link ResendInboundAdapterConfig} on success, or a
 *   `SchemaError` describing the validation failure.
 */
export const parseResendInboundAdapterConfig = (
	input: unknown
): Exit.Exit<ResendInboundAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(ResendInboundAdapterConfigSchema)(input);

/**
 * Applies default values for optional fields in a validated Resend
 * inbound adapter configuration.
 *
 * @param config - A previously validated
 *   {@link ResendInboundAdapterConfig}.
 * @returns A fully resolved config with defaults applied:
 *   `fetchEmailContent` → `false`, `retryMaxAttempts` → `3`,
 *   `timeoutMs` → `3000`, and `routeMap` keys lower-cased.
 */
export const defaultResendInboundConfig = (
	config: ResendInboundAdapterConfig
): Required<
	Pick<
		ResendInboundAdapterConfig,
		"fetchEmailContent" | "retryMaxAttempts" | "timeoutMs"
	>
> & {
	readonly apiKey?: string;
	readonly defaultFromAddress?: string;
	readonly defaultFromName?: string;
	readonly webhookSecret: string;
	readonly routeMap: Readonly<Record<string, ResendInboundRoute>>;
	readonly defaultRoute?: ResendInboundRoute;
} => {
	const routeMap: Record<string, ResendInboundRoute> = {};
	for (const [email, route] of Object.entries(config.routeMap ?? {})) {
		routeMap[email.toLowerCase()] = route;
	}

	return {
		apiKey: config.apiKey,
		defaultFromAddress: config.defaultFromAddress,
		defaultFromName: config.defaultFromName,
		defaultRoute: config.defaultRoute,
		fetchEmailContent: config.fetchEmailContent ?? false,
		retryMaxAttempts: config.retryMaxAttempts ?? 3,
		routeMap,
		timeoutMs: config.timeoutMs ?? 3000,
		webhookSecret: config.webhookSecret,
	};
};

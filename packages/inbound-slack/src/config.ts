import type { Exit } from "effect";
import * as Schema from "effect/Schema";

import type {
	SlackInboundAdapterConfig,
	SlackInboundRoute,
	SlackTeamRouteConfig,
} from "./types";

const PositiveNumber = Schema.Number.pipe(
	Schema.check(Schema.isGreaterThan(0))
);

const RouteSchema = Schema.Struct({
	jurisdiction: Schema.NonEmptyString,
	tenantId: Schema.NonEmptyString,
	workspaceId: Schema.optional(Schema.NonEmptyString),
});

const TeamRouteSchema = Schema.Struct({
	callbacks: Schema.optional(Schema.Record(Schema.NonEmptyString, RouteSchema)),
	channels: Schema.optional(Schema.Record(Schema.NonEmptyString, RouteSchema)),
	commands: Schema.optional(Schema.Record(Schema.NonEmptyString, RouteSchema)),
	jurisdiction: Schema.NonEmptyString,
	tenantId: Schema.NonEmptyString,
	workspaceId: Schema.optional(Schema.NonEmptyString),
});

/**
 * Effect schema for validating Slack inbound adapter configuration.
 */
export const SlackInboundAdapterConfigSchema = Schema.Struct({
	botToken: Schema.optional(Schema.NonEmptyString),
	dedupeTtlMs: Schema.optional(PositiveNumber),
	defaultRoute: Schema.optional(RouteSchema),
	replayToleranceSeconds: Schema.optional(PositiveNumber),
	signingSecret: Schema.NonEmptyString,
	teamRoutes: Schema.optional(
		Schema.Record(Schema.NonEmptyString, TeamRouteSchema)
	),
	userName: Schema.optional(Schema.NonEmptyString),
});

/**
 * Parses and validates an unknown Slack inbound adapter configuration value.
 *
 * @param input - Untyped configuration input to validate.
 * @returns An `Exit` containing either the validated config or a schema error.
 */
export const parseSlackInboundAdapterConfig = (
	input: unknown
): Exit.Exit<SlackInboundAdapterConfig, Schema.SchemaError> =>
	Schema.decodeUnknownExit(SlackInboundAdapterConfigSchema)(input);

const cloneRoute = (route: SlackInboundRoute): SlackInboundRoute => ({
	jurisdiction: route.jurisdiction,
	tenantId: route.tenantId,
	workspaceId: route.workspaceId,
});

const cloneTeamRoute = (route: SlackTeamRouteConfig): SlackTeamRouteConfig => ({
	callbacks: route.callbacks
		? Object.fromEntries(
				Object.entries(route.callbacks).map(([key, value]) => [
					key,
					cloneRoute(value),
				])
			)
		: undefined,
	channels: route.channels
		? Object.fromEntries(
				Object.entries(route.channels).map(([key, value]) => [
					key,
					cloneRoute(value),
				])
			)
		: undefined,
	commands: route.commands
		? Object.fromEntries(
				Object.entries(route.commands).map(([key, value]) => [
					key,
					cloneRoute(value),
				])
			)
		: undefined,
	jurisdiction: route.jurisdiction,
	tenantId: route.tenantId,
	workspaceId: route.workspaceId,
});

/**
 * Applies default values and cloning to a validated Slack adapter config.
 *
 * @param config - Previously validated Slack inbound adapter configuration.
 * @returns A fully resolved config with defaults applied for runtime use.
 */
export const defaultSlackInboundConfig = (
	config: SlackInboundAdapterConfig
): Required<
	Pick<SlackInboundAdapterConfig, "dedupeTtlMs" | "replayToleranceSeconds">
> & {
	readonly botToken?: string;
	readonly defaultRoute?: SlackInboundRoute;
	readonly signingSecret: string;
	readonly teamRoutes: Readonly<Record<string, SlackTeamRouteConfig>>;
	readonly userName: string;
} => ({
	botToken: config.botToken,
	dedupeTtlMs: config.dedupeTtlMs ?? 300_000,
	defaultRoute: config.defaultRoute
		? cloneRoute(config.defaultRoute)
		: undefined,
	replayToleranceSeconds: config.replayToleranceSeconds ?? 300,
	signingSecret: config.signingSecret,
	teamRoutes: Object.fromEntries(
		Object.entries(config.teamRoutes ?? {}).map(([key, value]) => [
			key,
			cloneTeamRoute(value),
		])
	),
	userName: config.userName ?? "dsar-bot",
});

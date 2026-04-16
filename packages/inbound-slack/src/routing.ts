import { SlackInvocationError } from "./errors";
import type { SlackEventBody } from "./parse";
/* oxlint-disable max-statements */
import type {
	SlackInboundIntent,
	SlackInboundRoute,
	SlackInboundSurface,
	SlackTeamRouteConfig,
} from "./types";

const DSAR_INTENT_TOKENS = [
	"subject access request",
	"sar",
	"access my data",
	"my personal data",
	"copy of my data",
	"privacy request",
	"gdpr request",
	"ccpa request",
] as const;

const isStandaloneWord = (input: string, token: string): boolean =>
	new RegExp(`\\b${token}\\b`, "u").test(input);

const matchesDsarIntentToken = (input: string, token: string): boolean =>
	token === "sar" ? isStandaloneWord(input, token) : input.includes(token);

/**
 * Classifies whether a Slack event should be treated as a DSAR intake.
 *
 * @param input - Slack surface metadata and text content used for intent checks.
 * @returns Normalized DSAR intent classification for the inbound event.
 */
export const classifyIntent = (input: {
	readonly surface: SlackInboundSurface;
	readonly text: string;
	readonly command?: string;
	readonly callbackId?: string;
}): SlackInboundIntent => {
	if (
		input.surface === "slash_command" ||
		input.surface === "shortcut" ||
		input.surface === "view_submission" ||
		input.surface === "block_actions"
	) {
		return {
			isDsar: true,
			reason: "Slack intake surface explicitly requests DSAR handling.",
		};
	}
	const normalized =
		`${input.command ?? ""} ${input.callbackId ?? ""} ${input.text}`
			.toLowerCase()
			.trim();
	const matchedToken = DSAR_INTENT_TOKENS.find((token) =>
		matchesDsarIntentToken(normalized, token)
	);
	return matchedToken
		? {
				isDsar: true,
				reason: `Matched token "${matchedToken}" in Slack payload.`,
			}
		: {
				isDsar: false,
				reason: "No DSAR-intent token matched in Slack payload.",
			};
};

const baseRouteFromTeam = (route: SlackTeamRouteConfig): SlackInboundRoute => ({
	jurisdiction: route.jurisdiction,
	tenantId: route.tenantId,
	workspaceId: route.workspaceId,
});

/**
 * Resolves the tenant/jurisdiction route for an inbound Slack event.
 *
 * @param input - Parsed Slack event body containing team, channel, and callback data.
 * @param teamRoutes - Team-scoped Slack routing configuration keyed by team id.
 * @param defaultRoute - Fallback route when no team-specific mapping matches.
 * @returns The resolved Slack inbound route for the event.
 */
export const resolveRoute = (
	input: SlackEventBody,
	teamRoutes: Readonly<Record<string, SlackTeamRouteConfig>>,
	defaultRoute?: SlackInboundRoute
): SlackInboundRoute => {
	const teamRoute = teamRoutes[input.teamId];
	const callbackRoute =
		input.callbackId && teamRoute?.callbacks
			? teamRoute.callbacks[input.callbackId]
			: undefined;
	if (callbackRoute) {
		return callbackRoute;
	}
	const commandRoute =
		input.command && teamRoute?.commands
			? teamRoute.commands[input.command]
			: undefined;
	if (commandRoute) {
		return commandRoute;
	}
	const channelRoute =
		input.channelId && teamRoute?.channels
			? teamRoute.channels[input.channelId]
			: undefined;
	if (channelRoute) {
		return channelRoute;
	}
	if (teamRoute) {
		return baseRouteFromTeam(teamRoute);
	}
	if (defaultRoute) {
		return defaultRoute;
	}
	throw new SlackInvocationError({
		category: "validation",
		message: "No Slack route matched the incoming team/channel/surface.",
	});
};

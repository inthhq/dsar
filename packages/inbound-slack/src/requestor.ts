/* oxlint-disable max-statements */
import { asNonEmptyString, asRecord } from "@dsar/guards";

import type { SlackEventBody } from "./parse";
import type {
	SlackInboundAdapterDependencies,
	SlackRequestor,
	SlackUserProfile,
} from "./types";

const fetchUserProfile = async (
	botToken: string,
	userId: string
): Promise<SlackUserProfile | undefined> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 2000);
	try {
		const response = await fetch(
			`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
			{
				headers: {
					authorization: `Bearer ${botToken}`,
				},
				signal: controller.signal,
			}
		);
		if (!response.ok) {
			return undefined;
		}
		const payload = (await response.json()) as unknown;
		const record = asRecord(payload);
		if (record?.ok !== true) {
			return undefined;
		}
		const user = asRecord(record.user);
		const profile = asRecord(user?.profile);
		const displayName =
			asNonEmptyString(profile?.display_name) ??
			asNonEmptyString(profile?.real_name) ??
			asNonEmptyString(user?.real_name);
		return {
			email: asNonEmptyString(profile?.email),
			name: displayName,
		};
	} catch {
		return undefined;
	} finally {
		clearTimeout(timer);
	}
};

const resolveOptionalUserProfile = async (
	loadProfile: () => Promise<SlackUserProfile | undefined>
): Promise<SlackUserProfile | undefined> => {
	try {
		return await loadProfile();
	} catch {
		return undefined;
	}
};

/**
 * Resolves the requestor identity attached to an inbound Slack event.
 *
 * @param input - Parsed Slack event body that may contain user identifiers.
 * @param config - Slack adapter configuration, including optional bot token.
 * @param dependencies - Optional dependency overrides for user profile lookup.
 * @returns The normalized Slack requestor profile used for request capture.
 */
export const resolveRequestor = async (
	input: SlackEventBody,
	config: {
		readonly botToken?: string;
	},
	dependencies: SlackInboundAdapterDependencies
): Promise<SlackRequestor> => {
	if (!input.userId) {
		return { id: "slack-unknown-user" };
	}
	const { userId } = input;
	let providedProfile: SlackUserProfile | undefined;
	const { getUserProfile } = dependencies;
	if (getUserProfile) {
		providedProfile = await resolveOptionalUserProfile(() =>
			getUserProfile({
				userId,
			})
		);
	} else {
		const { botToken } = config;
		if (!botToken) {
			return {
				id: userId,
				name: input.userName,
			};
		}
		providedProfile = await resolveOptionalUserProfile(() =>
			fetchUserProfile(botToken, userId)
		);
	}
	return {
		email: providedProfile?.email,
		id: userId,
		name: providedProfile?.name ?? input.userName,
	};
};

import { makeUnkeyBearerResolver } from "dsar/auth-unkey";
import type { DsarConfigOptions, RuntimeAuthConfig } from "dsar/backend";
import { makeResendInboundAdapter } from "dsar/inbound-resend";
import { makeSlackInboundAdapter } from "dsar/inbound-slack";
import { makeOutboundResendAdapter } from "dsar/outbound-resend";
import { makeFilesystemStorageAdapter } from "dsar/storage-filesystem";

const getNumber = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getBoolean = (value: string | undefined, fallback: boolean): boolean => {
	if (value === undefined) {
		return fallback;
	}
	return value.toLowerCase() === "true";
};

const getString = (value: string | undefined, fallback: string): string => {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

const getOptionalString = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const defaultTenantId =
	getOptionalString(process.env.DSAR_TENANT_ID) ??
	process.env.DSAR_TEST_TENANT ??
	"tenant-default";
const defaultWorkspaceId = getOptionalString(process.env.DSAR_WORKSPACE_ID);
const adminApiToken =
	getOptionalString(process.env.DSAR_ADMIN_API_TOKEN) ??
	getOptionalString(process.env.DSAR_API_TOKEN);
const subjectApiToken = getOptionalString(process.env.DSAR_SUBJECT_API_TOKEN);
const unkeyRootKey = getOptionalString(process.env.UNKEY_ROOT_KEY);
const maybeUnkeyBearerResolver = unkeyRootKey
	? makeUnkeyBearerResolver({
			fallbackPrincipalKind: "service",
			fallbackRole: "admin",
			permissions: getOptionalString(
				process.env.DSAR_UNKEY_REQUIRED_PERMISSION
			),
			rootKey: unkeyRootKey,
		})
	: undefined;

if (adminApiToken && subjectApiToken && adminApiToken === subjectApiToken) {
	throw new Error(
		"DSAR_ADMIN_API_TOKEN/DSAR_API_TOKEN and DSAR_SUBJECT_API_TOKEN resolved to the same value. Configure distinct tokens for admin and subject access."
	);
}

const slackBotToken = getOptionalString(process.env.SLACK_BOT_TOKEN);
const slackSigningSecret = getOptionalString(process.env.SLACK_SIGNING_SECRET);
const slackUserName = getOptionalString(process.env.SLACK_BOT_USERNAME);

const staticBearerTokens = {
	...(adminApiToken
		? {
				[adminApiToken]: {
					actorId:
						getOptionalString(process.env.DSAR_ADMIN_ACTOR_ID) ??
						"dashboard-admin",
					principalKind: "operator",
					role: getOptionalString(process.env.DSAR_ADMIN_ROLE) ?? "admin",
					tenantId: defaultTenantId,
					...(defaultWorkspaceId ? { workspaceId: defaultWorkspaceId } : {}),
				},
			}
		: {}),
	...(subjectApiToken
		? {
				[subjectApiToken]: {
					actorId:
						getOptionalString(process.env.DSAR_SUBJECT_ACTOR_ID) ??
						"subject-portal-user",
					email:
						getOptionalString(process.env.DSAR_SUBJECT_EMAIL) ??
						"subject@example.com",
					principalKind: "subject",
					role: getOptionalString(process.env.DSAR_SUBJECT_ROLE) ?? "subject",
					tenantId: defaultTenantId,
					...(defaultWorkspaceId ? { workspaceId: defaultWorkspaceId } : {}),
				},
			}
		: {}),
} satisfies NonNullable<RuntimeAuthConfig["staticBearerTokens"]>;

const outboundResendLive = getBoolean(
	process.env.DSAR_OUTBOUND_RESEND_LIVE,
	false
);

const defaultInboundRoute = {
	jurisdiction: process.env.DSAR_INBOUND_DEFAULT_JURISDICTION ?? "uk",
	tenantId: defaultTenantId,
	workspaceId:
		process.env.DSAR_INBOUND_DEFAULT_WORKSPACE_ID ?? defaultWorkspaceId,
} as const;

const buildAuthConfig = (): RuntimeAuthConfig => ({
	// `DSAR_API_TOKEN` / `DSAR_ADMIN_API_TOKEN` stays the simplest
	// self-hosted path. `DSAR_SUBJECT_API_TOKEN` exists here to make the
	// local subject portal demo easy to run, not as a production browser
	// auth recommendation.
	...(maybeUnkeyBearerResolver
		? { resolveBearerToken: maybeUnkeyBearerResolver }
		: {}),
	staticBearerTokens,
});

const buildInboundAdapters = () => {
	const adapters = [
		makeResendInboundAdapter({
			defaultRoute: defaultInboundRoute,
			webhookSecret: getString(
				process.env.DSAR_INBOUND_RESEND_WEBHOOK_SECRET,
				"resend_dev_webhook_secret"
			),
		}),
	];

	if (slackBotToken && slackSigningSecret) {
		adapters.push(
			makeSlackInboundAdapter({
				...(process.env.SLACK_DEDUPE_TTL_MS
					? {
							dedupeTtlMs: getNumber(process.env.SLACK_DEDUPE_TTL_MS, 300_000),
						}
					: {}),
				defaultRoute: defaultInboundRoute,
				...(process.env.SLACK_REPLAY_TOLERANCE_SECONDS
					? {
							replayToleranceSeconds: getNumber(
								process.env.SLACK_REPLAY_TOLERANCE_SECONDS,
								300
							),
						}
					: {}),
				botToken: slackBotToken,
				signingSecret: slackSigningSecret,
				...(slackUserName ? { userName: slackUserName } : {}),
			})
		);
	}

	return adapters;
};

const buildNotificationAdapter = () =>
	makeOutboundResendAdapter(
		{
			apiKey: getString(
				process.env.DSAR_OUTBOUND_RESEND_API_KEY,
				"re_dev_api_key"
			),
			from: getString(
				process.env.DSAR_OUTBOUND_RESEND_FROM,
				"DSAR Kitchen Sink <no-reply@example.com>"
			),
			replyTo: process.env.DSAR_OUTBOUND_RESEND_REPLY_TO,
			subjectPrefix: process.env.DSAR_OUTBOUND_RESEND_SUBJECT_PREFIX,
			timeoutMs: getNumber(process.env.DSAR_OUTBOUND_RESEND_TIMEOUT_MS, 2000),
		},
		outboundResendLive
			? undefined
			: {
					sendEmail: async () => {
						await Promise.resolve();
						return {
							data: { id: `mock-outbound-${Date.now().toString(10)}` },
							error: null,
							headers: null,
						};
					},
				}
	);

const buildStorageAdapter = () =>
	makeFilesystemStorageAdapter({
		baseDir: process.env.FS_STORAGE_BASE_DIR ?? ".dsar-kitchen-sink-artifacts",
		prefix: process.env.FS_STORAGE_PREFIX ?? "artifacts",
		retryMaxAttempts: getNumber(process.env.FS_STORAGE_RETRY_MAX_ATTEMPTS, 1),
	});

export const runtimeConfig: DsarConfigOptions = {
	adapters: {
		inbound: buildInboundAdapters(),
		notifications: buildNotificationAdapter(),
		storage: buildStorageAdapter(),
	},
	basePath: process.env.DSAR_BASE_PATH ?? "/api/v1",
	config: {
		aiEnabled: getBoolean(process.env.DSAR_AI_ENABLED, false),
		auth: buildAuthConfig(),
		defaultLocale: process.env.DSAR_DEFAULT_LOCALE ?? "en-GB",
		enableManifestReview: getBoolean(
			process.env.DSAR_ENABLE_MANIFEST_REVIEW,
			true
		),
		environment:
			process.env.NODE_ENV === "production" ? "production" : "development",
		outboundResend: {
			enabled: getBoolean(process.env.DSAR_OUTBOUND_RESEND_ENABLED, true),
			fallbackRecipient: process.env.DSAR_OUTBOUND_RESEND_FALLBACK_RECIPIENT,
		},
	},
};

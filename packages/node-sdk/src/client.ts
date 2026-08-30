import * as Effect from "effect/Effect";

import type {
	AuditApi,
	PoliciesApi,
	RetentionApi,
	RequestsApi,
	SubjectsApi,
	SystemApi,
	WebhooksApi,
} from "./endpoints";
import { makeAuditApi } from "./endpoints/audit";
import { makePoliciesApi } from "./endpoints/policies";
import { makeRequestsApi } from "./endpoints/requests";
import { makeRetentionApi } from "./endpoints/retention";
import { makeSubjectsApi } from "./endpoints/subjects";
import { makeSystemApi } from "./endpoints/system";
import { makeWebhooksApi } from "./endpoints/webhooks";
import { callApi } from "./fetcher";
import { makeResult } from "./result";
import type {
	CallApiInput,
	DsarResult,
	NodeSdkConfig,
	ResolvedNodeSdkConfig,
	SdkError,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_MAX_ATTEMPTS = 2;

const normalizeBaseUrl = (value: string) => {
	const parsed = new URL(value);
	return parsed.toString().endsWith("/") ? parsed.toString() : `${parsed}/`;
};

const resolveConfig = (config: NodeSdkConfig = {}): ResolvedNodeSdkConfig => {
	const baseUrl = config.baseUrl ?? process.env.DSAR_API_URL;
	if (!baseUrl) {
		throw new Error(
			"@dsar/node-sdk requires baseUrl or DSAR_API_URL environment variable."
		);
	}
	const timeoutMs = Math.max(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1);
	const retryMaxAttempts = Math.max(
		config.retryMaxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS,
		1
	);
	return {
		baseUrl: normalizeBaseUrl(baseUrl),
		debug: config.debug === true ? undefined : config.debug,
		defaultHeaders: config.defaultHeaders ?? {},
		fetch: config.fetch ?? fetch,
		retryMaxAttempts,
		timeoutMs,
		token: config.token ?? process.env.DSAR_API_TOKEN,
	};
};

const makeCall =
	(config: ResolvedNodeSdkConfig) =>
	async <T>(input: CallApiInput): Promise<DsarResult<T>> => {
		const envelope = await Effect.runPromise(callApi<T>(config, input));
		return makeResult(envelope);
	};

/**
 * Top-level node SDK client surface grouped by DSAR API domains.
 */
export interface NodeSdkClient {
	/** Operator-scoped persistence and adapter diagnostics. */
	readonly diagnostics: SystemApi["diagnostics"];
	/** Requests API surface exposed by this client. */
	readonly requests: RequestsApi;
	/** Subjects API surface exposed by this client. */
	readonly subjects: SubjectsApi;
	/** Policies API surface exposed by this client. */
	readonly policies: PoliciesApi;
	/** Health/status endpoint operation exposed by this client. */
	readonly status: SystemApi["status"];
	/** Initialization endpoint operation exposed by this client. */
	readonly init: SystemApi["init"];
	/** Retention API surface exposed by this client. */
	readonly retention: RetentionApi;
	/** Audit API surface exposed by this client. */
	readonly audit: AuditApi;
	/** Webhook API surface exposed by this client. */
	readonly webhooks: WebhooksApi;
}

/**
 * Creates a configured node SDK client for DSAR API operations.
 *
 * @param config - Controls base URL, auth token, timeout budget, retry
 *   ceiling, debug hooks, custom headers, and an optional pluggable `fetch`
 *   implementation. All fields fall back to sensible defaults or
 *   environment variables when omitted.
 * @returns Client with domain-grouped methods for requests, subjects,
 *   policies, retention, audit, webhooks, and system health/init endpoints.
 */
export const createNodeSdk = (config?: NodeSdkConfig): NodeSdkClient => {
	const resolved = resolveConfig(config);
	const call = makeCall(resolved);
	const requests = makeRequestsApi({ call });
	const subjects = makeSubjectsApi({ call });
	const policies = makePoliciesApi({ call });
	const system = makeSystemApi({ call });
	const retention = makeRetentionApi({ call });
	const audit = makeAuditApi({ call });
	const webhooks = makeWebhooksApi({ call });

	return {
		audit,
		diagnostics: system.diagnostics,
		init: system.init,
		policies,
		requests,
		retention,
		status: system.status,
		subjects,
		webhooks,
	};
};

export type { SdkError };

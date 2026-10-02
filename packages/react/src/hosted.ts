/**
 * Client transport. Same split as c15t: hosted URL vs self-hosted URL.
 *
 * Production: `hosted({ url: "https://org-project.inth.app/dsar" })`
 * Local: `selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1" })`
 */

/** Transport pointing at hosted inth.app. */
export interface HostedMode {
	/** Discriminator for hosted SaaS. */
	readonly kind: "hosted";
	/** Absolute DSAR HTTP origin. */
	readonly baseUrl: string;
}

/** Transport pointing at a self-hosted DSAR HTTP server. */
export interface SelfHostedMode {
	/** Discriminator for self-hosted HTTP. */
	readonly kind: "self-hosted";
	/** Absolute DSAR HTTP origin. */
	readonly baseUrl: string;
}

/** Hosted or self-hosted browser transport. */
export type DsarClientMode = HostedMode | SelfHostedMode;

/** Default local kitchen-sink origin used by the portal examples. */
export const LOCAL_SELF_HOST_URL = "http://kitchen-sink.localhost:1355/api/v1";

const trimTrailingSlash = (value: string): string =>
	value.endsWith("/") ? value.slice(0, -1) : value;

const requireUrl = (url: string, label: string): string => {
	const trimmed = url.trim();
	if (trimmed.length === 0) {
		throw new Error(`${label} requires a non-empty url`);
	}
	return trimTrailingSlash(trimmed);
};

const ensureHostedDsarPath = (url: string): string => {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("hosted({ url }) must be an absolute URL");
	}
	const path = trimTrailingSlash(parsed.pathname);
	if (path === "") {
		parsed.pathname = "/dsar";
	}
	return trimTrailingSlash(parsed.toString());
};

/**
 * Hosted inth.app backend. Pass `https://org-project.inth.app`; `/dsar`
 * is added when the path is empty.
 *
 * @param input - Absolute hosted origin or DSAR HTTP base URL.
 * @returns Mode pointing at that URL, with `/dsar` if you omitted the path.
 * @example
 * hosted({ url: "https://acme-prod.inth.app" })
 * // https://acme-prod.inth.app/dsar
 */
export const hosted = (input: { readonly url: string }): HostedMode => ({
	baseUrl: ensureHostedDsarPath(requireUrl(input.url, "hosted({ url })")),
	kind: "hosted",
});

/**
 * Self-hosted DSAR HTTP server (kitchen-sink locally, or your own deploy).
 *
 * @param input - Absolute DSAR HTTP base URL.
 * @returns Mode pointing at that URL with a trailing slash stripped.
 * @example
 * selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1" })
 */
export const selfHosted = (input: {
	readonly url: string;
}): SelfHostedMode => ({
	baseUrl: requireUrl(input.url, "selfHosted({ url })"),
	kind: "self-hosted",
});

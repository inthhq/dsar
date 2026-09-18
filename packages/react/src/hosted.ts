/**
 * Client transport. Same split as c15t: hosted inth.com vs self-hosted URL.
 *
 * Production: `hosted({ project: "acme" })` → `https://acme.inth.app/dsar`
 * Local: `selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1" })`
 */

export interface HostedMode {
	readonly kind: "hosted";
	readonly baseUrl: string;
}

export interface SelfHostedMode {
	readonly kind: "self-hosted";
	readonly baseUrl: string;
}

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

/**
 * Hosted inth.com backend.
 *
 * @example
 * hosted({ project: "acme" })
 * // https://acme.inth.app/dsar
 */
export const hosted = (input: { readonly project: string }): HostedMode => {
	const project = input.project.trim();
	if (project.length === 0) {
		throw new Error("hosted({ project }) requires a project slug");
	}
	if (project.includes("/") || project.includes(".")) {
		throw new Error(
			"hosted({ project }) is a slug, not a hostname. Use selfHosted({ url }) for a full URL."
		);
	}
	return {
		baseUrl: `https://${project}.inth.app/dsar`,
		kind: "hosted",
	};
};

/**
 * Self-hosted DSAR HTTP server (kitchen-sink locally, or your own deploy).
 *
 * @example
 * selfHosted({ url: "http://kitchen-sink.localhost:1355/api/v1" })
 */
export const selfHosted = (input: {
	readonly url: string;
}): SelfHostedMode => ({
	baseUrl: requireUrl(input.url, "selfHosted({ url })"),
	kind: "self-hosted",
});

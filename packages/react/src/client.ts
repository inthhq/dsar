/**
 * Browser-safe DSAR HTTP client. Talks to a hosted or BFF base URL.
 * Do not put machine API tokens here. Hosted inth.app uses cookies.
 * Local demos inject the token in the Next/Bun route, not in the widget.
 */

export interface DsarEnvelopeError {
	readonly code: string;
	readonly message: string;
	readonly status: number;
}

export class DsarBrowserError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(error: DsarEnvelopeError) {
		super(error.message);
		this.name = "DsarBrowserError";
		this.code = error.code;
		this.status = error.status;
	}
}

export interface DsarBrowserClient {
	readonly baseUrl: string;
	get: <T>(path: string) => Promise<T>;
	post: <T>(path: string, body: unknown) => Promise<T>;
}

const joinUrl = (baseUrl: string, path: string): string => {
	const suffix = path.startsWith("/") ? path : `/${path}`;
	return `${baseUrl}${suffix}`;
};

const readEnvelope = async <T>(response: Response): Promise<T> => {
	const payload: unknown = await response.json().catch(() => null);
	if (
		payload !== null &&
		typeof payload === "object" &&
		"ok" in payload &&
		payload.ok === true &&
		"data" in payload
	) {
		return payload.data as T;
	}
	if (
		payload !== null &&
		typeof payload === "object" &&
		"ok" in payload &&
		payload.ok === false &&
		"error" in payload &&
		payload.error !== null &&
		typeof payload.error === "object"
	) {
		const error = payload.error as {
			readonly code?: string;
			readonly message?: string;
			readonly status?: number;
		};
		throw new DsarBrowserError({
			code: error.code ?? "DSAR_BROWSER_ERROR",
			message: error.message ?? response.statusText,
			status: error.status ?? response.status,
		});
	}
	throw new DsarBrowserError({
		code: "DSAR_BROWSER_ERROR",
		message: `Unexpected DSAR response (${String(response.status)})`,
		status: response.status,
	});
};

export const createDsarBrowserClient = (input: {
	readonly baseUrl: string;
	readonly fetch?: typeof fetch;
}): DsarBrowserClient => {
	const request = input.fetch ?? globalThis.fetch;
	const { baseUrl } = input;
	return {
		baseUrl,
		get: async <T>(path: string): Promise<T> => {
			const response = await request(joinUrl(baseUrl, path), {
				credentials: "include",
				headers: { accept: "application/json" },
				method: "GET",
			});
			return readEnvelope<T>(response);
		},
		post: async <T>(path: string, body: unknown): Promise<T> => {
			const response = await request(joinUrl(baseUrl, path), {
				body: JSON.stringify(body),
				credentials: "include",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				method: "POST",
			});
			return readEnvelope<T>(response);
		},
	};
};

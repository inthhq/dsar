import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { PersistenceService } from "@dsar/persistence";

import { dsarInstance } from "../../src";
import type { RuntimeAdapters, RuntimeConfig } from "../../src/types/runtime";
import { TEST_ADMIN_HEADERS, TEST_RUNTIME_AUTH } from "../auth";
import { makeMemoryPersistence } from "./fixtures";

export const ACTOR_HEADERS = TEST_ADMIN_HEADERS;

export interface ApiE2eRequestInput {
	readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	readonly path: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly body?: BodyInit;
	readonly json?: unknown;
}

export interface ApiE2eServer {
	readonly baseUrl: string;
	readonly request: (input: ApiE2eRequestInput) => Promise<Response>;
	readonly close: () => Promise<void>;
}

export interface ApiE2eServerOptions {
	readonly adapters?: Partial<RuntimeAdapters>;
	readonly config?: Partial<RuntimeConfig>;
	readonly persistence?: PersistenceService;
}

const toRequestHeaders = (incoming: IncomingMessage): Headers => {
	const headers = new Headers();
	for (const [key, value] of Object.entries(incoming.headers)) {
		if (!value) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const entry of value) {
				headers.append(key, entry);
			}
			continue;
		}
		headers.set(key, value);
	}
	return headers;
};

const readRequestBody = async (incoming: IncomingMessage): Promise<Buffer> => {
	const chunks: Buffer[] = [];
	let streamError: unknown;
	const onError = (error: unknown): void => {
		streamError = error;
	};
	incoming.on("error", onError);
	try {
		for await (const chunk of incoming) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
	} catch (error) {
		throw streamError ?? error;
	} finally {
		incoming.off("error", onError);
	}
	return Buffer.concat(chunks);
};

const toWebRequest = async (
	incoming: IncomingMessage,
	port: number
): Promise<Request> => {
	const host = incoming.headers.host ?? `127.0.0.1:${port}`;
	const url = `http://${host}${incoming.url ?? "/"}`;
	const method = incoming.method ?? "GET";
	const body =
		method === "GET" || method === "HEAD"
			? undefined
			: await readRequestBody(incoming);
	return new Request(url, {
		body: body ? new Uint8Array(body) : undefined,
		headers: toRequestHeaders(incoming),
		method,
	});
};

const writeWebResponse = async (
	outgoing: ServerResponse,
	response: Response
): Promise<void> => {
	outgoing.statusCode = response.status;
	for (const [key, value] of response.headers.entries()) {
		outgoing.setHeader(key, value);
	}
	const responseBuffer = Buffer.from(await response.arrayBuffer());
	outgoing.end(responseBuffer);
};

export const startApiE2eServer = async (
	options: ApiE2eServerOptions = {}
): Promise<ApiE2eServer> => {
	const runtime = dsarInstance({
		adapters: options.adapters ?? {
			inbound: "stub",
			notifications: "stub",
			storage: "stub",
		},
		config: {
			...TEST_RUNTIME_AUTH.config,
			...options.config,
			auth: options.config?.auth ?? TEST_RUNTIME_AUTH.config.auth,
		},
		repos: {
			persistence: options.persistence ?? makeMemoryPersistence(),
		},
	});
	const server = createServer(async (incoming, outgoing) => {
		try {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			const request = await toWebRequest(incoming, port);
			const response = await runtime.handler(request);
			await writeWebResponse(outgoing, response);
		} catch (error) {
			console.error("API E2E request handling failed:", error);
			outgoing.statusCode = 500;
			outgoing.end("Internal Server Error");
		}
	});

	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (typeof address !== "object" || !address) {
		throw new Error("Failed to resolve API E2E server address.");
	}

	const baseUrl = `http://127.0.0.1:${address.port}`;
	return {
		baseUrl,
		close: async () => {
			server.close();
			await once(server, "close");
		},
		request: (input) => {
			const headers = new Headers(input.headers);
			const method = input.method ?? "GET";
			const body =
				input.json === undefined ? input.body : JSON.stringify(input.json);
			if (input.json !== undefined && !headers.has("content-type")) {
				headers.set("content-type", "application/json");
			}
			return fetch(`${baseUrl}${input.path}`, {
				body,
				headers,
				method,
			});
		},
	};
};

import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { dsarInstance, runtimeReposFromPersistence } from "dsar/backend";
import { makePgPersistenceService } from "dsar/persistence-pg";
import { makeSqlitePersistenceService } from "dsar/persistence-sqlite";

import { runtimeConfig } from "./runtime.config";

const isCheckMode = process.argv.includes("--check");
const persistenceFile =
	process.env.DSAR_PERSISTENCE_SQLITE_PATH ?? ".dsar-kitchen-sink.db";
const persistenceDriver =
	process.env.DSAR_PERSISTENCE_DRIVER?.toLowerCase() === "pg" ? "pg" : "sqlite";
const pgUrl = process.env.DSAR_PERSISTENCE_PG_URL;
type PersistenceService = Parameters<typeof runtimeReposFromPersistence>[0];

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

if (isCheckMode) {
	console.log("Config check passed for kitchen-sink example.");
	process.exit(0);
}

const loadPersistence = (): Promise<PersistenceService> =>
	persistenceDriver === "pg"
		? makePgPersistenceService({
				connectionUrl:
					pgUrl ?? "postgres://postgres:postgres@localhost:5432/dsar",
			})
		: makeSqlitePersistenceService({
				filename: persistenceFile,
			});

const toWebRequest = async (
	incoming: IncomingMessage,
	port: number
): Promise<Request> => {
	const host = incoming.headers.host ?? `localhost:${port}`;
	const url = `http://${host}${incoming.url ?? "/"}`;
	const method = incoming.method ?? "GET";
	const body =
		method === "GET" || method === "HEAD"
			? undefined
			: await readRequestBody(incoming);
	const headers = toRequestHeaders(incoming);
	return new Request(url, {
		body: body ? new Uint8Array(body) : undefined,
		headers,
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

const basePath = runtimeConfig.basePath ?? "/api/v1";
const port = Number.parseInt(process.env.PORT ?? "3021", 10);

const start = async (): Promise<void> => {
	const persistence = await loadPersistence();
	const runtime = dsarInstance({
		...runtimeConfig,
		repos: runtimeReposFromPersistence(persistence),
	});

	const server = createServer(async (incoming, outgoing) => {
		try {
			const request = await toWebRequest(incoming, port);
			const response = await runtime.handler(request);
			await writeWebResponse(outgoing, response);
		} catch (error) {
			console.error("Request handling failed:", error);
			outgoing.statusCode = 500;
			outgoing.end("Internal Server Error");
		}
	});

	server.listen(port, () => {
		const rootUrl = `http://localhost:${port}`;
		const baseUrl = basePath === "/" ? rootUrl : `${rootUrl}${basePath}`;
		console.log(`DSAR runtime: ${rootUrl}`);
		console.log(`Status: ${baseUrl}/status`);
		console.log(`OpenAPI: ${baseUrl}/spec.json`);
		console.log(`Docs: ${baseUrl}/docs`);
		if (persistenceDriver === "pg") {
			console.log(`Persistence: pg (${pgUrl ?? "default local connection"})`);
		} else {
			console.log(`Persistence: sqlite (${persistenceFile})`);
		}
	});
};

await start();

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { WebhookEvent } from "@dsar/node-sdk/webhooks";

/**
 * Demo user owned by this example. Email is stored here, not read from webhook
 * payloads. DSAR outbound events do not include the subject email.
 */
export interface DemoUser {
	readonly email: string;
	readonly requestId: string;
}

export type DemoAuditResult =
	| "already_processed"
	| "deleted"
	| "ignored_until_fulfilment"
	| "unknown_request";

export interface DemoAuditEntry {
	readonly email?: string;
	readonly eventId: string;
	readonly eventType: "request_captured" | "request_fulfilled";
	readonly requestId: string;
	readonly result: DemoAuditResult;
}

interface StoreSnapshot {
	readonly audit: readonly DemoAuditEntry[];
	readonly processedEventIds: readonly string[];
	readonly users: readonly DemoUser[];
}

const emptySnapshot = (): StoreSnapshot => ({
	audit: [],
	processedEventIds: [],
	users: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

const readDemoUser = (value: unknown): DemoUser | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}
	const email = readNonEmptyString(value.email);
	const requestId = readNonEmptyString(value.requestId);
	if (!email || !requestId) {
		return undefined;
	}
	return { email, requestId };
};

const readAuditResult = (value: unknown): DemoAuditResult | undefined => {
	if (
		value === "already_processed" ||
		value === "deleted" ||
		value === "ignored_until_fulfilment" ||
		value === "unknown_request"
	) {
		return value;
	}
	return undefined;
};

const readAuditEventType = (
	value: unknown
): DemoAuditEntry["eventType"] | undefined => {
	if (value === "request_captured" || value === "request_fulfilled") {
		return value;
	}
	return undefined;
};

const readAuditEntry = (value: unknown): DemoAuditEntry | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}
	const eventId = readNonEmptyString(value.eventId);
	const eventType = readAuditEventType(value.eventType);
	const requestId = readNonEmptyString(value.requestId);
	const result = readAuditResult(value.result);
	if (!eventId || !eventType || !requestId || !result) {
		return undefined;
	}
	const email = readNonEmptyString(value.email);
	return email
		? { email, eventId, eventType, requestId, result }
		: { eventId, eventType, requestId, result };
};

const readSnapshot = (value: unknown): StoreSnapshot => {
	if (!isRecord(value)) {
		return emptySnapshot();
	}
	const users: DemoUser[] = [];
	if (Array.isArray(value.users)) {
		for (const item of value.users) {
			const user = readDemoUser(item);
			if (user) {
				users.push(user);
			}
		}
	}
	const processedEventIds: string[] = [];
	if (Array.isArray(value.processedEventIds)) {
		for (const item of value.processedEventIds) {
			const eventId = readNonEmptyString(item);
			if (eventId) {
				processedEventIds.push(eventId);
			}
		}
	}
	const audit: DemoAuditEntry[] = [];
	if (Array.isArray(value.audit)) {
		for (const item of value.audit) {
			const entry = readAuditEntry(item);
			if (entry) {
				audit.push(entry);
			}
		}
	}
	return { audit, processedEventIds, users };
};

const parseSnapshotJson = (raw: string): StoreSnapshot => {
	try {
		const parsed: unknown = JSON.parse(raw);
		return readSnapshot(parsed);
	} catch {
		throw new Error("Demo store file is not valid JSON.");
	}
};

/** Seeded local user used when the JSON file is first created. */
export const defaultDemoUser: DemoUser = {
	email: "ada@example.com",
	requestId: "req_demo_001",
};

const defaultStorePath = join(process.cwd(), ".data", "demo-users.json");

/**
 * JSON file store that works on Bun and Node. It is a local demo, not a
 * production database.
 */
export class DemoStore {
	readonly filePath: string;

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	ensureInitialized(user: DemoUser = defaultDemoUser): void {
		if (!existsSync(this.filePath)) {
			this.seed(user);
		}
	}

	seed(user: DemoUser): DemoUser {
		const snapshot = this.read();
		if (snapshot.users.some((row) => row.requestId === user.requestId)) {
			return user;
		}
		this.write({
			...snapshot,
			users: [...snapshot.users, user],
		});
		return user;
	}

	getUser(requestId: string): DemoUser | undefined {
		return this.read().users.find((user) => user.requestId === requestId);
	}

	listUsers(): readonly DemoUser[] {
		return this.read().users;
	}

	listAudit(): readonly DemoAuditEntry[] {
		return this.read().audit;
	}

	/**
	 * Capture is intake. Record the event and leave the user in place.
	 */
	ignoreUntilFulfilment(event: WebhookEvent<"request_captured">): void {
		this.applyEvent({
			email: this.getUser(event.requestId)?.email,
			eventId: event.eventId,
			eventType: "request_captured",
			requestId: event.requestId,
			successResult: "ignored_until_fulfilment",
		});
	}

	/**
	 * Fulfilment is when DSAR says the request is complete. Delete the demo
	 * user keyed by `event.requestId`.
	 */
	deleteOnFulfilment(event: WebhookEvent<"request_fulfilled">): void {
		this.applyEvent({
			email: this.getUser(event.requestId)?.email,
			eventId: event.eventId,
			eventType: "request_fulfilled",
			requestId: event.requestId,
			successResult: "deleted",
		});
	}

	private applyEvent(input: {
		readonly email: string | undefined;
		readonly eventId: string;
		readonly eventType: DemoAuditEntry["eventType"];
		readonly requestId: string;
		readonly successResult: "deleted" | "ignored_until_fulfilment";
	}): void {
		const snapshot = this.read();
		if (snapshot.processedEventIds.includes(input.eventId)) {
			this.write({
				...snapshot,
				audit: [
					...snapshot.audit,
					{
						eventId: input.eventId,
						eventType: input.eventType,
						requestId: input.requestId,
						result: "already_processed",
					},
				],
			});
			return;
		}

		const processedEventIds = [...snapshot.processedEventIds, input.eventId];
		if (input.successResult === "ignored_until_fulfilment") {
			this.write({
				audit: [
					...snapshot.audit,
					{
						...(input.email ? { email: input.email } : {}),
						eventId: input.eventId,
						eventType: input.eventType,
						requestId: input.requestId,
						result: "ignored_until_fulfilment",
					},
				],
				processedEventIds,
				users: snapshot.users,
			});
			return;
		}

		const user = snapshot.users.find(
			(row) => row.requestId === input.requestId
		);
		if (!user) {
			this.write({
				audit: [
					...snapshot.audit,
					{
						eventId: input.eventId,
						eventType: input.eventType,
						requestId: input.requestId,
						result: "unknown_request",
					},
				],
				processedEventIds,
				users: snapshot.users,
			});
			return;
		}

		this.write({
			audit: [
				...snapshot.audit,
				{
					email: user.email,
					eventId: input.eventId,
					eventType: input.eventType,
					requestId: input.requestId,
					result: "deleted",
				},
			],
			processedEventIds,
			users: snapshot.users.filter((row) => row.requestId !== input.requestId),
		});
	}

	private read(): StoreSnapshot {
		if (!existsSync(this.filePath)) {
			return emptySnapshot();
		}
		return parseSnapshotJson(readFileSync(this.filePath, "utf8"));
	}

	private write(snapshot: StoreSnapshot): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const tempPath = `${this.filePath}.${process.pid}.tmp`;
		writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
		renameSync(tempPath, this.filePath);
	}
}

export const getDemoStore = (): DemoStore => {
	const configuredPath = process.env.DEMO_STORE_PATH?.trim();
	const store = new DemoStore(
		configuredPath && configuredPath.length > 0
			? configuredPath
			: defaultStorePath
	);
	store.ensureInitialized();
	return store;
};

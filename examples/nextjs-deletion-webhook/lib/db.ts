import { DatabaseSync } from "node:sqlite";

import { DemoDatabaseError } from "./errors.ts";
import type { DemoDatabaseOperation } from "./errors.ts";

export { DemoDatabaseError } from "./errors.ts";
export type { DemoDatabaseOperation } from "./errors.ts";

/** Demo user record stored in SQLite. */
export interface DemoUser {
	readonly dsarRequestId: string;
	readonly email: string;
	readonly id: string;
	readonly name: string;
	readonly status: "active";
}

/** Metadata written for each attempted webhook-driven deletion. */
export interface DeletionAuditRecord {
	readonly eventId: string;
	readonly eventType: string;
	readonly idempotencyKey: string;
	readonly locale: string;
	readonly policyVersion: string;
	readonly processedAt: string;
	readonly recordDeleted: boolean;
	readonly requestId: string;
}

/** Input required to delete a demo user and write its audit record. */
export interface DeleteDemoUserInput {
	readonly eventId: string;
	readonly eventType: string;
	readonly idempotencyKey: string;
	readonly locale: string;
	readonly policyVersion: string;
	readonly requestId: string;
}

const requireStringColumn = (
	row: Readonly<Record<string, unknown>>,
	column: string
): string => {
	const value = row[column];
	if (typeof value !== "string" || value.length === 0) {
		throw new DemoDatabaseError(
			"decode",
			new Error(`Column ${column} is not a non-empty string.`)
		);
	}
	return value;
};

const decodeDemoUser = (
	row: Readonly<Record<string, unknown>> | undefined
): DemoUser | undefined => {
	if (!row) {
		return undefined;
	}
	const status = requireStringColumn(row, "status");
	if (status !== "active") {
		throw new DemoDatabaseError(
			"decode",
			new Error(`Unsupported demo user status: ${status}.`)
		);
	}
	return {
		dsarRequestId: requireStringColumn(row, "dsar_request_id"),
		email: requireStringColumn(row, "email"),
		id: requireStringColumn(row, "id"),
		name: requireStringColumn(row, "name"),
		status,
	};
};

const decodeAuditRecord = (
	row: Readonly<Record<string, unknown>> | undefined
): DeletionAuditRecord | undefined => {
	if (!row) {
		return undefined;
	}
	const rawRecordDeleted = row.record_deleted;
	if (rawRecordDeleted !== 0 && rawRecordDeleted !== 1) {
		throw new DemoDatabaseError(
			"decode",
			new Error("Column record_deleted is not a SQLite boolean.")
		);
	}
	return {
		eventId: requireStringColumn(row, "event_id"),
		eventType: requireStringColumn(row, "event_type"),
		idempotencyKey: requireStringColumn(row, "idempotency_key"),
		locale: requireStringColumn(row, "locale"),
		policyVersion: requireStringColumn(row, "policy_version"),
		processedAt: requireStringColumn(row, "processed_at"),
		recordDeleted: rawRecordDeleted === 1,
		requestId: requireStringColumn(row, "request_id"),
	};
};

const executeDatabaseOperation = <T>(
	operation: DemoDatabaseOperation,
	action: () => T
): T => {
	try {
		return action();
	} catch (error) {
		if (error instanceof DemoDatabaseError) {
			throw error;
		}
		throw new DemoDatabaseError(operation, error);
	}
};

/** Small SQLite store used only by the deletion webhook quickstart. */
export class DemoDatabase {
	private readonly database: DatabaseSync;

	constructor(
		filePath = process.env.DEMO_DATABASE_PATH ?? ".demo-users.sqlite"
	) {
		let database: DatabaseSync | undefined;
		try {
			database = new DatabaseSync(filePath);
			database.exec(`
				PRAGMA busy_timeout = 5000;
				PRAGMA journal_mode = WAL;
				CREATE TABLE IF NOT EXISTS demo_users (
					id TEXT PRIMARY KEY,
					dsar_request_id TEXT NOT NULL UNIQUE,
					email TEXT NOT NULL UNIQUE,
					name TEXT NOT NULL,
					status TEXT NOT NULL CHECK (status = 'active')
				);
				CREATE TABLE IF NOT EXISTS deletion_audit (
					event_id TEXT PRIMARY KEY,
					request_id TEXT NOT NULL,
					event_type TEXT NOT NULL,
					idempotency_key TEXT NOT NULL,
					policy_version TEXT NOT NULL,
					locale TEXT NOT NULL,
					record_deleted INTEGER NOT NULL CHECK (record_deleted IN (0, 1)),
					processed_at TEXT NOT NULL
				);
			`);
			this.database = database;
		} catch (error) {
			if (database?.isOpen) {
				database.close();
			}
			throw new DemoDatabaseError("initialize", error);
		}
	}

	private transaction<T>(operation: DemoDatabaseOperation, action: () => T): T {
		return executeDatabaseOperation(operation, () => {
			this.database.exec("BEGIN IMMEDIATE");
			try {
				const result = action();
				this.database.exec("COMMIT");
				return result;
			} catch (error) {
				if (this.database.isTransaction) {
					this.database.exec("ROLLBACK");
				}
				throw error;
			}
		});
	}

	/** Closes the SQLite connection. */
	close(): void {
		executeDatabaseOperation("close", () => {
			if (this.database.isOpen) {
				this.database.close();
			}
		});
	}

	/** Seeds the user-to-DSAR-request mapping used by the smoke test. */
	seed(): readonly DemoUser[] {
		const demoUsers: readonly DemoUser[] = [
			{
				dsarRequestId: "req_smoke_001",
				email: "alex.subject@example.com",
				id: "usr_alex_123",
				name: "Alex Subject",
				status: "active",
			},
			{
				dsarRequestId: "req_other_002",
				email: "jordan.user@example.com",
				id: "usr_jordan_456",
				name: "Jordan User",
				status: "active",
			},
		];
		return this.transaction("seed", () => {
			const insert = this.database.prepare(`
				INSERT INTO demo_users (id, dsar_request_id, email, name, status)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					dsar_request_id = excluded.dsar_request_id,
					email = excluded.email,
					name = excluded.name,
					status = excluded.status
			`);
			for (const user of demoUsers) {
				insert.run(
					user.id,
					user.dsarRequestId,
					user.email,
					user.name,
					user.status
				);
			}
			return demoUsers;
		});
	}

	/** Deletes the user mapped to a DSAR request and commits its audit record atomically. */
	deleteForRequest(input: DeleteDemoUserInput): boolean {
		return this.transaction("delete", () => {
			const existingAudit = decodeAuditRecord(
				this.database
					.prepare("SELECT * FROM deletion_audit WHERE event_id = ?")
					.get(input.eventId)
			);
			if (existingAudit) {
				const isSameDelivery =
					existingAudit.requestId === input.requestId &&
					existingAudit.eventType === input.eventType &&
					existingAudit.idempotencyKey === input.idempotencyKey &&
					existingAudit.policyVersion === input.policyVersion &&
					existingAudit.locale === input.locale;
				if (!isSameDelivery) {
					throw new DemoDatabaseError(
						"delete",
						new Error(
							`Event ${input.eventId} conflicts with its existing audit record.`
						)
					);
				}
				return existingAudit.recordDeleted;
			}

			const result = this.database
				.prepare("DELETE FROM demo_users WHERE dsar_request_id = ?")
				.run(input.requestId);
			const recordDeleted = result.changes > 0;
			this.database
				.prepare(`
					INSERT INTO deletion_audit (
						event_id,
						request_id,
						event_type,
						idempotency_key,
						policy_version,
						locale,
						record_deleted,
						processed_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.run(
					input.eventId,
					input.requestId,
					input.eventType,
					input.idempotencyKey,
					input.policyVersion,
					input.locale,
					recordDeleted ? 1 : 0,
					new Date().toISOString()
				);
			return recordDeleted;
		});
	}

	/** Looks up a demo user by its linked DSAR request ID. */
	findByRequestId(requestId: string): DemoUser | undefined {
		return executeDatabaseOperation("read", () =>
			decodeDemoUser(
				this.database
					.prepare("SELECT * FROM demo_users WHERE dsar_request_id = ?")
					.get(requestId)
			)
		);
	}

	/** Looks up the durable audit record for one webhook event. */
	findAuditByEventId(eventId: string): DeletionAuditRecord | undefined {
		return executeDatabaseOperation("read", () =>
			decodeAuditRecord(
				this.database
					.prepare("SELECT * FROM deletion_audit WHERE event_id = ?")
					.get(eventId)
			)
		);
	}

	/** Counts persisted deletion audit records. */
	countAuditRecords(): number {
		return executeDatabaseOperation("read", () => {
			const row = this.database
				.prepare("SELECT COUNT(*) AS count FROM deletion_audit")
				.get();
			const count = row?.count;
			if (typeof count !== "number") {
				throw new DemoDatabaseError(
					"decode",
					new Error("Audit count is not a number.")
				);
			}
			return count;
		});
	}
}

let dbInstance: DemoDatabase | undefined;

/** Returns the shared demo database instance used by the route. */
export const getDb = (dbPath?: string): DemoDatabase => {
	dbInstance ??= new DemoDatabase(dbPath);
	return dbInstance;
};

/** Closes and clears the shared database instance. */
export const closeDemoDatabase = (): void => {
	const current = dbInstance;
	dbInstance = undefined;
	current?.close();
};

/** Seeds demo users. */
export const seedDemoUsers = (dbPath?: string): readonly DemoUser[] =>
	getDb(dbPath).seed();

/** Deletes the demo user linked to the verified webhook request. */
export const deleteDemoUserForRequest = (input: DeleteDemoUserInput): boolean =>
	getDb().deleteForRequest(input);

/** Finds a demo user by its linked DSAR request ID. */
export const findDemoUserByRequestId = (
	requestId: string,
	dbPath?: string
): DemoUser | undefined => getDb(dbPath).findByRequestId(requestId);

/** Finds the deletion audit record for a webhook event. */
export const findDeletionAuditByEventId = (
	eventId: string,
	dbPath?: string
): DeletionAuditRecord | undefined => getDb(dbPath).findAuditByEventId(eventId);

/** Counts deletion audit records in the demo database. */
export const countDeletionAuditRecords = (dbPath?: string): number =>
	getDb(dbPath).countAuditRecords();

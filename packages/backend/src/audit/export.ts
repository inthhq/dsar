import type { AuditEventCursor, AuditEventRecord } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { RequestValidationError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import { computeAuditHash } from "./hash-chain";

const DEFAULT_TENANT_ID = "tenant-default";
const EXPORT_HARD_CAP = 10_000;
const EXPORT_PAGE_SIZE = 500;

/**
 * Serialised projection of an immutable audit event used for compliance
 * export payloads. Mirrors the public schema in `@dsar/schema`.
 */
export interface ExportedAuditEvent {
	/** Immutable audit event identifier. */
	readonly id: string;
	/** Event-type name (derived from the audit `action`). */
	readonly eventType: string;
	/** Actor or principal responsible for the event. */
	readonly actor: string;
	/** Timestamp when the event was recorded. */
	readonly occurredAt: string;
	/** Tamper-evident chain hash for this event. */
	readonly hash: string;
	/** Hash algorithm identifier used to compute `hash`. */
	readonly hashAlg: string;
	/** Hash of the preceding event in the chain, when present. */
	readonly prevHash?: string;
	/** Monotonic sequence number used for deterministic ordering. */
	readonly sequence: number;
	/** Structured before/after/reason/object payload kept beside the event. */
	readonly metadata: Record<string, unknown>;
	/** Request id this event belongs to. */
	readonly requestId: string;
}

const toExportedEvent = (
	record: AuditEventRecord,
	fallbackRequestId: string
): ExportedAuditEvent => ({
	actor: record.actor,
	eventType: record.action,
	hash: record.hash,
	hashAlg: record.hashAlg,
	id: record.id,
	metadata: {
		after: record.after,
		before: record.before,
		object: record.object,
		reason: record.reason,
	},
	occurredAt: record.createdAt,
	prevHash: record.prevHash,
	requestId: record.requestId ?? fallbackRequestId,
	sequence: record.sequence,
});

const escapeCsvField = (value: string | number | undefined): string => {
	if (value === undefined) {
		return "";
	}
	const text = String(value);
	if (
		text.includes(",") ||
		text.includes('"') ||
		text.includes("\n") ||
		text.includes("\r")
	) {
		return `"${text.replaceAll('"', '""')}"`;
	}
	return text;
};

const toCsvRow = (event: ExportedAuditEvent): string =>
	[
		event.id,
		event.eventType,
		event.actor,
		event.occurredAt,
		event.sequence,
		event.hash,
		event.prevHash,
	]
		.map(escapeCsvField)
		.join(",");

const serializeAuditEvents = (
	events: readonly ExportedAuditEvent[],
	format: "jsonl" | "csv"
): string =>
	format === "jsonl"
		? events.map((event) => JSON.stringify(event)).join("\n")
		: [
				"id,eventType,actor,occurredAt,sequence,hash,prevHash",
				...events.map(toCsvRow),
			].join("\n");

/**
 * Exports audit events for a request as serialised JSONL or CSV.
 *
 * @param input - Export parameters.
 * @param input.requestId - Request whose audit trail is exported.
 * @param input.format - Serialisation format (`"jsonl"` or `"csv"`).
 * @param [input.tenantId] - Tenant scope (defaults to `"tenant-default"`).
 * @returns An `Effect` yielding the event array, the `serialized` string,
 *   the chosen `format`, and the `rootHash` (last event's hash) for chain
 *   verification.
 * @throws {@link RequestValidationError} When the underlying persistence
 *   query or mapping fails.
 */
export const exportAuditEvents = (input: {
	readonly requestId: string;
	readonly format: "jsonl" | "csv";
	readonly tenantId?: string;
}): Effect.Effect<
	{
		readonly requestId: string;
		readonly format: "jsonl" | "csv";
		readonly events: readonly {
			readonly id: string;
			readonly eventType: string;
			readonly actor: string;
			readonly occurredAt: string;
			readonly hash: string;
			readonly hashAlg: string;
			readonly prevHash?: string;
			readonly sequence: number;
			readonly metadata: Record<string, unknown>;
			readonly requestId: string;
		}[];
		readonly rootHash?: string;
		readonly serialized: string;
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* exportAuditEventsProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const records = yield* services.repos.persistence.auditEvents
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		const events = records.map((record) =>
			toExportedEvent(record, input.requestId)
		);
		const serialized = serializeAuditEvents(events, input.format);
		return {
			events,
			format: input.format,
			requestId: input.requestId,
			rootHash: events.at(-1)?.hash,
			serialized,
		};
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: String(error) },
							message: "Failed to export audit events.",
							reasonCode: "INTERNAL_RUNTIME_ERROR",
						})
			)
		)
	);

/**
 * Recomputes hashes for every audit event of a request and reports
 * mismatches against the stored chain.
 *
 * @param input - Verification parameters.
 * @param input.requestId - Request whose audit chain is verified.
 * @param [input.tenantId] - Tenant scope (defaults to `"tenant-default"`).
 * @returns An `Effect` yielding `{ verified, mismatches }` — `verified` is
 *   `true` when every recomputed hash matches, otherwise `mismatches`
 *   contains the divergent `eventId`, `expectedHash`, and `actualHash`.
 * @throws {@link RequestValidationError} When the underlying persistence
 *   query or hash computation fails.
 */
export const verifyAuditChain = (input: {
	readonly requestId: string;
	readonly tenantId?: string;
}): Effect.Effect<
	{
		readonly verified: boolean;
		readonly mismatches: readonly {
			readonly eventId: string;
			readonly expectedHash: string;
			readonly actualHash: string;
		}[];
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* verifyAuditChainProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const records = yield* services.repos.persistence.auditEvents
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		let previousHash: string | undefined;
		const mismatches: {
			eventId: string;
			expectedHash: string;
			actualHash: string;
		}[] = [];

		for (const record of records) {
			const expectedHash = yield* computeAuditHash({
				action: record.action,
				actor: record.actor,
				after: record.after,
				before: record.before,
				createdAt: record.createdAt,
				object: record.object,
				prevHash: previousHash,
				reason: record.reason,
				requestId: record.requestId,
				sequence: record.sequence,
			});
			if (expectedHash !== record.hash) {
				mismatches.push({
					actualHash: record.hash,
					eventId: record.id,
					expectedHash,
				});
			}
			previousHash = record.hash;
		}
		return {
			mismatches,
			verified: mismatches.length === 0,
		};
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: String(error) },
							message: "Failed to verify audit hash chain.",
							reasonCode: "INTERNAL_RUNTIME_ERROR",
						})
			)
		)
	);

/**
 * Exports the tenant-wide audit trail bounded by an inclusive time window.
 *
 * Paginates the underlying audit repository up to {@link EXPORT_HARD_CAP}
 * rows. Beyond the cap, callers must narrow the window with `since`/`until`.
 *
 * @param input - Export parameters.
 * @param input.tenantId - Tenant whose audit trail is exported.
 * @param input.since - Inclusive lower bound (ISO-8601).
 * @param [input.until] - Inclusive upper bound (ISO-8601).
 * @param input.format - Serialisation format (`"jsonl"` or `"csv"`).
 * @returns An `Effect` yielding the event array, the serialised string,
 *   the chosen format, the bounds used, and two chain-verification
 *   anchors: `rootHash` (earliest event in the window, chronologically
 *   first) and `tipHash` (latest event in the window).
 * @throws {@link RequestValidationError} When the export exceeds the row
 *   cap or the underlying persistence query fails.
 */
export const exportAuditEventsTenantWide = (input: {
	readonly tenantId: string;
	readonly since: string;
	readonly until?: string;
	readonly format: "jsonl" | "csv";
}): Effect.Effect<
	{
		readonly format: "jsonl" | "csv";
		readonly since: string;
		readonly until?: string;
		readonly events: readonly ExportedAuditEvent[];
		readonly rootHash?: string;
		readonly tipHash?: string;
		readonly serialized: string;
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* exportAuditEventsTenantWideProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const collected: AuditEventRecord[] = [];
		let cursor: AuditEventCursor | undefined;
		while (collected.length <= EXPORT_HARD_CAP) {
			const page = yield* services.repos.persistence.auditEvents
				.list({
					createdAfter: input.since,
					createdBefore: input.until,
					cursor,
					limit: EXPORT_PAGE_SIZE,
				})
				.pipe(withTenant(input.tenantId));
			collected.push(...page.items);
			if (!page.nextCursor) {
				break;
			}
			cursor = page.nextCursor;
		}
		if (collected.length > EXPORT_HARD_CAP) {
			return yield* Effect.fail(
				new RequestValidationError({
					details: {
						cap: EXPORT_HARD_CAP,
						since: input.since,
						until: input.until,
					},
					message: `Audit export exceeded ${EXPORT_HARD_CAP} rows. Narrow the window with \`since\`/\`until\` and retry.`,
					reasonCode: "REQUEST_VALIDATION_FAILED",
				})
			);
		}
		const events = collected.map((record) =>
			toExportedEvent(record, record.requestId ?? "")
		);
		const serialized = serializeAuditEvents(events, input.format);
		// Persistence returns rows ORDER BY created_at DESC, id DESC, so the
		// last entry is the earliest event in the window (root) and the
		// first entry is the latest (tip).
		return {
			events,
			format: input.format,
			rootHash: events.at(-1)?.hash,
			serialized,
			since: input.since,
			tipHash: events.at(0)?.hash,
			until: input.until,
		};
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: String(error) },
							message: "Failed to export tenant audit events.",
							reasonCode: "INTERNAL_RUNTIME_ERROR",
						})
			)
		)
	);

import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { RequestValidationError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import { computeAuditHash } from "./hash-chain";

const DEFAULT_TENANT_ID = "tenant-default";

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

		const events = records.map((record) => ({
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
			requestId: record.requestId ?? input.requestId,
			sequence: record.sequence,
		}));

		const serialized =
			input.format === "jsonl"
				? events.map((event) => JSON.stringify(event)).join("\n")
				: [
						"id,eventType,actor,occurredAt,sequence,hash,prevHash",
						...events.map(
							(event) =>
								`${event.id},${event.eventType},${event.actor},${event.occurredAt},${event.sequence},${event.hash},${event.prevHash ?? ""}`
						),
					].join("\n");
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

import type { JsonValue } from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { makeRequestId } from "../middleware/auth-context";
import { backendErrorCatalogByCode } from "../types/error-codes";
import { RequestValidationError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import { computeAuditHash } from "./hash-chain";

const DEFAULT_TENANT_ID = "tenant-default";

const firstStackFrame = (stack: string | undefined): string => {
	if (!stack) {
		return "";
	}
	const lines = stack.split("\n");
	const frame = lines.find((line) => line.trimStart().startsWith("at "));
	return frame ? frame.trim() : "";
};

const toCauseDetails = (error: unknown): Readonly<Record<string, string>> => {
	if (error instanceof Error) {
		const maybeCode = (error as Error & { code?: unknown }).code;
		const code = typeof maybeCode === "string" ? maybeCode : "unknown";
		return {
			code,
			message: error.message,
			name: error.name,
			stack: firstStackFrame(error.stack),
		};
	}
	if (typeof error === "object" && error !== null) {
		return {
			code: "code" in error ? String(error.code) : "unknown",
			message: String("message" in error ? error.message : "Unknown failure"),
			name: String("name" in error ? error.name : "UnknownError"),
			stack: firstStackFrame(
				"stack" in error ? String(error.stack) : undefined
			),
		};
	}
	return {
		code: "unknown",
		message: String(error),
		name: "UnknownError",
		stack: "",
	};
};

/**
 * Input contract for appending an immutable audit event.
 *
 * Use this shape to capture who acted, what changed, and why, so downstream
 * audit export and hash-chain verification remain deterministic.
 */
export interface AppendAuditInput {
	/**
	 * Request identifier for request-scoped events.
	 *
	 * Omit for tenant/system-level events that are not tied to a single request.
	 */
	readonly requestId?: string;
	/** Principal or service responsible for the audited action. */
	readonly actor: string;
	/** Domain action verb (for example `captured`, `verified`, `fulfilled`). */
	readonly action: string;
	/** Domain object affected by the action (for example `request`, `artifact`). */
	readonly object: string;
	/** State snapshot before the action was applied. */
	readonly before: JsonValue;
	/** State snapshot after the action was applied. */
	readonly after: JsonValue;
	/**
	 * Structured rationale/context for the change.
	 *
	 * This payload is merged with request-correlation metadata before persistence.
	 */
	readonly reason: JsonValue;
	/** ISO timestamp for when the event occurred. Defaults to current time. */
	readonly createdAt?: string;
	/** Tenant scope used for persistence. Defaults to `tenant-default`. */
	readonly tenantId?: string;
}

/**
 * Appends an immutable, hash-chained audit event to the persistence layer.
 *
 * Computes a SHA-256 hash linking to the previous event for the same request,
 * increments the sequence number, and persists the record within the resolved
 * tenant scope. Hash computation can fail when the Web Crypto API is
 * unavailable; such failures are mapped to {@link RequestValidationError}.
 * When the crypto API is absent the `hash` degrades to
 * `"sha256_unavailable"`.
 *
 * @param input - Audit event fields described by {@link AppendAuditInput},
 *   including `requestId`, `action`, `actor`, `object`, and required
 *   `before`/`after` snapshots.
 * @returns An `Effect` yielding `{ id, hash, sequence }` of the persisted
 *   event.
 * @throws {@link RequestValidationError} When hash computation fails or
 *   when the persistence write fails (reason code `INTERNAL_RUNTIME_ERROR`).
 */
export const appendAuditEvent = (
	input: AppendAuditInput
): Effect.Effect<
	{
		readonly id: string;
		readonly hash: string;
		readonly sequence: number;
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* appendAuditEventProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const createdAt = input.createdAt ?? new Date().toISOString();
		const correlationId = services.requestContext.requestId;
		const prior =
			typeof input.requestId === "string" && input.requestId.length > 0
				? yield* services.repos.persistence.auditEvents
						.listByRequestId(input.requestId)
						.pipe(withTenant(tenantId))
				: [];
		const previous = prior.at(-1);
		const sequence = (previous?.sequence ?? 0) + 1;
		const hash = yield* computeAuditHash({
			action: input.action,
			actor: input.actor,
			after: input.after,
			before: input.before,
			createdAt,
			object: input.object,
			prevHash: previous?.hash,
			reason: {
				...(typeof input.reason === "object" &&
				input.reason !== null &&
				!Array.isArray(input.reason)
					? input.reason
					: { value: input.reason }),
				correlationId,
			},
			requestId: input.requestId,
			sequence,
		});

		const id = makeRequestId();
		yield* services.repos.persistence.auditEvents
			.append({
				action: input.action,
				actor: input.actor,
				after: input.after,
				before: input.before,
				createdAt,
				hash,
				hashAlg: "sha256",
				id,
				object: input.object,
				prevHash: previous?.hash,
				reason: {
					...(typeof input.reason === "object" &&
					input.reason !== null &&
					!Array.isArray(input.reason)
						? input.reason
						: { value: input.reason }),
					correlationId,
				},
				requestId: input.requestId,
				sequence,
			})
			.pipe(withTenant(tenantId));

		return { hash, id, sequence };
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: toCauseDetails(error) },
							message: "Failed to append immutable audit event.",
							reasonCode: backendErrorCatalogByCode.INTERNAL_RUNTIME_ERROR.code,
						})
			)
		)
	);

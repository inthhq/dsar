import * as Effect from "effect/Effect";

import { captureRequestLifecycle } from "../lifecycle/service";
import type { RequestValidationError } from "../types/errors";
import type { RuntimeServicesTag } from "../types/runtime";
import { accepted } from "./helpers";

/**
 * Tenant/workspace routing target resolved by an inbound adapter.
 */
export interface InboundCaptureRoute {
	/** Jurisdiction used for request policy selection. */
	readonly jurisdiction: string;
	/** Tenant that owns the captured request. */
	readonly tenantId: string;
	/** Optional tenant-internal workspace target. */
	readonly workspaceId?: string;
}

/**
 * Requestor information extracted from an inbound adapter payload.
 */
export interface InboundCaptureRequestor {
	/** Subject email address when the inbound channel provides one. */
	readonly email?: string;
	/** Subject display name when the inbound channel provides one. */
	readonly name?: string;
	/** Fixed requestor classification for inbound captures. */
	readonly type: "subject";
}

/**
 * Canonical input passed from inbound adapters into lifecycle request capture.
 */
export interface InboundCaptureInput {
	/** Actor id used for audit and lifecycle actions. */
	readonly actor: string;
	/** Idempotency key for deduplicating repeated inbound deliveries. */
	readonly idempotencyKey: string;
	/** Authoritative timestamp for when the inbound event was received. */
	readonly receivedAt: string;
	/** Tenant/workspace route resolved by the inbound adapter. */
	readonly route: InboundCaptureRoute;
	/** Stable provider-specific source identifier for the inbound event. */
	readonly sourceId: string;
	/** Intake source payload mapped into the lifecycle request shape. */
	readonly intakeSource: {
		readonly channel: string;
		readonly contact?: string;
		readonly rawContextRef?: string;
		readonly rawText: string;
		readonly receivedAt: string;
		readonly type: "inbound_email" | "slack";
	};
	/** Optional normalized requestor details extracted by the inbound adapter. */
	readonly requestor?: InboundCaptureRequestor;
	/** Optional DSAR intent classification metadata from the inbound adapter. */
	readonly intent?: {
		readonly isDsar: boolean;
		readonly reason?: string;
	};
	/** Optional response metadata echoed back in the accepted response body. */
	readonly response?: Readonly<Record<string, unknown>>;
}

/**
 * Captures an inbound adapter event into the request lifecycle service.
 *
 * @param input - Canonical inbound capture input resolved by an adapter.
 * @returns An accepted response that either captures or ignores the inbound event.
 */
export const captureInboundRequest = (
	input: InboundCaptureInput
): Effect.Effect<Response, RequestValidationError, RuntimeServicesTag> =>
	Effect.gen(function* captureInboundRequestProgram() {
		if (input.intent?.isDsar === false) {
			return accepted({
				reason: input.intent.reason ?? "non-dsar",
				sourceId: input.sourceId,
				status: "ignored_non_dsar",
			});
		}
		const created = yield* captureRequestLifecycle({
			actor: input.actor,
			idempotencyKey: input.idempotencyKey,
			payload: {
				intakeSource: {
					channel: input.intakeSource.channel,
					contact: input.intakeSource.contact,
					rawContextRef: input.intakeSource.rawContextRef,
					rawText: input.intakeSource.rawText,
					receivedAt: input.intakeSource.receivedAt,
					type: input.intakeSource.type,
				},
				jurisdiction: input.route.jurisdiction,
				requestor: input.requestor,
			},
			tenantId: input.route.tenantId,
			workspaceId: input.route.workspaceId,
		});
		return accepted({
			...input.response,
			id: created.id,
			jurisdiction: input.route.jurisdiction,
			receivedAt: created.receivedAt,
			sourceId: input.sourceId,
			status: "captured",
			tenantId: input.route.tenantId,
			workspaceId: input.route.workspaceId,
		});
	});

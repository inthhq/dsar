import type { AdapterCapability } from "./contract";
import type { AdapterInvocationError } from "./errors";

/**
 * Normalized operational event emitted when an adapter invocation fails.
 */
export interface AdapterOperationalEvent {
	/** Domain event type identifier. */
	readonly eventType: "adapter_failure";
	/** Adapter key that emitted the failure event. */
	readonly adapterKey: string;
	/** Adapter capability handled by this contract entry. */
	readonly capability: AdapterCapability;
	/** Whether the operation can be retried safely. */
	readonly retriable: boolean;
	/** Normalized category used for routing and observability. */
	readonly category: string;
	/** Human-readable message describing the event or failure. */
	readonly message: string;
	/** Timestamp when this event occurred. */
	readonly occurredAt: string;
	/** Owning request identifier for this record. */
	readonly requestId?: string;
}

/**
 * Maps an adapter invocation error into an operational event payload.
 *
 * @param input - Adapter failure details and optional request correlation id.
 * @returns Normalized adapter operational event.
 */
export const toAdapterFailureEvent = (input: {
	readonly error: AdapterInvocationError;
	readonly requestId?: string;
}): AdapterOperationalEvent => ({
	adapterKey: input.error.adapterKey,
	capability: input.error.capability,
	category: input.error.category,
	eventType: "adapter_failure",
	message: input.error.message,
	occurredAt: new Date().toISOString(),
	requestId: input.requestId,
	retriable: input.error.retriable,
});

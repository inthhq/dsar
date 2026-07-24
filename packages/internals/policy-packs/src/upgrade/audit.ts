import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type { AuditEvent } from "../types/domain";

/**
 * Service contract for policy-pack upgrade audit events.
 *
 * @public
 */
export interface PolicyAuditService {
	/**
	 * Appends an immutable policy-audit event.
	 *
	 * @param event - Audit event to record.
	 * @returns An {@link Effect.Effect} that resolves once the event is stored.
	 */
	readonly append: (event: AuditEvent) => Effect.Effect<void>;
	/**
	 * Lists policy-audit events in append order.
	 *
	 * @returns An {@link Effect.Effect} yielding the recorded events as a
	 *   readonly array.
	 */
	readonly list: () => Effect.Effect<readonly AuditEvent[]>;
}

/**
 * Effect service tag for injecting a {@link PolicyAuditService}
 * implementation.
 *
 * @public
 */
export class PolicyAudit extends Context.Service<
	PolicyAudit,
	PolicyAuditService
>()("PolicyAudit") {}

/**
 * In-memory {@link PolicyAudit} layer backed by a `Ref`. State is ephemeral
 * and not persisted across process restarts — suitable for tests and
 * short-lived evaluation contexts.
 *
 * @public
 */
export const PolicyAuditLive = Layer.effect(PolicyAudit)(
	Effect.gen(function* PolicyAuditLive() {
		const store = yield* Ref.make<readonly AuditEvent[]>([]);

		return {
			append: (event) => Ref.update(store, (current) => [...current, event]),
			list: () => Ref.get(store),
		} satisfies PolicyAuditService;
	})
);

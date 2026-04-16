import { asObject } from "@dsar/guards";
/* oxlint-disable complexity */
/* oxlint-disable max-statements */
import type {
	CreateRequestInput,
	CreateRequestTimelineEventInput,
	RequestTimelineEventRecord,
	UpdateRequestInput,
} from "@dsar/persistence";
import { withTenant } from "@dsar/persistence";
import * as Effect from "effect/Effect";

import { appendAuditEvent } from "../audit/service";
import { deriveLifecycleNotificationDrafts } from "../events/contracts";
import { makeRequestId } from "../middleware/auth-context";
import {
	emitNotificationEvent,
	makeNotificationDraft,
} from "../services/notifications/service";
import type {
	InvalidLifecycleTransitionError,
	MissingLifecycleRationaleError,
} from "../types/errors";
import { RequestValidationError } from "../types/errors";
import { RuntimeServicesTag } from "../types/runtime";
import {
	addDays,
	dedupeClockSegments,
	MS_PER_DAY,
	recomputeClock,
	toEventType,
} from "./clock";
import { isJsonObject, toJsonValue } from "./json";
import type { JsonValue } from "./json";
import {
	DEFAULT_TENANT_ID,
	enforcePolicyDecision,
	getLocale,
	getPolicyVersion,
	getTenantId,
	toAiAuditMetadata,
} from "./policy";
import { applyLifecycleTransition } from "./state-machine";
import type { LifecycleAction } from "./state-machine";

const nowIso = () => new Date().toISOString();

/**
 * Captures the initial lifecycle state for an intake payload and persists
 * timeline/audit records.
 *
 * @param input - Intake envelope:
 *   - `payload` — raw DSAR intake body (must contain `intakeSource.receivedAt`).
 *   - `actor` — identifier of the user or system initiating the capture.
 *   - `tenantId` — optional tenant override; resolved as `input.tenantId` →
 *     `payload.tenantId` → default tenant.
 *   - `workspaceId` — optional workspace for multi-workspace deployments.
 *   - `idempotencyKey` — optional key for deduplication of repeated captures.
 * @returns An effect yielding the persisted request summary (`id`, `status`,
 *   `receivedAt`, `dueAt`). Fails with {@link RequestValidationError} when the
 *   payload is malformed. Side effects: persists the request, appends timeline
 *   events, records audit entries, and emits a clock segment.
 */
export const captureRequestLifecycle = (input: {
	readonly payload: unknown;
	readonly actor: string;
	readonly tenantId?: string;
	readonly workspaceId?: string;
	readonly idempotencyKey?: string;
}): Effect.Effect<
	{
		readonly id: string;
		readonly status: string;
		readonly receivedAt: string;
		readonly dueAt: string;
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* captureRequestLifecycleProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const { persistence } = services.repos;
		const payloadObject = asObject(input.payload);
		const intakeSource = asObject(payloadObject?.intakeSource);
		const receivedAtCandidate = intakeSource?.receivedAt;
		if (typeof receivedAtCandidate !== "string") {
			return yield* Effect.fail(
				new RequestValidationError({
					message: "Request capture requires intakeSource.receivedAt.",
					reasonCode: "REQUEST_VALIDATION_FAILED",
				})
			);
		}
		const requestId = makeRequestId();
		const createdAt = nowIso();
		const tenantId = input.tenantId ?? getTenantId(input.payload);
		if (input.idempotencyKey) {
			const existingRequests = yield* persistence.requests
				.list()
				.pipe(withTenant(tenantId));
			for (const existing of existingRequests) {
				const capturePayload = asObject(existing.capture);
				const existingIdempotencyKey = capturePayload?.idempotencyKey;
				if (existingIdempotencyKey === input.idempotencyKey) {
					return {
						dueAt: existing.dueAt,
						id: existing.id,
						receivedAt: existing.receivedAt,
						status: existing.status,
					};
				}
			}
		}
		const capture: JsonValue = {
			...(isJsonObject(payloadObject) ? payloadObject : {}),
			idempotencyKey: input.idempotencyKey ?? null,
		};
		const policyObj = asObject(payloadObject?.policy);
		const rawDeadlineDays = policyObj?.responseDeadlineDays;
		const responseDeadlineDays =
			typeof rawDeadlineDays === "number" && Number.isFinite(rawDeadlineDays)
				? Math.min(365, Math.max(1, Math.floor(rawDeadlineDays)))
				: 30;
		const createInput: CreateRequestInput = {
			appeals: [],
			authority:
				asObject(payloadObject?.authority) === undefined
					? { status: "not_required" }
					: toJsonValue(payloadObject?.authority, {
							status: "not_required",
						}),
			capture,
			clockMode: "receipt",
			dueAt: addDays(receivedAtCandidate, responseDeadlineDays),
			id: requestId,
			receivedAt: receivedAtCandidate,
			requestor:
				asObject(payloadObject?.requestor) === undefined
					? { type: "subject" }
					: toJsonValue(payloadObject?.requestor, {
							type: "subject",
						}),
			status: "captured",
		};

		const request = yield* persistence.requests
			.create(createInput)
			.pipe(withTenant(tenantId));
		const eventId = makeRequestId();
		const captureEvent: CreateRequestTimelineEventInput = {
			createdAt,
			eventType: "captured",
			id: eventId,
			payload: {
				actor: input.actor,
				intakeSource: toJsonValue(payloadObject?.intakeSource, null),
			},
			requestId,
		};
		yield* persistence.timeline.append(captureEvent).pipe(withTenant(tenantId));
		const aiAudit = toAiAuditMetadata({
			aiEnabled: services.config.aiEnabled,
			payload: input.payload,
		});
		yield* appendAuditEvent({
			action: "request_captured",
			actor: input.actor,
			after: {
				dueAt: request.dueAt,
				status: request.status,
			},
			before: {
				status: "none",
			},
			object: "request",
			reason: {
				ai: aiAudit,
				intakeSource: toJsonValue(payloadObject?.intakeSource, null),
				policyVersion: getPolicyVersion(payloadObject),
			},
			requestId,
			tenantId,
		});
		yield* emitNotificationEvent({
			draft: makeNotificationDraft({
				eventType: "request_captured",
				locale: getLocale(payloadObject),
				payload: {
					action: "capture",
					dueAt: request.dueAt,
					status: request.status,
				},
				policyVersion: getPolicyVersion(payloadObject),
				requestId,
			}),
			idempotencyKey: `capture:${eventId}`,
			tenantId,
			workspaceId: input.workspaceId,
		});
		const captureEventRecord: RequestTimelineEventRecord = {
			...captureEvent,
			tenantId,
		};
		const computed = yield* recomputeClock({
			actor: input.actor,
			now: createdAt,
			persistedSegments: [],
			request,
			timelineEvents: [captureEventRecord],
		});
		for (const segment of dedupeClockSegments(
			computed.segments,
			[],
			request.id,
			eventId
		)) {
			yield* persistence.clockSegments
				.append(segment)
				.pipe(withTenant(tenantId));
		}
		yield* persistence.requests
			.update(request.id, {
				dueAt: computed.finalDueAt,
				updatedAt: createdAt,
			})
			.pipe(withTenant(tenantId));

		return {
			dueAt: computed.finalDueAt,
			id: request.id,
			receivedAt: computed.receivedAt,
			status: request.status,
		};
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: String(error) },
							message: "Failed to capture request lifecycle state.",
							reasonCode: "INTERNAL_RUNTIME_ERROR",
						})
			)
		)
	);

/**
 * Applies a lifecycle transition to an existing request and recomputes
 * legal-clock deadlines.
 *
 * @param input - Transition envelope:
 *   - `requestId` — ID of the request to transition.
 *   - `action` — the {@link LifecycleAction} to apply (e.g. `"extension"`,
 *     `"close"`).
 *   - `actor` — identifier of the user or system performing the action.
 *   - `rationale` — explanation required for certain transitions.
 *   - `additionalDays` — extra calendar days when extending a deadline.
 *   - `idempotencyKey` — optional key for deduplication.
 *   - `tenantId` / `workspaceId` — optional scoping overrides.
 * @returns An effect yielding the updated request summary (`id`, `status`,
 *   `dueAt`). Fails with {@link RequestValidationError} on internal
 *   persistence or runtime failures,
 *   {@link InvalidLifecycleTransitionError} if the transition is not
 *   allowed from the current state, or
 *   {@link MissingLifecycleRationaleError} if a rationale is required but
 *   absent. Side effects: updates the request record, appends timeline
 *   and audit entries, and may emit new clock segments.
 */
export const transitionRequestLifecycle = (input: {
	readonly requestId: string;
	readonly action: LifecycleAction;
	readonly actor: string;
	readonly rationale?: string;
	readonly additionalDays?: number;
	readonly idempotencyKey?: string;
	readonly tenantId?: string;
	readonly workspaceId?: string;
}): Effect.Effect<
	{
		readonly id: string;
		readonly status: string;
		readonly dueAt: string;
	},
	| RequestValidationError
	| InvalidLifecycleTransitionError
	| MissingLifecycleRationaleError,
	RuntimeServicesTag
> =>
	Effect.gen(function* transitionRequestLifecycleProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const { persistence } = services.repos;
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const current = yield* persistence.requests
			.getById(input.requestId)
			.pipe(withTenant(tenantId));
		if (input.idempotencyKey) {
			const existingEvents = yield* persistence.timeline
				.listByRequestId(input.requestId)
				.pipe(withTenant(tenantId));
			const duplicate = existingEvents.some((event) => {
				const payload = asObject(event.payload);
				return payload?.idempotencyKey === input.idempotencyKey;
			});
			if (duplicate) {
				return {
					dueAt: current.dueAt,
					id: current.id,
					status: current.status,
				};
			}
		}
		yield* enforcePolicyDecision(current, input.action);
		const transition = yield* applyLifecycleTransition({
			action: input.action,
			currentStatus: current.status,
			rationale: input.rationale,
			requestId: input.requestId,
		});
		const occurredAt = nowIso();
		const eventId = makeRequestId();
		const eventPayload: JsonValue = {
			action: input.action,
			actor: input.actor,
			additionalDays: input.additionalDays ?? 0,
			idempotencyKey: input.idempotencyKey ?? null,
			rationale: input.rationale ?? null,
		};
		const eventType = toEventType(input.action);
		yield* persistence.timeline
			.append({
				createdAt: occurredAt,
				eventType,
				id: eventId,
				payload: eventPayload,
				requestId: input.requestId,
			})
			.pipe(withTenant(tenantId));
		const timeline = yield* persistence.timeline
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		const existingSegments = yield* persistence.clockSegments
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		const computed = yield* recomputeClock({
			actor: input.actor,
			now: occurredAt,
			persistedSegments: existingSegments,
			request: current,
			timelineEvents: timeline,
		});
		for (const segment of dedupeClockSegments(
			computed.segments,
			existingSegments,
			input.requestId,
			eventId
		)) {
			yield* persistence.clockSegments
				.append(segment)
				.pipe(withTenant(tenantId));
		}
		const patch: UpdateRequestInput = {
			dueAt: computed.finalDueAt,
			status: transition.to,
			updatedAt: occurredAt,
		};
		const updated = yield* persistence.requests
			.update(input.requestId, patch)
			.pipe(withTenant(tenantId));
		const aiAudit = toAiAuditMetadata({
			aiEnabled: services.config.aiEnabled,
			payload: eventPayload,
		});
		yield* appendAuditEvent({
			action: `request_${input.action}`,
			actor: input.actor,
			after: {
				dueAt: updated.dueAt,
				status: transition.to,
			},
			before: {
				dueAt: current.dueAt,
				status: transition.from,
			},
			object: "request",
			reason: {
				ai: aiAudit,
				idempotencyKey: input.idempotencyKey ?? null,
				rationale: input.rationale ?? null,
			},
			requestId: input.requestId,
			tenantId,
		});
		const notificationDrafts = deriveLifecycleNotificationDrafts({
			action: input.action,
			dueAt: updated.dueAt,
			from: transition.from,
			locale: services.config.defaultLocale,
			policyVersion: getPolicyVersion(asObject(current.capture)),
			rationale: input.rationale,
			requestId: input.requestId,
			to: transition.to,
		});
		for (const draft of notificationDrafts) {
			yield* emitNotificationEvent({
				draft,
				idempotencyKey: `${input.idempotencyKey ?? eventId}:${draft.eventType}`,
				tenantId,
				workspaceId: input.workspaceId,
			});
		}
		return {
			dueAt: updated.dueAt,
			id: updated.id,
			status: updated.status,
		};
	}).pipe(
		Effect.catchTags({
			InvalidLifecycleTransitionError: (error) => Effect.fail(error),
			MissingLifecycleRationaleError: (error) => Effect.fail(error),
			RequestValidationError: (error) => Effect.fail(error),
		}),
		Effect.catch((error) =>
			Effect.fail(
				new RequestValidationError({
					details: { cause: String(error) },
					message: "Failed to apply lifecycle transition.",
					reasonCode: "INTERNAL_RUNTIME_ERROR",
				})
			)
		)
	);

/**
 * Computes a human-readable legal-clock explanation for a request.
 *
 * @param input - Query envelope:
 *   - `requestId` — ID of the request whose clock to explain.
 *   - `actor` — identifier of the user requesting the explanation.
 *   - `tenantId` — optional tenant scope; falls back to the default tenant.
 * @returns An effect yielding a detailed clock breakdown including
 *   `policyVersion`, `policyPack`, `baseDeadline`, `finalDueAt`, any
 *   `pauses` (with reason and duration), `extensions` (with additional
 *   days and justification), and the full `clock` segment history.
 *   Read-only — no persistence side effects.
 */
export const explainRequestClock = (input: {
	readonly requestId: string;
	readonly actor: string;
	readonly tenantId?: string;
}): Effect.Effect<
	{
		readonly requestId: string;
		readonly policyVersion: string;
		readonly policyPack: string;
		readonly baseDeadline: string;
		readonly finalDueAt: string;
		readonly pauses: readonly {
			readonly reason: string;
			readonly duration: string;
		}[];
		readonly extensions: readonly {
			readonly additionalDays: number;
			readonly justification: string;
		}[];
		readonly clock: {
			readonly clockMode: "receipt" | "verification_complete";
			readonly dueAt: string;
			readonly receivedAt: string;
			readonly segments: readonly {
				readonly from: string;
				readonly to?: string;
				readonly reason: string;
				readonly countsTowardDeadline: boolean;
				readonly policyVersion: string;
				readonly actor?: string;
			}[];
		};
		readonly decision?: unknown;
		readonly requiredActions?: unknown;
		readonly requiredNotices?: unknown;
		readonly explainabilityTrace?: unknown;
		readonly matchedRuleIds?: unknown;
	},
	RequestValidationError,
	RuntimeServicesTag
> =>
	Effect.gen(function* explainRequestClockProgram() {
		const services = yield* Effect.service(RuntimeServicesTag);
		const { persistence } = services.repos;
		const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
		const request = yield* persistence.requests
			.getById(input.requestId)
			.pipe(withTenant(tenantId));
		const timeline = yield* persistence.timeline
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		const persistedSegments = yield* persistence.clockSegments
			.listByRequestId(input.requestId)
			.pipe(withTenant(tenantId));
		const computed = yield* recomputeClock({
			actor: input.actor,
			now: nowIso(),
			persistedSegments,
			request,
			timelineEvents: timeline,
		});
		const pauseSummaries = computed.pauses.map((pause) => {
			const durationMs =
				new Date(pause.to).getTime() - new Date(pause.from).getTime();
			const durationDays = Math.max(0, durationMs / MS_PER_DAY);
			return {
				duration: `${Math.round(durationDays * 100) / 100} days`,
				reason: pause.reason,
			};
		});
		const extensionDays = computed.extensionDaysApplied;
		const capture = asObject(request.capture);
		const storedEvaluation = asObject(capture?.policyEvaluation);
		return {
			baseDeadline: computed.baseDueAt,
			clock: {
				clockMode: computed.clockMode,
				dueAt: computed.finalDueAt,
				receivedAt: computed.receivedAt,
				segments:
					persistedSegments.length > 0
						? persistedSegments.map((segment) => ({
								actor: segment.actor,
								countsTowardDeadline: segment.countsTowardDeadline,
								from: segment.from,
								policyVersion: segment.policyVersion,
								reason: segment.reason,
								to: segment.to,
							}))
						: computed.segments,
			},
			decision: storedEvaluation?.decision,
			explainabilityTrace: storedEvaluation?.explainabilityTrace,
			extensions:
				extensionDays > 0
					? [
							{
								additionalDays: extensionDays,
								justification: "policy_extension",
							},
						]
					: [],
			finalDueAt: computed.finalDueAt,
			matchedRuleIds: storedEvaluation?.matchedRuleIds,
			pauses: pauseSummaries,
			policyPack: computed.policyPack,
			policyVersion: computed.policyVersion,
			requestId: input.requestId,
			requiredActions: storedEvaluation?.requiredActions,
			requiredNotices: storedEvaluation?.requiredNotices,
		};
	}).pipe(
		Effect.catch((error) =>
			Effect.fail(
				error instanceof RequestValidationError
					? error
					: new RequestValidationError({
							details: { cause: String(error) },
							message: "Failed to explain request legal clock.",
							reasonCode: "INTERNAL_RUNTIME_ERROR",
						})
			)
		)
	);

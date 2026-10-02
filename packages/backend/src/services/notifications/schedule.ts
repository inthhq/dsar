/**
 * Default outbound webhook retry delays after consecutive failures:
 * 1m, 5m, 30m, 2h, 6h, 24h. Exhaustion marks the job `dead`.
 */
export const DEFAULT_WEBHOOK_RETRY_SCHEDULE_MS = [
	60_000,
	5 * 60_000,
	30 * 60_000,
	2 * 60 * 60_000,
	6 * 60 * 60_000,
	24 * 60 * 60_000,
] as const;

/** Timeline event type written for each outbound webhook attempt. */
export const WEBHOOK_DELIVERY_ATTEMPTED_EVENT_TYPE =
	"webhook_delivery_attempted";

/** Default worker poll interval between due-job scans. */
export const WEBHOOK_RETRY_WORKER_POLL_MS = 5000;

/**
 * Resolves max attempts and backoff delays for a webhook endpoint.
 *
 * `retryMaxAttempts` caps the schedule. The schedule length plus the first
 * immediate attempt is the other cap, so a six-delay schedule yields at most
 * seven sends.
 *
 * @param input - Configured attempt cap and optional delay schedule.
 * @returns Effective max attempts and delay list in milliseconds.
 */
export const resolveWebhookRetryPolicy = (input: {
	readonly retryMaxAttempts: number;
	readonly retryScheduleMs?: readonly number[];
}): {
	readonly maxAttempts: number;
	readonly scheduleMs: readonly number[];
} => {
	const scheduleMs =
		input.retryScheduleMs && input.retryScheduleMs.length > 0
			? input.retryScheduleMs
			: DEFAULT_WEBHOOK_RETRY_SCHEDULE_MS;
	const configuredMax = Math.max(1, Math.floor(input.retryMaxAttempts));
	return {
		maxAttempts: Math.min(configuredMax, scheduleMs.length + 1),
		scheduleMs,
	};
};

/**
 * Delay to wait after a completed failed attempt before the next send.
 *
 * @param scheduleMs - Backoff delays indexed from the first failure.
 * @param completedAttempt - Attempt number that just failed, starting at 1.
 * @returns Delay in milliseconds, or `undefined` when the schedule is exhausted.
 */
export const delayAfterAttemptMs = (
	scheduleMs: readonly number[],
	completedAttempt: number
): number | undefined => scheduleMs[completedAttempt - 1];

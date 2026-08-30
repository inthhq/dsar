/* oxlint-disable max-statements, promise/avoid-new, promise/no-multiple-resolved */
import type {
	ApiClient,
	CommandDefinition,
	CommandExecutionContext,
} from "../types";

const DEFAULT_INTERVAL_MS = 2000;
const POLL_PAGE_SIZE = 200;

interface AuditTailEvent {
	readonly id: string;
	readonly action: string;
	readonly actor: string;
	readonly createdAt: string;
	readonly object: string;
	readonly requestId?: string;
	readonly sequence: number;
}

interface AuditListEnvelope {
	readonly data?: {
		readonly items?: readonly AuditTailEvent[];
		readonly pagination?: {
			readonly limit: number;
			readonly nextCursor?: string;
		};
	};
}

const POLL_DRAIN_PAGE_CAP = 50;

const requireFlag = (
	flags: Readonly<Record<string, string>>,
	key: string,
	message: string
): string => {
	const value = flags[key];
	if (!value) {
		throw new Error(message);
	}
	return value;
};

const parseIntegerFlag = (
	flags: Readonly<Record<string, string>>,
	key: string,
	fallback: number
): number => {
	const raw = flags[key];
	if (!raw) {
		return fallback;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid --${key}: must be a positive integer.`);
	}
	return parsed;
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> => {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => {
		const state: { settled: boolean; timer?: ReturnType<typeof setTimeout> } = {
			settled: false,
		};
		const finish = () => {
			if (state.settled) {
				return;
			}
			state.settled = true;
			signal.removeEventListener("abort", finish);
			if (state.timer !== undefined) {
				clearTimeout(state.timer);
			}
			resolve();
		};
		state.timer = setTimeout(finish, ms);
		signal.addEventListener("abort", finish, { once: true });
	});
};

const formatLine = (event: AuditTailEvent, output: "json" | "text"): string => {
	if (output === "json") {
		return JSON.stringify(event);
	}
	return `[${event.createdAt}] ${event.actor} ${event.action} ${event.object}${
		event.requestId ? ` request=${event.requestId}` : ""
	}`;
};

/**
 * Drains every page of `/audit` matching the current `created_after`
 * watermark, returning events in ascending creation order. Following
 * `nextCursor` here is what prevents a burst larger than
 * {@link POLL_PAGE_SIZE} from silently dropping the older tail of the
 * burst on the next iteration (the watermark would otherwise jump over
 * unseen events).
 */
const pollOnce = async (
	api: ApiClient,
	requestId: string,
	createdAfter: string | undefined,
	limit: number
): Promise<readonly AuditTailEvent[]> => {
	const collected: AuditTailEvent[] = [];
	let cursor: string | undefined;
	let pages = 0;
	do {
		const response = (await api.invoke({
			method: "GET",
			path: "/audit",
			query: {
				created_after: createdAfter,
				cursor,
				limit: String(limit),
				request_id: requestId,
			},
		})) as AuditListEnvelope;
		const items = response.data?.items ?? [];
		collected.push(...items);
		cursor = response.data?.pagination?.nextCursor;
		pages += 1;
		if (pages >= POLL_DRAIN_PAGE_CAP) {
			break;
		}
	} while (cursor);
	return collected.toSorted((left, right) => {
		const order = left.createdAt.localeCompare(right.createdAt);
		return order === 0 ? left.sequence - right.sequence : order;
	});
};

/**
 * Runs the `dsar audit tail` polling loop, emitting newly-observed events
 * to {@link CommandExecutionContext.writeLine} until cancelled.
 *
 * Exits cleanly when:
 *   - `signal` aborts (SIGINT in production, AbortController in tests), or
 *   - `--max-polls=<n>` reached (test-only bound).
 *
 * @param ctx - Command execution context carrying parsed flags, the API
 *   client used to invoke `/audit`, and the writeLine sink for emitted
 *   events.
 * @param signal - Abort signal used to stop polling gracefully (wired to
 *   SIGINT at the binary entry point, or to a test-controlled
 *   `AbortController` from unit tests).
 * @returns A summary of the run: the number of `polls` performed, the
 *   count of unique events `emitted`, and the `requestId` that was tailed.
 */
export const runAuditTailLoop = async (
	ctx: CommandExecutionContext,
	signal: AbortSignal
): Promise<{
	readonly polls: number;
	readonly emitted: number;
	readonly requestId: string;
}> => {
	const requestId = requireFlag(
		ctx.input.flags,
		"request",
		"Missing required --request for audit tail command."
	);
	const intervalMs = parseIntegerFlag(
		ctx.input.flags,
		"interval",
		DEFAULT_INTERVAL_MS
	);
	const maxPolls = ctx.input.flags["max-polls"]
		? parseIntegerFlag(ctx.input.flags, "max-polls", 0)
		: Number.POSITIVE_INFINITY;
	const outputMode = ctx.input.global.output;
	// `seen` is bounded by the backend `created_after` filter: once the
	// watermark advances past a timestamp, events at strictly older
	// timestamps cannot reappear, so we only need to retain ids that share
	// the current watermark for cross-poll dedup. Without this bound, a
	// long tail session would grow `seen` indefinitely.
	let seenAtWatermark = new Set<string>();
	let createdAfter: string | undefined;
	let polls = 0;
	let emitted = 0;
	while (!signal.aborted && polls < maxPolls) {
		polls += 1;
		const events = await pollOnce(
			ctx.api,
			requestId,
			createdAfter,
			POLL_PAGE_SIZE
		);
		for (const event of events) {
			if (seenAtWatermark.has(event.id)) {
				continue;
			}
			ctx.writeLine(formatLine(event, outputMode));
			emitted += 1;
			if (createdAfter === undefined || event.createdAt > createdAfter) {
				createdAfter = event.createdAt;
				seenAtWatermark = new Set<string>([event.id]);
			} else {
				seenAtWatermark.add(event.id);
			}
		}
		if (polls >= maxPolls || signal.aborted) {
			break;
		}
		await sleep(intervalMs, signal);
	}
	return { emitted, polls, requestId };
};

/**
 * `dsar audit tail --request=<id>` — polls the audit log endpoint and
 * streams newly-observed events to stdout. Exits on SIGINT.
 */
export const auditTailCommand: CommandDefinition = {
	description:
		"Stream audit events for a request, polling the audit log endpoint.",
	execute: async (ctx) => {
		const controller = new AbortController();
		const onInterrupt = () => controller.abort();
		process.once("SIGINT", onInterrupt);
		try {
			return await runAuditTailLoop(ctx, controller.signal);
		} finally {
			process.removeListener("SIGINT", onInterrupt);
		}
	},
	flagHelp: [
		"--request <id>           Request id to tail (required)",
		"--interval <ms>          Poll interval in milliseconds (default 2000)",
	],
	id: "audit_tail",
	usage: ["audit", "tail"],
};

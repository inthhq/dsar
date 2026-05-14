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

const pollOnce = async (
	api: ApiClient,
	requestId: string,
	createdAfter: string | undefined,
	limit: number
): Promise<readonly AuditTailEvent[]> => {
	const response = (await api.invoke({
		method: "GET",
		path: "/audit",
		query: {
			created_after: createdAfter,
			limit: String(limit),
			request_id: requestId,
		},
	})) as AuditListEnvelope;
	const items = response.data?.items ?? [];
	return [...items].toSorted((left, right) => {
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
	const seen = new Set<string>();
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
			if (seen.has(event.id)) {
				continue;
			}
			seen.add(event.id);
			ctx.writeLine(formatLine(event, outputMode));
			emitted += 1;
			if (createdAfter === undefined || event.createdAt > createdAfter) {
				createdAfter = event.createdAt;
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
	id: "audit_tail",
	usage: ["audit", "tail"],
};

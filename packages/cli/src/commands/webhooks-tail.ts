/* oxlint-disable max-statements, promise/avoid-new, promise/no-multiple-resolved */
import type {
	ApiClient,
	CommandDefinition,
	CommandExecutionContext,
} from "../types";

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_LIMIT = 200;

interface WebhookDispatchTailEvent {
	readonly createdAt: string;
	readonly dispatchId: string;
	readonly endpointId?: string;
	readonly error?: string;
	readonly eventId: string;
	readonly eventType?: string;
	readonly requestId: string;
	readonly status: string;
}

interface WebhookDispatchListEnvelope {
	readonly data?: {
		readonly items?: readonly WebhookDispatchTailEvent[];
	};
}

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

const isEnabledFlag = (
	flags: Readonly<Record<string, string>>,
	key: string
): boolean => flags[key] === "true";

const parseMaxPolls = (flags: Readonly<Record<string, string>>): number => {
	if (isEnabledFlag(flags, "once")) {
		return 1;
	}
	if (flags["max-polls"]) {
		return parseIntegerFlag(flags, "max-polls", 0);
	}
	return Number.POSITIVE_INFINITY;
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

const formatLine = (
	event: WebhookDispatchTailEvent,
	output: "json" | "text"
): string => {
	if (output === "json") {
		return JSON.stringify(event);
	}
	return `[${event.createdAt}] ${event.status} dispatch=${event.dispatchId} event=${event.eventId}${
		event.endpointId ? ` endpoint=${event.endpointId}` : ""
	} request=${event.requestId}${event.error ? ` error=${event.error}` : ""}`;
};

const pollOnce = async (
	api: ApiClient,
	input: {
		readonly createdAfter?: string;
		readonly endpointId?: string;
		readonly limit: number;
		readonly status?: string;
	}
): Promise<readonly WebhookDispatchTailEvent[]> => {
	const response = (await api.invoke({
		method: "GET",
		path: "/webhooks/dispatches",
		query: {
			created_after: input.createdAfter,
			endpoint_id: input.endpointId,
			limit: String(input.limit),
			status: input.status,
		},
	})) as WebhookDispatchListEnvelope;
	const items = response.data?.items ?? [];
	return items.toSorted((left, right) => {
		const order = left.createdAt.localeCompare(right.createdAt);
		return order === 0
			? left.dispatchId.localeCompare(right.dispatchId)
			: order;
	});
};

/**
 * Runs the `dsar webhooks tail` polling loop, emitting newly observed
 * outbound webhook dispatches until cancelled, `--once` completes, or a
 * test-only `--max-polls` bound is reached.
 *
 * @param ctx - Command execution context carrying flags, API client, and
 *   output sink.
 * @param signal - Abort signal used to stop polling gracefully.
 * @returns A summary with poll count and emitted dispatch count.
 */
export const runWebhookTailLoop = async (
	ctx: CommandExecutionContext,
	signal: AbortSignal
): Promise<{
	readonly emitted: number;
	readonly polls: number;
}> => {
	const intervalMs = parseIntegerFlag(
		ctx.input.flags,
		"interval",
		DEFAULT_INTERVAL_MS
	);
	const limit = parseIntegerFlag(ctx.input.flags, "limit", DEFAULT_LIMIT);
	const maxPolls = parseMaxPolls(ctx.input.flags);
	const outputMode = ctx.input.global.output;
	const endpointId = ctx.input.flags["endpoint-id"];
	const { status } = ctx.input.flags;
	let seenAtWatermark = new Set<string>();
	let createdAfter = ctx.input.flags["created-after"] ?? ctx.input.flags.since;
	let polls = 0;
	let emitted = 0;
	while (!signal.aborted && polls < maxPolls) {
		polls += 1;
		const events = await pollOnce(ctx.api, {
			createdAfter,
			endpointId,
			limit,
			status,
		});
		for (const event of events) {
			if (seenAtWatermark.has(event.dispatchId)) {
				continue;
			}
			ctx.writeLine(formatLine(event, outputMode));
			emitted += 1;
			if (createdAfter === undefined || event.createdAt > createdAfter) {
				createdAfter = event.createdAt;
				seenAtWatermark = new Set<string>([event.dispatchId]);
			} else {
				seenAtWatermark.add(event.dispatchId);
			}
		}
		if (polls >= maxPolls || signal.aborted) {
			break;
		}
		await sleep(intervalMs, signal);
	}
	return { emitted, polls };
};

/**
 * `dsar webhooks tail` — polls outbound webhook dispatches and streams newly
 * observed attempts to stdout. Exits on SIGINT.
 */
export const webhooksTailCommand: CommandDefinition = {
	description: "Stream outbound webhook dispatches.",
	execute: async (ctx) => {
		const controller = new AbortController();
		const onInterrupt = () => controller.abort();
		process.once("SIGINT", onInterrupt);
		try {
			return await runWebhookTailLoop(ctx, controller.signal);
		} finally {
			process.removeListener("SIGINT", onInterrupt);
		}
	},
	id: "webhooks_tail",
	usage: ["webhooks", "tail"],
};

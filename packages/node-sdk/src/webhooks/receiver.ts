import { isWebhookEventType } from "./types";
import type {
	WebhookEvent,
	WebhookEventPayloadMap,
	WebhookEventType,
} from "./types";
import { verifyWebhook } from "./verify";
import type { VerifyWebhookInput } from "./verify";

export interface WebhookReceiverOptions {
	readonly signingSecret: string;
	/** Override for tests. Defaults to `verifyWebhook`. */
	readonly verify?: (input: VerifyWebhookInput) => Promise<void>;
}

export type WebhookEventHandler<T extends WebhookEventType> = (
	event: WebhookEvent<T>
) => void | Promise<void>;

export interface WebhookReceiverHandleInput {
	readonly rawBody: string;
	readonly signature: string | undefined;
}

export interface WebhookReceiverResponseBody {
	readonly ok: boolean;
	readonly error?: string;
}

export interface WebhookReceiverResult {
	readonly status: 200 | 400 | 401 | 500;
	readonly body: WebhookReceiverResponseBody;
}

export interface WebhookReceiver {
	on<T extends WebhookEventType>(
		eventType: T,
		handler: WebhookEventHandler<T>
	): WebhookReceiver;
	handle(input: WebhookReceiverHandleInput): Promise<WebhookReceiverResult>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

const asString = (value: unknown): string | undefined =>
	typeof value === "string" && value.length > 0 ? value : undefined;

type RequiredWebhookFields = Omit<WebhookEvent, "eventType" | "payload">;

const errorResult = (
	status: 400 | 401 | 500,
	error: string
): WebhookReceiverResult => ({
	body: { error, ok: false },
	status,
});

const successResult = (): WebhookReceiverResult => ({
	body: { ok: true },
	status: 200,
});

const readRequiredStrings = (
	parsed: Record<string, unknown>
): RequiredWebhookFields | undefined => {
	const {
		correlationId: rawCorrelationId,
		eventId: rawEventId,
		idempotencyKey: rawIdempotencyKey,
		locale: rawLocale,
		policyVersion: rawPolicyVersion,
		requestId: rawRequestId,
	} = parsed;
	const correlationId = asString(rawCorrelationId);
	const eventId = asString(rawEventId);
	const idempotencyKey = asString(rawIdempotencyKey);
	const locale = asString(rawLocale);
	const policyVersion = asString(rawPolicyVersion);
	const requestId = asString(rawRequestId);
	if (
		!eventId ||
		!requestId ||
		!correlationId ||
		!idempotencyKey ||
		!policyVersion ||
		!locale
	) {
		return undefined;
	}
	return {
		correlationId,
		eventId,
		idempotencyKey,
		locale,
		policyVersion,
		requestId,
	};
};

const buildWebhookEvent = (
	eventType: WebhookEventType,
	requiredFields: RequiredWebhookFields,
	payload: Record<string, unknown>
): WebhookEvent => ({
	...requiredFields,
	eventType,
	payload: payload as WebhookEventPayloadMap[typeof eventType],
});

const parseWebhookEvent = (rawBody: string): WebhookEvent | undefined => {
	const parsed = asRecord(JSON.parse(rawBody) as unknown);
	const eventType = parsed?.eventType;
	const requiredFields = parsed ? readRequiredStrings(parsed) : undefined;
	const payload = parsed ? asRecord(parsed.payload) : undefined;
	if (!isWebhookEventType(eventType) || !requiredFields || !payload) {
		return undefined;
	}
	return buildWebhookEvent(eventType, requiredFields, payload);
};

type ParseReceiverEventResult =
	| {
			readonly event: WebhookEvent;
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly result: WebhookReceiverResult;
	  };

const parseReceiverEvent = (rawBody: string): ParseReceiverEventResult => {
	try {
		const event = parseWebhookEvent(rawBody);
		return event
			? { event, ok: true }
			: { ok: false, result: errorResult(400, "invalid_event") };
	} catch {
		return { ok: false, result: errorResult(400, "malformed_body") };
	}
};

const verifyReceiverSignature = async (input: {
	readonly rawBody: string;
	readonly signature: string;
	readonly signingSecret: string;
	readonly verify: (verifyInput: VerifyWebhookInput) => Promise<void>;
}): Promise<WebhookReceiverResult | undefined> => {
	try {
		await input.verify({
			payload: input.rawBody,
			signature: input.signature,
			signingSecret: input.signingSecret,
		});
		return undefined;
	} catch {
		return errorResult(401, "invalid_signature");
	}
};

const dispatchEvent = async (
	event: WebhookEvent,
	handlers: ReadonlyMap<WebhookEventType, WebhookEventHandler<WebhookEventType>>
): Promise<WebhookReceiverResult> => {
	const handler = handlers.get(event.eventType);
	if (!handler) {
		return successResult();
	}
	try {
		await handler(event);
		return successResult();
	} catch {
		return errorResult(500, "handler_failed");
	}
};

export const createWebhookReceiver = (
	options: WebhookReceiverOptions
): WebhookReceiver => {
	const verify = options.verify ?? verifyWebhook;
	const handlers = new Map<
		WebhookEventType,
		WebhookEventHandler<WebhookEventType>
	>();

	const receiver: WebhookReceiver = {
		async handle(input) {
			if (!input.signature || input.signature.trim().length === 0) {
				return errorResult(401, "missing_signature");
			}

			const verificationError = await verifyReceiverSignature({
				rawBody: input.rawBody,
				signature: input.signature,
				signingSecret: options.signingSecret,
				verify,
			});
			if (verificationError) {
				return verificationError;
			}

			const parsed = parseReceiverEvent(input.rawBody);
			return parsed.ok ? dispatchEvent(parsed.event, handlers) : parsed.result;
		},
		on(eventType, handler) {
			handlers.set(eventType, handler as WebhookEventHandler<WebhookEventType>);
			return receiver;
		},
	};

	return receiver;
};

import type {
	DsarResult,
	InitResponse,
	NodeSdkClient,
	StatusResponse,
} from "@dsar/node-sdk";

import type {
	CoreCustomHandler,
	CoreInvocation,
	OfflineFixtures,
	ResolvedCoreClientConfig,
} from "./types";

const makeResult = <T>(data: T): DsarResult<T> => ({
	data,
	expect: (_message?: string) => data,
	ok: true,
	orElse: (_fallback: T | ((error: never) => T)) => data,
	unwrap: () => data,
});

const fallbackStatus = (): StatusResponse => ({
	service: "@dsar/core-offline",
	status: "ok",
});

const fallbackInit = (): InitResponse => ({
	initialized: true,
});

const defaultFallbackPayload = (invocation: CoreInvocation): unknown => ({
	mode: invocation.mode,
	operation: invocation.path.join("."),
	status: "stubbed",
});

const offlineFallback = (
	fixtures: OfflineFixtures | undefined,
	invocation: CoreInvocation
): unknown => {
	if (!fixtures?.fallback) {
		return defaultFallbackPayload(invocation);
	}
	return typeof fixtures.fallback === "function"
		? fixtures.fallback(invocation)
		: fixtures.fallback;
};

const resolveOfflineValue = (
	fixtures: OfflineFixtures | undefined,
	invocation: CoreInvocation
): unknown => {
	const route = invocation.path.join(".");
	if (route === "status") {
		return fixtures?.status ?? fallbackStatus();
	}
	if (route === "init") {
		return fixtures?.init ?? fallbackInit();
	}
	return offlineFallback(fixtures, invocation);
};

const makeInvocationProxy = (
	mode: "custom" | "offline",
	handler: CoreCustomHandler
): NodeSdkClient => {
	const buildNode = (path: readonly string[]): unknown =>
		new Proxy((..._args: readonly unknown[]) => 0, {
			apply: async (_target, _thisArg, args) => {
				const value = await handler({ args, mode, path });
				return makeResult(value);
			},
			get: (_target, property) => {
				if (typeof property !== "string") {
					return;
				}
				return buildNode([...path, property]);
			},
		});
	return buildNode([]) as NodeSdkClient;
};

/**
 * Creates a custom-mode SDK that delegates every operation to the provided
 * handler via a recursive proxy.
 *
 * @param handler - Callback (sync or async) invoked for each SDK operation
 *   with the call path, arguments, and mode; its return value is wrapped
 *   in a `DsarResult`.
 * @returns A {@link NodeSdkClient} proxy where any method call is routed
 *   through `handler`.
 */
export const makeCustomModeSdk = (handler: CoreCustomHandler): NodeSdkClient =>
	makeInvocationProxy("custom", handler);

/**
 * Creates an offline-mode SDK that returns fixture data without network calls.
 *
 * @param fixtures - Optional fixture overrides for `status`, `init`, and a
 *   catch-all `fallback`; when omitted, built-in stub payloads are used.
 * @returns A {@link NodeSdkClient} proxy where every operation resolves from
 *   fixture data.
 */
export const makeOfflineModeSdk = (fixtures?: OfflineFixtures): NodeSdkClient =>
	makeInvocationProxy("offline", (invocation) =>
		resolveOfflineValue(fixtures, invocation)
	);

/**
 * Resolves the SDK implementation for the configured runtime mode.
 *
 * @param config - Resolved client configuration whose `mode` determines which
 *   SDK factory is used (`"custom"` or `"offline"`).
 * @returns A {@link NodeSdkClient} for custom or offline modes, or `undefined`
 *   when the mode requires an HTTP-backed SDK built elsewhere.
 */
export const resolveModeRuntime = (
	config: ResolvedCoreClientConfig
): NodeSdkClient | undefined => {
	if (config.mode === "custom") {
		return makeCustomModeSdk(config.handler);
	}
	if (config.mode === "offline") {
		return makeOfflineModeSdk(config.fixtures);
	}
	return undefined;
};

"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { createDsarBrowserClient } from "./client";
import type { DsarBrowserClient } from "./client";
import type { DsarClientMode } from "./hosted";

const DsarClientContext = createContext<DsarBrowserClient | null>(null);

/** Props for {@link DsarProvider}. */
export interface DsarProviderProps {
	/** Widget tree that calls `useDsarClient`. */
	readonly children: ReactNode;
	/** Hosted or self-hosted transport. */
	readonly mode: DsarClientMode;
	/** Optional fetch override for tests. */
	readonly fetch?: typeof fetch;
}

/**
 * Root provider. Same role as c15t's ConsentProvider:
 * one transport, then hooks and widgets read it.
 *
 * @param props - Children, transport mode, and optional fetch.
 * @returns The React context provider.
 */
export const DsarProvider = (props: DsarProviderProps) => {
	const { children, fetch, mode } = props;
	const client = useMemo(
		() => createDsarBrowserClient({ baseUrl: mode.baseUrl, fetch }),
		[fetch, mode.baseUrl]
	);
	return (
		<DsarClientContext.Provider value={client}>
			{children}
		</DsarClientContext.Provider>
	);
};

/**
 * Browser DSAR client from the nearest `DsarProvider`.
 *
 * @returns The cookie-based HTTP client.
 */
export const useDsarClient = (): DsarBrowserClient => {
	const client = useContext(DsarClientContext);
	if (client === null) {
		throw new Error("useDsarClient must run inside DsarProvider");
	}
	return client;
};

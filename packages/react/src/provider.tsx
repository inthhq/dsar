"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import { createDsarBrowserClient } from "./client";
import type { DsarBrowserClient } from "./client";
import type { DsarClientMode } from "./hosted";

const DsarClientContext = createContext<DsarBrowserClient | null>(null);

export interface DsarProviderProps {
	readonly children: ReactNode;
	readonly mode: DsarClientMode;
	readonly fetch?: typeof fetch;
}

/**
 * Root provider. Same role as c15t's ConsentProvider:
 * one transport, then hooks and widgets read it.
 */
export const DsarProvider = ({ children, fetch, mode }: DsarProviderProps) => {
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

export const useDsarClient = (): DsarBrowserClient => {
	const client = useContext(DsarClientContext);
	if (client === null) {
		throw new Error("useDsarClient must run inside DsarProvider");
	}
	return client;
};

"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";
import type { CommerceIdentity } from "./types";

const CommerceContext = createContext<CommerceIdentity>({
    address: undefined,
    isConnected: false,
    chainId: 1,
});

/**
 * Provides wallet identity to the component tree.
 * Wrap inside WagmiProvider. Components consume via `useCommerce()`.
 */
export function CommerceProvider({ children }: { children: ReactNode }) {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();

    const value = useMemo<CommerceIdentity>(
        () => ({ address, isConnected, chainId }),
        [address, isConnected, chainId],
    );

    return (
        <CommerceContext.Provider value={value}>
            {children}
        </CommerceContext.Provider>
    );
}

/**
 * Read wallet identity from the nearest CommerceProvider.
 */
export function useCommerce(): CommerceIdentity {
    return useContext(CommerceContext);
}

// ── Test helper ────────────────────────────────────────────────

export interface MockCommerceProps {
    address?: `0x${string}`;
    isConnected?: boolean;
    chainId?: number;
    children: ReactNode;
}

/**
 * Drop-in replacement for tests — no wagmi provider required.
 */
export function MockCommerceProvider({
    address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`,
    isConnected = true,
    chainId = 31337,
    children,
}: MockCommerceProps) {
    const value = useMemo<CommerceIdentity>(
        () => ({ address, isConnected, chainId }),
        [address, isConnected, chainId],
    );

    return (
        <CommerceContext.Provider value={value}>
            {children}
        </CommerceContext.Provider>
    );
}

// Re-export the context for advanced use cases (e.g. custom providers)
export { CommerceContext };

"use client";
import { useSyncExternalStore } from "react";

// Header chrome reads connection state WITHOUT mounting the wallet provider:
// the site header renders on marketing routes too, where `<Providers>` is
// deliberately absent (wallet-provider scope rules, docs/FRONTEND.md), so a
// wagmi `useAccount()` here would either throw or force the provider onto
// every page. The injected EIP-1193 provider answers the one question the
// chrome asks — is a wallet connected — and nothing else.

// The last `accountsChanged` answer in this tab; until one arrives, the
// provider's `selectedAddress`.
let fromEvent: boolean | null = null;

function subscribe(onChange: () => void): () => void {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) return () => {};
    const listener = (...args: unknown[]) => {
        const accounts = args[0] as string[] | undefined;
        fromEvent = Boolean(accounts && accounts.length > 0);
        onChange();
    };
    provider.on?.("accountsChanged", listener);
    return () => provider.removeListener?.("accountsChanged", listener);
}

function snapshot(): boolean {
    return fromEvent ?? !!window.ethereum?.selectedAddress;
}

export function useWalletConnected(): boolean {
    return useSyncExternalStore(subscribe, snapshot, () => false);
}

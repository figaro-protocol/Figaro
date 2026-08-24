"use client";
import { useState, useEffect } from "react";

// Header chrome reads connection state WITHOUT mounting the wallet provider:
// the site header renders on marketing routes too, where `<Providers>` is
// deliberately absent (wallet-provider scope rules, docs/FRONTEND.md), so a
// wagmi `useAccount()` here would either throw or force the provider onto
// every page. The injected EIP-1193 provider answers the one question the
// chrome asks — is a wallet connected — and nothing else.
export function useWalletConnected(): boolean {
    const [connected, setConnected] = useState(false);
    useEffect(() => {
        if (typeof window !== "undefined" && window.ethereum) {
            setConnected(!!window.ethereum.selectedAddress);
            window.ethereum.on?.("accountsChanged", (...args: unknown[]) => {
                const accounts = args[0] as string[] | undefined;
                setConnected(Boolean(accounts && accounts.length > 0));
            });
        }
    }, []);
    return connected;
}

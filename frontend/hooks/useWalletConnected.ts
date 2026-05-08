"use client";
import { useState, useEffect } from "react";

// This is a placeholder. Replace with your actual wallet connection logic if you use wagmi or RainbowKit.
export function useWalletConnected(): boolean {
    // Example: check for window.ethereum.selectedAddress or similar
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

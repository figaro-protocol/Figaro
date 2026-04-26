"use client";
import { useState, useEffect } from "react";

// This is a placeholder. Replace with your actual wallet connection logic if you use wagmi or RainbowKit.
export function useWalletConnected(): boolean {
    // Example: check for window.ethereum.selectedAddress or similar
    const [connected, setConnected] = useState(false);
    useEffect(() => {
        if (typeof window !== "undefined" && (window as any).ethereum) {
            setConnected(!!(window as any).ethereum.selectedAddress);
            (window as any).ethereum.on && (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
                setConnected(accounts && accounts.length > 0);
            });
        }
    }, []);
    return connected;
}

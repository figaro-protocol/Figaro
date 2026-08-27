"use client";

import { useCallback } from "react";
import { useConnect, useConnectors } from "wagmi";
import { findInjectedConnector } from "@/lib/shared/connectors";

/**
 * Connect through wagmi's injected connector — the only connector this app
 * registers (ruled 2026-08-03: RainbowKit has no wagmi-3 support, so
 * the fallback is injected()-only; see `lib/shared/connectors.ts`).
 *
 * Replaces RainbowKit's `useConnectModal().openConnectModal` at every call
 * site that used to open the wallet-picker modal — there is only one
 * wallet path now, so "open the modal" collapses to "connect".
 */
export function useConnectInjected(): () => void {
    const { connect } = useConnect();
    const connectors = useConnectors();

    return useCallback(() => {
        const connector = findInjectedConnector(connectors);
        if (connector) connect({ connector });
    }, [connect, connectors]);
}

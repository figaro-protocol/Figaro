"use client";

import { useSyncExternalStore } from "react";
import { isAddress } from "viem";

const subscribeNothing = () => () => {};

function walletFromQuery(): string | undefined {
    const raw = new URLSearchParams(window.location.search).get("wallet");
    return raw && isAddress(raw) ? raw : undefined;
}

/**
 * The address a per-wallet page shows. The connected wallet when there is
 * one; otherwise the `wallet` query parameter, if it is an address. Reading a
 * wallet's orders or accrual is reading public data, so it needs no
 * connection; the wallet is asked for only where a signature is. Read from
 * the location on the client only (`useSyncExternalStore`'s server snapshot
 * is `undefined`), so the static export renders the same first paint as the
 * server.
 */
export function useViewedWallet(connected: `0x${string}` | undefined): `0x${string}` | undefined {
    const fromQuery = useSyncExternalStore(subscribeNothing, walletFromQuery, () => undefined) as
        | `0x${string}`
        | undefined;
    return connected ?? fromQuery;
}

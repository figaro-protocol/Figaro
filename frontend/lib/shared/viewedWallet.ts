"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";

/**
 * The address a per-wallet page shows. The connected wallet when there is
 * one; otherwise the `wallet` query parameter, if it is an address. Reading a
 * wallet's orders or accrual is reading public data, so it needs no
 * connection; the wallet is asked for only where a signature is. Read from
 * the location in an effect, so the static export renders the same first
 * paint as the server.
 */
export function useViewedWallet(connected: `0x${string}` | undefined): `0x${string}` | undefined {
    const [fromQuery, setFromQuery] = useState<`0x${string}` | undefined>(undefined);
    useEffect(() => {
        const raw = new URLSearchParams(window.location.search).get("wallet");
        setFromQuery(raw && isAddress(raw) ? (raw as `0x${string}`) : undefined);
    }, []);
    return connected ?? fromQuery;
}

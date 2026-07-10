"use client";

/**
 * useProcessResolveCapacity — a live process's position against the chain's
 * atomic-resolve ceiling (`readProcessResolveCapacity`, @figaro/sdk).
 *
 * Null while loading, for root commitments (zero processId — a fresh process
 * trivially fits), and on read failure (resolved-empty = absence; no
 * fallback figure is invented). The ceiling is chain-adaptive — read from
 * the live block gas limit, never a hardcoded cap.
 */

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { readProcessResolveCapacity, type ProcessResolveCapacity } from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";

export default function useProcessResolveCapacity(
    processId: `0x${string}` | undefined,
): ProcessResolveCapacity | null {
    const publicClient = usePublicClient();
    const [capacity, setCapacity] = useState<ProcessResolveCapacity | null>(null);

    useEffect(() => {
        if (!publicClient || !processId || hexEqual(processId, ZERO_PROCESS_ID)) {
            setCapacity(null);
            return;
        }
        let cancelled = false;
        readProcessResolveCapacity(publicClient, CONTRACTS.core, processId)
            .then((c) => { if (!cancelled) setCapacity(c); })
            .catch(() => { if (!cancelled) setCapacity(null); });
        return () => { cancelled = true; };
    }, [publicClient, processId]);

    return capacity;
}

"use client";

/**
 * useProcessResolveCapacity — a live process's position against the chain's
 * atomic-resolve ceiling (`readProcessResolveCapacity`, @figaro-protocol/sdk).
 *
 * Null while loading, for root commitments (zero processId — a fresh process
 * trivially fits), and on read failure (resolved-empty = absence; no
 * fallback figure is invented). The ceiling is chain-adaptive — read from
 * the live block gas limit, never a hardcoded cap.
 *
 * The process is read whichever path made it: the Core's getter for a direct
 * process, the batch verifier's logs from the deployment block for a batched
 * one. The count is of landed orders.
 */

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { readProcessResolveCapacity, type ProcessResolveCapacity } from "@figaro-protocol/sdk";
import { CONTRACTS, getBatchVerifier } from "@/lib/core/contracts";
import { deploymentBlock } from "@/lib/core/eventCache";
import { ZERO_PROCESS_ID, hexEqual } from "@/lib/shared/evm";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

export default function useProcessResolveCapacity(
    processId: `0x${string}` | undefined,
): ProcessResolveCapacity | null {
    const publicClient = usePublicClient();
    const [capacity, setCapacity] = useState<ProcessResolveCapacity | null>(null);

    // A process with nothing to read is null from the render it changes in
    // (`useDepsChanged`); the effect reads the chain only.
    const noRead = !publicClient || !processId || hexEqual(processId, ZERO_PROCESS_ID);
    // The reset reads only whether a client is there, so it is keyed on that.
    const inputsChanged = useDepsChanged([!!publicClient, processId]);
    if (inputsChanged && noRead) setCapacity(null);

    useEffect(() => {
        if (!publicClient || !processId || hexEqual(processId, ZERO_PROCESS_ID)) return;
        let canceled = false;
        // `undefined` keeps the SDK's default cap on one transaction.
        readProcessResolveCapacity(publicClient, CONTRACTS.core, processId, undefined, {
            batchVerifier: getBatchVerifier() ?? undefined,
            fromBlock: deploymentBlock(),
        })
            .then((c) => { if (!canceled) setCapacity(c); })
            .catch(() => { if (!canceled) setCapacity(null); });
        return () => { canceled = true; };
    }, [publicClient, processId]);

    return capacity;
}

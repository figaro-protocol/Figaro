"use client";

/**
 * useArbitrationCost — fetch the current Kleros arbitration cost.
 *
 * Returns the cost in native currency (ETH / xDAI) that a party must pay
 * to raise a dispute through the ArbitrableProxy. This is displayed
 * alongside bond information as part of the dissuasion mechanism: users
 * see the full economic exposure (bond at risk + cost to dispute) before
 * committing to an order.
 *
 * When Kleros is not configured (no env vars), returns a null cost and
 * a configured=false flag so the UI can show a static estimate or hide
 * the section entirely.
 */

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { getArbitrationCost, type KlerosConfig } from "@/lib/dispute";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

function getKlerosConfigFromEnv(): KlerosConfig | null {
    const proxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY;
    const extraData = process.env.NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA;
    if (!proxy) return null;
    return {
        arbitrableProxy: proxy as Address,
        arbitratorExtraData: (extraData ?? "0x") as `0x${string}`,
    };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ArbitrationCostResult {
    /** Whether Kleros env vars are configured. */
    configured: boolean;
    /** Kleros config (null when not configured). */
    klerosConfig: KlerosConfig | null;
    /** Arbitration cost in wei (native currency). Null when loading or unconfigured. */
    cost: bigint | null;
    /** Human-readable cost in ETH. Null when unavailable. */
    costEth: string | null;
    /** True while the on-chain call is in-flight. */
    loading: boolean;
    /** Error message if the arbitration cost fetch failed. Null on success or when unconfigured. */
    error: string | null;
}

export function useArbitrationCost(): ArbitrationCostResult {
    const publicClient = usePublicClient();
    const [cost, setCost] = useState<bigint | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const klerosConfig = getKlerosConfigFromEnv();
    const configured = klerosConfig !== null;

    useEffect(() => {
        if (!publicClient || !klerosConfig) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        getArbitrationCost(publicClient, klerosConfig)
            .then((c) => { if (!cancelled) setCost(c); })
            .catch((e: any) => {
                if (!cancelled) setError(e?.shortMessage ?? e?.message ?? "Failed to fetch arbitration cost");
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicClient, klerosConfig?.arbitrableProxy]);

    const costEth = cost !== null
        ? (Number(cost) / 1e18).toFixed(4)
        : null;

    return { configured, klerosConfig, cost, costEth, loading, error };
}

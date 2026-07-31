"use client";

/**
 * useAuditProcessOrders — the process's orders from BOTH settlement universes.
 *
 * `useProcessOrders` builds its list exclusively from `OrderCommitted` logs on
 * `FigaroCore`. A batch-settled order never emits one — its buyer, seller,
 * payment and `agreementHash` exist only under `FigaroBatchVerifier`'s proven
 * state root — so every `/audit` surface built on that hook renders NOTHING for
 * batched trade. This hook adds the second universe: the batch relay's
 * published records, each re-derived and chain-anchored by
 * `lib/audit/batchRelay` before it is allowed into the list.
 *
 * The two universes are DISJOINT and stay distinguishable: `orders` carries
 * only records that passed every check, while `batch` carries the full verdict
 * — including failures and the reason a relay produced nothing — so a surface
 * can report the difference between "no such trade", "no relay configured", and
 * "this relay published something that does not verify". Never collapse them
 * into an empty list.
 */

import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useOrderStore, type Order } from "@/lib/kernel/store";
import {
    readVerifiedBatchProcess,
    type VerifiedBatchProcess,
} from "@/lib/audit/batchRelay";

export interface AuditProcessOrders {
    /** Direct-path orders plus every VERIFIED batch order. */
    orders: Order[];
    /** The batch universe's full verdict — null until the read completes. */
    batch: VerifiedBatchProcess | null;
    loading: boolean;
}

export function useAuditProcessOrders(processId: string | null): AuditProcessOrders {
    const direct = useProcessOrders(processId);
    const publicClient = usePublicClient();
    const chainId = publicClient?.chain?.id ?? 0;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);

    const [batch, setBatch] = useState<VerifiedBatchProcess | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!publicClient || !chainId || !processId) {
            setBatch(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const result = await readVerifiedBatchProcess(publicClient, chainId, processId);
                if (!cancelled) setBatch(result);
            } catch (err) {
                // readVerifiedBatchProcess already folds relay failures into a
                // status; reaching here means a defect, not an absent relay.
                console.error("useAuditProcessOrders batch relay error:", err);
                if (!cancelled) setBatch(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [publicClient, chainId, processId, processReloadKey]);

    const orders = useMemo(() => {
        const verified = (batch?.orders ?? [])
            .map((o) => o.order)
            .filter((o): o is Order => o !== null);
        if (verified.length === 0) return direct;
        // A given order settles on exactly ONE path, but de-duplicate anyway so
        // a relay cannot inject a second row for an order the kernel published.
        const seen = new Set(direct.map((o) => o.orderHash.toLowerCase()));
        return [...direct, ...verified.filter((o) => !seen.has(o.orderHash.toLowerCase()))];
    }, [direct, batch]);

    return { orders, batch, loading };
}

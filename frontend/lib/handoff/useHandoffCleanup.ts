"use client";

/**
 * Watches for terminal order events (Resolved / Cancelled) and purges
 * handoff encryption artifacts from localStorage.
 *
 * Cleans up:
 *   - Buyer-side AES handoff key + ephemeral private key (handoffKeys store)
 *   - Fulfiller-side ECDH ephemeral keypair (ecdh store)
 *   - Pending handoff intent (handoffIntent store)
 *
 * A grace period (default 0 — immediate) can be configured per-instance.
 * During the grace period the key record is marked with `purgeAfter` but
 * not yet deleted; a sweep on hook mount handles deferred deletions.
 */

import { useEffect, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";
import { ensureRpc } from "@/lib/shared/rpc";
import { isE2EMockSession } from "@/lib/shared/e2e";
import type { HandoffPersistenceService } from "@/lib/shared/handoffPersistenceService";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseHandoffCleanupOpts {
    /** Milliseconds to wait after terminal event before purging (default 0). */
    gracePeriodMs?: number;
    handoffPersistence?: HandoffPersistenceService;
}

export function useHandoffCleanup(opts: UseHandoffCleanupOpts = {}) {
    const runtimeServices = useRuntimeServices();
    const { gracePeriodMs = 0, handoffPersistence = runtimeServices.handoffPersistence } = opts;
    const publicClient = usePublicClient();
    const { address } = useAccount();
    const isE2EMock = isE2EMockSession();
    const processedRef = useRef<Set<string>>(new Set());

    // ── Sweep deferred purges on mount ──────────────────────────────
    useEffect(() => {
        if (!address) return;
        handoffPersistence.sweepDuePurges(address);
    }, [address, handoffPersistence]);

    // ── Watch OrderResolved ─────────────────────────────────────────
    useEffect(() => {
        if (!publicClient || !address || isE2EMock) return;
        let unwatch: (() => void) | undefined;
        let mounted = true;

        const start = async () => {
            const rpc = await ensureRpc(publicClient);
            if (!rpc.ok || !mounted) return;

            unwatch = publicClient.watchContractEvent({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                eventName: "OrderResolved",
                onLogs: (logs) => {
                    if (!mounted) return;
                    for (const log of logs) {
                        const { orderId, processId } = (log.args ?? {}) as Partial<{
                            orderId: string | bigint;
                            processId: string;
                        }>;
                        if (!orderId || !processId) continue;
                        const oid = orderId.toString();
                        const pid = processId as string;
                        const key = `${pid}:${oid}`;
                        if (processedRef.current.has(key)) continue;
                        processedRef.current.add(key);
                        handoffPersistence.schedulePurge(address, pid, oid, gracePeriodMs);
                    }
                },
            });
        };

        start();
        return () => {
            mounted = false;
            unwatch?.();
        };
    }, [publicClient, address, isE2EMock, gracePeriodMs, handoffPersistence]);

    // ── Watch ProcessResolved (no cancel — only resolution triggers cleanup) ──
    useEffect(() => {
        if (!publicClient || !address || isE2EMock) return;
        let unwatch: (() => void) | undefined;
        let mounted = true;

        const start = async () => {
            const rpc = await ensureRpc(publicClient);
            if (!rpc.ok || !mounted) return;

            unwatch = publicClient.watchContractEvent({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                eventName: "ProcessResolved",
                onLogs: (logs) => {
                    if (!mounted) return;
                    for (const log of logs) {
                        const { processId } = (log.args ?? {}) as Partial<{ processId: string }>;
                        if (!processId) continue;
                        const pid = processId as string;
                        const key = `resolved:${pid}`;
                        if (processedRef.current.has(key)) continue;
                        processedRef.current.add(key);
                        // Resolution → purge after grace period
                        handoffPersistence.schedulePurge(address, pid, "all", 0);
                    }
                },
            });
        };

        start();
        return () => {
            mounted = false;
            unwatch?.();
        };
    }, [publicClient, address, isE2EMock, handoffPersistence]);
}


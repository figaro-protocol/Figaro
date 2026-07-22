"use client";

/**
 * Watches for the ONE terminal order event — OrderResolved / ProcessResolved
 * (the kernel has NO cancel) — and purges handoff encryption artifacts.
 *
 * Cleans up (all via handoffPersistenceService):
 *   - Buyer-side AES handoff key + ephemeral private key (sessionStorage)
 *   - Receiving-side ECDH ephemeral keypair (sessionStorage ecdh store)
 *   - Pending handoff intent (localStorage) + the purge queue (localStorage)
 *
 * The ephemeral key material is sessionStorage-backed, so it auto-clears on tab
 * close even for an order that is abandoned rather than resolved; this hook is
 * the same-session purge on the resolution path. A grace period (default 0 —
 * immediate) can be configured per-instance: during it the key record is marked
 * `purgeAfter` but not yet deleted, and a sweep on hook mount handles deferred
 * deletions.
 */

import { useEffect, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CORE_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { ensureRpc } from "@/lib/handoff/rpc";
import { isE2EMockSession } from "@/lib/shared/e2e";
import type { HandoffPersistenceService } from "@/lib/handoff/handoffPersistenceService";
import { sweepStaleEcdhKeypairs } from "@/lib/handoff/ecdh";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";

/** Age bound for ABANDONED-ceremony ephemeral key material. An order that never
 *  resolves has no terminal event to trigger the resolution-path purge; this
 *  bounds its key residue within a long-lived tab. Chosen generously so it
 *  never races a slow-but-live ceremony (a counterparty taking hours to answer
 *  a delivery-address exchange): 24h is far beyond any real handoff, and
 *  sessionStorage already clears everything on tab close. The precise per-order
 *  signature deadline is not surfaced in the client order model — see
 *  handoffPersistenceService.sweepStaleKeys. */
const EPHEMERAL_HANDOFF_KEY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

    // ── Sweep deferred purges + stale abandoned-order keys on mount ──
    useEffect(() => {
        if (!address) return;
        handoffPersistence.sweepDuePurges(address);
        // Abandoned-order sweep: purge key records + orphaned ECDH keypairs whose
        // ceremony never resolved and is now definitively stale by age.
        handoffPersistence.sweepStaleKeys(address, EPHEMERAL_HANDOFF_KEY_MAX_AGE_MS);
        sweepStaleEcdhKeypairs(Date.now(), EPHEMERAL_HANDOFF_KEY_MAX_AGE_MS);
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


"use client";

/**
 * Watches for the terminal order event — OrderResolved (the kernel has NO
 * cancel, and `resolveProcess` emits OrderResolved for EVERY order before the
 * one ProcessResolved) — and purges the order's ECDH ephemeral keypair
 * (sessionStorage ecdh store) via handoffPersistenceService: the
 * crypto-shredding leg of the layered-evidence pattern.
 *
 * The key material is sessionStorage-backed, so it auto-clears on tab close
 * even for an order that is abandoned rather than resolved; this hook is the
 * same-session purge on the resolution path, and the mount-time sweeps bound
 * abandoned-ceremony residue by age. A grace period (default 0 — immediate)
 * can be configured per-instance: during it the purge sits queued under
 * `purgeAfter`, and the mount-time sweep executes deferred deletions.
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
 *  signature deadline is not surfaced in the client order model, so the sweep
 *  (`sweepStaleEcdhKeypairs`) uses the keypair's own creation stamp. */
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

    // ── Sweep deferred purges + stale abandoned-ceremony keypairs on mount ──
    useEffect(() => {
        if (!address) return;
        handoffPersistence.sweepDuePurges(address);
        // Abandoned-ceremony sweep: an order that never resolves has no
        // terminal event, so its keypair is bounded by age instead.
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
                        // The kernel event's field is `orderHash` — destructuring
                        // `orderId` here was a silent no-op that killed the
                        // per-order purge path (every log skipped on the guard).
                        const { orderHash, processId } = (log.args ?? {}) as Partial<{
                            orderHash: string | bigint;
                            processId: string;
                        }>;
                        if (!orderHash || !processId) continue;
                        const oid = orderHash.toString();
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

    // No ProcessResolved watcher: `resolveProcess` emits OrderResolved for
    // every order in the same transaction (FigaroCore.sol — per-order event
    // inside the loop, ProcessResolved once after), so the per-order watcher
    // above already purges the whole process. The former "all"-scope branch
    // enumerated the deleted durable key/intent stores and died with them.
}


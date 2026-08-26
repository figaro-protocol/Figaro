"use client";

/**
 * createRegistryEventScan — factory for a K4 staked-intent registry's paired
 * event scan: the `registered` stream plus the `withdrawn` stream (surfacing
 * derives from the LIVE stake, so no reader folds one without the other).
 * `useRegisteredClausesByWallet` / `useAllRegisteredClauses`
 * (`useClauseRegistry.ts`) and `usePublishedAssemblies`
 * (`useAssemblyRegistry.ts`) each restated the same shape: read both streams
 * through the event cache, narrow to a registering wallet client-side over
 * the ONE cached scan, decode with the SDK's per-family parser, sort, and
 * report. This factory is that one shared shape — the precedent set by
 * `createUseWithdrawStake` beside it; each registry supplies its own address
 * getter, ABI, event names, and row projection.
 *
 * The `failed` flag is part of the shared contract: true when the last
 * registry read THREW — distinct from resolved-empty (an empty registry is
 * absence: render it; a failed read is unknown chain state: never report it
 * as loaded).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Abi, Log } from "viem";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { activeChain, publicClient } from "@/lib/shared/wagmi";

export interface RegistryEventScanConfig<Row> {
    /** The registry address if configured and well-formed, else null. */
    getRegistry: () => `0x${string}` | null;
    abi: Abi;
    registeredEventName: string;
    withdrawnEventName: string;
    /** Console-warn tag for a failed read. */
    label: string;
    /** Decode the two raw streams (the SDK parse — one per family) and shape
     *  the consumer's rows, including its own sort and any registeredBy-scoped
     *  surfacing rule. */
    toRows: (registeredLogs: Log[], withdrawnLogs: Log[], registeredBy?: `0x${string}`) => Row[];
}

export interface RegistryEventScanOptions {
    /** Narrow the registered stream to one registering wallet — client-side
     *  over the one cached scan. */
    registeredBy?: `0x${string}`;
    /** False parks the hook with `data: null` (idle, not resolved-empty) —
     *  e.g. a wallet-scoped reader before its wallet connects. Default true. */
    enabled?: boolean;
    /** Client override for app-tier callers holding wagmi's provider; the
     *  standalone `publicClient` by default, so the scan works on the
     *  marketing tier, which mounts no wallet provider. */
    client?: typeof publicClient;
}

/** Build a `useXRegistryScan()` hook bound to one registry family's config.
 *  The returned function is itself the hook — call it unconditionally at a
 *  component's top level, same as any other hook. */
export function createRegistryEventScan<Row>(config: RegistryEventScanConfig<Row>) {
    const { getRegistry, abi, registeredEventName, withdrawnEventName, label, toRows } = config;

    return function useRegistryEventScan(options: RegistryEventScanOptions = {}) {
        const { registeredBy, enabled = true, client } = options;
        const [data, setData] = useState<Row[] | null>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [failed, setFailed] = useState(false);
        const [generation, setGeneration] = useState(0);

        useEffect(() => {
            if (!enabled) {
                setData(null);
                return;
            }
            const registry = getRegistry();
            if (!registry) {
                setData([]);
                return;
            }
            let cancelled = false;
            setIsLoading(true);
            setFailed(false);

            const reader = client ?? publicClient;
            const chainId = reader.chain?.id ?? activeChain.id;
            Promise.all([
                cachedGetContractEvents(reader, chainId, {
                    address: registry,
                    abi,
                    eventName: registeredEventName,
                }),
                cachedGetContractEvents(reader, chainId, {
                    address: registry,
                    abi,
                    eventName: withdrawnEventName,
                }),
            ])
                .then(([registeredRaw, withdrawnRaw]) => {
                    if (cancelled) return;
                    const registeredLogs = (registeredBy
                        ? registeredRaw.filter(
                            (l) => String((l as { args?: { registeredBy?: string } }).args?.registeredBy ?? "").toLowerCase()
                                === registeredBy.toLowerCase(),
                        )
                        : registeredRaw) as Log[];
                    setData(toRows(registeredLogs, withdrawnRaw as Log[], registeredBy));
                    setIsLoading(false);
                })
                .catch((err) => {
                    if (cancelled) return;
                    console.warn(`[${label}] event read failed:`, err);
                    setFailed(true);
                    setData([]);
                    setIsLoading(false);
                });

            return () => {
                cancelled = true;
            };
        }, [registeredBy, enabled, client, generation]);

        const refetch = useCallback(() => setGeneration((g) => g + 1), []);
        return useMemo(() => ({ data, isLoading, failed, refetch }), [data, isLoading, failed, refetch]);
    };
}

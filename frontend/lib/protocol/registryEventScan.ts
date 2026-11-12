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
 * The read is a `NetworkRead<Row[]>` (`@/lib/shared/networkRead`): `pending`
 * while the scan is in flight, `present` with the rows the chain returned (an
 * empty registry is `present([])`), `absent` when the scan failed or no
 * registry is configured — never `[]` for a failure.
 */

import { useEffect, useMemo, useState } from "react";
import type { Abi, Log } from "viem";
import { cachedGetContractEvents } from "@/lib/core/eventCache";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { ABSENT, PENDING, mapRead, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import { hexEqual } from "@/lib/shared/evm";

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

    return function useRegistryEventScan(options: RegistryEventScanOptions = {}): {
        read: NetworkRead<Row[]>;
        refetch: () => void;
    } {
        const { registeredBy, enabled = true, client } = options;
        const [read, setRead] = useState<NetworkRead<Row[]>>(PENDING);
        const { generation, refetch } = useRefetchGeneration();

        useEffect(() => {
            if (!enabled) {
                setRead(PENDING);
                return;
            }
            const registry = getRegistry();
            if (!registry) {
                setRead(ABSENT);
                return;
            }
            let canceled = false;
            const reader = client ?? publicClient;
            const chainId = reader.chain?.id ?? activeChain.id;
            void readNetwork(label, async () => {
                const [registeredRaw, withdrawnRaw] = await Promise.all([
                    cachedGetContractEvents(reader, chainId, { address: registry, abi, eventName: registeredEventName }),
                    cachedGetContractEvents(reader, chainId, { address: registry, abi, eventName: withdrawnEventName }),
                ]);
                const registeredLogs = (registeredBy
                    ? registeredRaw.filter(
                        (l) => hexEqual((l as { args?: { registeredBy?: string } }).args?.registeredBy, registeredBy),
                    )
                    : registeredRaw) as Log[];
                return toRows(registeredLogs, withdrawnRaw as Log[], registeredBy);
            }).then((next) => {
                if (!canceled) setRead(next);
            });

            return () => {
                canceled = true;
            };
        }, [registeredBy, enabled, client, generation]);

        return useMemo(() => ({ read, refetch }), [read, refetch]);
    };
}

/**
 * Withdraw = de-surface, the one fold for every family: the network-wide read powers every
 * surfacing path, so it drops withdrawn stakes; the registering wallet's own read keeps them,
 * flagged, and `includeWithdrawn` keeps them for a reader whose job is showing the withdrawn
 * set (the registry explorer). Memoized: downstream hooks key on this array's identity (e.g.
 * the assembly-choices fold), so the filtered view stays referentially stable across renders.
 */
export function useDesurfaced<Row extends { stakeWithdrawn: boolean }>(
    scan: { read: NetworkRead<Row[]>; refetch: () => void },
    registeredBy: `0x${string}` | undefined,
    opts?: { includeWithdrawn?: boolean },
): { read: NetworkRead<Row[]>; refetch: () => void } {
    const keep = !!registeredBy || !!opts?.includeWithdrawn;
    const read = useMemo(
        () => (keep ? scan.read : mapRead(scan.read, (rows) => rows.filter((i) => !i.stakeWithdrawn))),
        [scan.read, keep],
    );
    return useMemo(() => ({ read, refetch: scan.refetch }), [read, scan.refetch]);
}

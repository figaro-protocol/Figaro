"use client";

/**
 * useClauseRegistry — readers for `ClauseRegistry.ClauseRegistered`.
 *
 * The on-chain event carries the readable `clauseId` and a `metadataURI` (the
 * IPFS locator) directly — so both the human name and the spec location come
 * straight off the chain. No preimage table, no bundled spec set. `family` and
 * `registrar` are indexed.
 *
 * Two readers:
 *   - `useRegisteredClausesByWallet` — wallet-scoped (the designer's "clauses you
 *     registered" list).
 *   - `useAllRegisteredClauses` — the whole registry, unfiltered. Drives the
 *     `/clauses` inventory and feeds the clause-spec loader (`useClauseSpecs`).
 *     Reads through the standalone `publicClient` so it works on the marketing
 *     tier, which mounts no wallet provider.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/core/contracts";
import { publicClient } from "@/lib/shared/wagmi";

export interface RegisteredClauseEvent {
    /** keccak256 of the human-readable clauseId string — the on-chain key the
     *  Attestation log and the validator binding use. */
    clauseIdHash: `0x${string}`;
    /** The human-readable clauseId, read straight from the event (e.g.
     *  "figaro-merchant-process-v1"). */
    clauseName: string;
    version: number;
    /** keccak256 of the canonical spec JSON — integrity digest. */
    contentHash: `0x${string}`;
    /** IPFS locator for the spec; `loadClauseSpec` fetches the spec from here. */
    metadataURI: string;
    /** keccak256 of the family slug (e.g. keccak256("geo")). Bound at
     *  registration; consumed by the RPGF Tier-1 weighting in the SP1 program. */
    family: `0x${string}`;
    registrar: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

/** The subset of a decoded `ClauseRegistered` log both readers consume. */
interface ClauseRegisteredLog {
    args?: unknown;
    blockNumber?: bigint | null;
    transactionHash?: string | null;
}

/** Map one decoded `ClauseRegistered` log to a `RegisteredClauseEvent`. Shared by
 *  both readers so the row shape can't drift between them. */
function mapClauseRegisteredLog(log: ClauseRegisteredLog): RegisteredClauseEvent {
    const args = (log.args ?? {}) as Partial<{
        clauseId: string;
        version: bigint | number;
        contentHash: `0x${string}`;
        metadataURI: string;
        family: `0x${string}`;
        registrar: `0x${string}`;
    }>;
    const clauseName = args.clauseId ?? "";
    return {
        clauseIdHash: keccak256(toBytes(clauseName)),
        clauseName,
        version: Number(args.version ?? 0),
        contentHash: (args.contentHash ?? "0x") as `0x${string}`,
        metadataURI: args.metadataURI ?? "",
        family: (args.family ?? "0x") as `0x${string}`,
        registrar: (args.registrar ?? "0x") as `0x${string}`,
        blockNumber: log.blockNumber ?? 0n,
        transactionHash: (log.transactionHash ?? "0x") as `0x${string}`,
    };
}

/** Read all `ClauseRegistered` events filtered by registrar wallet. Sorts
 *  most-recent block first. Call `refetch` to pick up newly registered clauses. */
export function useRegisteredClausesByWallet(registrar: `0x${string}` | undefined) {
    const client = usePublicClient();
    const [data, setData] = useState<RegisteredClauseEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.clauseRegistry;
        if (!client || !addr || addr.length !== 42 || !registrar) {
            setData(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        client
            .getContractEvents({
                address: addr,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
                args: { registrar },
                fromBlock: 0n,
                toBlock: "latest",
            })
            .then((logs) => {
                if (cancelled) return;
                const items = logs.map(mapClauseRegisteredLog);
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useRegisteredClausesByWallet] event read failed:", err);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [client, registrar, generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    const memoized = useMemo(() => ({ data, isLoading, refetch }), [data, isLoading, refetch]);
    return memoized;
}

/**
 * Read every `ClauseRegistered` event in the registry — the whole on-chain
 * clause set, unfiltered. Reads through the standalone `publicClient` so it works
 * on the marketing tier. `data` is `null` while the first read is in flight, then
 * the event list (empty = registry reachable but empty, or none configured).
 */
export function useAllRegisteredClauses() {
    const [data, setData] = useState<RegisteredClauseEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.clauseRegistry;
        if (!addr || addr.length !== 42) {
            setData([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        publicClient
            .getContractEvents({
                address: addr,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
                fromBlock: 0n,
                toBlock: "latest",
            })
            .then((logs) => {
                if (cancelled) return;
                const items = logs.map(mapClauseRegisteredLog);
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useAllRegisteredClauses] event read failed:", err);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return useMemo(() => ({ data, isLoading, refetch }), [data, isLoading, refetch]);
}

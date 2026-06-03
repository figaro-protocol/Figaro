"use client";

/**
 * useClauseRegistry — readers for `ClauseRegistry.ClauseRegistered`.
 *
 * The on-chain event is `ClauseRegistered(bytes32 indexed clauseId,
 * uint64 version, bytes32 uriHash, address indexed registrar)`; both
 * `clauseId` and `registrar` are indexed, so filtering by registrar is a
 * one-call event read.
 *
 * Two readers:
 *   - `useRegisteredClausesByWallet` — wallet-scoped (the designer's
 *     "clauses you registered" list). Reads through wagmi's public client.
 *   - `useAllRegisteredClauses` — the whole registry, unfiltered. Drives
 *     the `/clauses` inventory, a marketing-tier page that mounts no wagmi
 *     provider, so it reads through the standalone `publicClient` directly.
 *
 * Clause IDs on-chain are `keccak256("figaro-foo-v1")` — only the digest
 * lives in storage. To map back to the human name we hash every spec from
 * `listKnownClauseIds()` once and cache the inverse map. Clauses that aren't
 * in the bundled spec registry render with a short-hash fallback.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/core/contracts";
import { publicClient } from "@/lib/shared/wagmi";
import { listKnownClauseIds } from "@/lib/shared/clauseSpecSource";

export interface RegisteredClauseEvent {
    /** keccak256 of the human-readable clauseId string. The on-chain key. */
    clauseIdHash: `0x${string}`;
    /** Resolved human-readable clauseId (e.g. "figaro-merchant-process-v1")
     *  when the hash matches a bundled spec; null otherwise. */
    clauseName: string | null;
    version: number;
    uriHash: `0x${string}`;
    /** keccak256 of the family slug (e.g. keccak256("geo")). Permanently
     *  bound to the clause at registration; consumed by the RPGF Tier-1
     *  weighting in the SP1 program. */
    family: `0x${string}`;
    registrar: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

let HASH_TO_NAME: Map<string, string> | null = null;

/** Build (and cache) the inverse map keccak256(name) → name from the
 *  bundled spec registry. Lazy so test fixtures that swap the spec source
 *  pick up changes via `_resetClauseNameCache_TESTING_ONLY`. */
function getHashToNameMap(): Map<string, string> {
    if (HASH_TO_NAME !== null) return HASH_TO_NAME;
    const map = new Map<string, string>();
    for (const name of listKnownClauseIds()) {
        map.set(keccak256(toBytes(name)).toLowerCase(), name);
    }
    HASH_TO_NAME = map;
    return map;
}

/** Lookup the human-readable clauseId for a given on-chain hash, or null
 *  if the hash isn't one of the bundled specs. */
function resolveClauseName(clauseIdHash: `0x${string}`): string | null {
    return getHashToNameMap().get(clauseIdHash.toLowerCase()) ?? null;
}

/** The subset of a decoded `ClauseRegistered` log both readers consume.
 *  Viem's typed log is structurally assignable to this. */
interface ClauseRegisteredLog {
    args?: unknown;
    blockNumber?: bigint | null;
    transactionHash?: string | null;
}

/** Map one decoded `ClauseRegistered` log to a `RegisteredClauseEvent`.
 *  Shared by both readers so the row shape can't drift between them. */
function mapClauseRegisteredLog(log: ClauseRegisteredLog): RegisteredClauseEvent {
    const args = (log.args ?? {}) as Partial<{
        clauseId: `0x${string}`;
        version: bigint | number;
        uriHash: `0x${string}`;
        family: `0x${string}`;
        registrar: `0x${string}`;
    }>;
    const clauseIdHash = (args.clauseId ?? "0x") as `0x${string}`;
    return {
        clauseIdHash,
        clauseName: resolveClauseName(clauseIdHash),
        version: Number(args.version ?? 0),
        uriHash: (args.uriHash ?? "0x") as `0x${string}`,
        family: (args.family ?? "0x") as `0x${string}`,
        registrar: (args.registrar ?? "0x") as `0x${string}`,
        blockNumber: log.blockNumber ?? 0n,
        transactionHash: (log.transactionHash ?? "0x") as `0x${string}`,
    };
}

/** Read all `ClauseRegistered` events filtered by registrar wallet. Sorts
 *  most-recent block first. No caching, no auto-refresh — call `refetch` to
 *  pick up newly registered clauses after mount. */
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
 * clause set, unfiltered. Drives the `/clauses` inventory.
 *
 * Reads through the standalone `publicClient` (not wagmi's `usePublicClient`)
 * so it works on the marketing tier, which mounts no wallet provider. `data`
 * is `null` while the first read is in flight, then the event list — an empty
 * array means the registry is reachable but holds nothing, or no registry is
 * configured for the connected network.
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

/** Test-only — reset the lazy hash→name cache. Not exported from the index. */
function _resetClauseNameCache_TESTING_ONLY(): void {
    HASH_TO_NAME = null;
}

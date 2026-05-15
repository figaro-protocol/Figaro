"use client";

/**
 * useSchemaRegistry — wallet-scoped reads from `SchemaRegistry.SchemaRegistered`.
 *
 * Mirrors `usePublishedAssemblies` in `useAssemblyRegistry.ts`. The on-chain
 * event is `SchemaRegistered(bytes32 indexed schemaId, uint64 version,
 * bytes32 uriHash, address indexed registrar)`; both `schemaId` and
 * `registrar` are indexed, so filtering by registrar is a one-call event read.
 *
 * Schema IDs on-chain are `keccak256("figaro-foo-v1")` — only the digest
 * lives in storage. To map back to the human name we hash every spec from
 * `listKnownSchemaIds()` once and cache the inverse map. Schemas that aren't
 * in the bundled spec registry render with a short-hash fallback.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { keccak256, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import { CONTRACTS, SCHEMA_REGISTRY_ABI } from "@/lib/core/contracts";
import { listKnownSchemaIds } from "@/lib/shared/schemaSpecSource";

export interface RegisteredSchemaEvent {
    /** keccak256 of the human-readable schemaId string. The on-chain key. */
    schemaIdHash: `0x${string}`;
    /** Resolved human-readable schemaId (e.g. "figaro-merchant-process-v1")
     *  when the hash matches a bundled spec; null otherwise. */
    schemaName: string | null;
    version: number;
    uriHash: `0x${string}`;
    registrar: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

let HASH_TO_NAME: Map<string, string> | null = null;

/** Build (and cache) the inverse map keccak256(name) → name from the
 *  bundled spec registry. Lazy so test fixtures that swap the spec source
 *  pick up changes via `_resetSchemaNameCache_TESTING_ONLY`. */
function getHashToNameMap(): Map<string, string> {
    if (HASH_TO_NAME !== null) return HASH_TO_NAME;
    const map = new Map<string, string>();
    for (const name of listKnownSchemaIds()) {
        map.set(keccak256(toBytes(name)).toLowerCase(), name);
    }
    HASH_TO_NAME = map;
    return map;
}

/** Lookup the human-readable schemaId for a given on-chain hash, or null
 *  if the hash isn't one of the bundled specs. */
export function resolveSchemaName(schemaIdHash: `0x${string}`): string | null {
    return getHashToNameMap().get(schemaIdHash.toLowerCase()) ?? null;
}

/** Read all `SchemaRegistered` events filtered by registrar wallet. Sorts
 *  most-recent block first. No caching, no auto-refresh — call `refetch` to
 *  pick up newly registered schemas after mount. */
export function useRegisteredSchemasByWallet(registrar: `0x${string}` | undefined) {
    const client = usePublicClient();
    const [data, setData] = useState<RegisteredSchemaEvent[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.schemaRegistry;
        if (!client || !addr || addr.length !== 42 || !registrar) {
            setData(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        client
            .getContractEvents({
                address: addr,
                abi: SCHEMA_REGISTRY_ABI,
                eventName: "SchemaRegistered",
                args: { registrar },
                fromBlock: 0n,
                toBlock: "latest",
            })
            .then((logs) => {
                if (cancelled) return;
                const items: RegisteredSchemaEvent[] = logs.map((log) => {
                    const args = log.args as Partial<{
                        schemaId: `0x${string}`;
                        version: bigint | number;
                        uriHash: `0x${string}`;
                        registrar: `0x${string}`;
                    }>;
                    const schemaIdHash = (args.schemaId ?? "0x") as `0x${string}`;
                    return {
                        schemaIdHash,
                        schemaName: resolveSchemaName(schemaIdHash),
                        version: Number(args.version ?? 0),
                        uriHash: (args.uriHash ?? "0x") as `0x${string}`,
                        registrar: (args.registrar ?? "0x") as `0x${string}`,
                        blockNumber: log.blockNumber ?? 0n,
                        transactionHash: log.transactionHash as `0x${string}`,
                    };
                });
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useRegisteredSchemasByWallet] event read failed:", err);
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

/** Test-only — reset the lazy hash→name cache. Not exported from the index. */
export function _resetSchemaNameCache_TESTING_ONLY(): void {
    HASH_TO_NAME = null;
}

"use client";

/**
 * useClauseRegistry — readers for `ClauseRegistry.ClauseRegistered`.
 *
 * The on-chain event carries the readable `clauseId` and a `contentURI` (the
 * IPFS locator) directly — so both the human name and the spec location come
 * straight off the chain. No preimage table, no bundled spec set. `registrar` is
 * indexed. (Grouping is `block.article` in the spec JSON — no on-chain group field.)
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
import type { Log } from "viem";
import { computeClauseKey, parseClauseRegistryLogs } from "@figaro/sdk";
import { usePublicClient } from "wagmi";
import { CONTRACTS, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { publicClient } from "@/lib/shared/wagmi";

export interface RegisteredClauseEvent {
    /** `keccak256(abi.encode(clauseId, version))` — the on-chain key the
     *  Attestation log and the withdraw fold use. SDK vocabulary
     *  (`RegisteredClause.idHash`). */
    idHash: `0x${string}`;
    /** The bare human-readable clause name, read straight from the event (e.g.
     *  "figaro-merchant-process"). SDK vocabulary (`RegisteredClause.clauseId`). */
    clauseId: string;
    version: number;
    /** keccak256 of the canonical spec JSON — integrity digest. */
    contentHash: `0x${string}`;
    /** IPFS locator for the spec; `loadClauseSpec` fetches the spec from here. */
    contentURI: string;
    registrar: `0x${string}`;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the registrar reclaimed the registration deposit (K4:
     *  surfacing derives from the live stake — withdraw = de-surface for
     *  NEW compositions). The binding is permanent: committed agreements
     *  keep resolving the clause, so spec-loading NEVER filters on this;
     *  only offering surfaces (drawer, inventory) do. */
    stakeWithdrawn: boolean;
}

/** Decode raw registry logs through the SDK parser and shape the UI rows.
 *  Shared by both readers so the row shape can't drift between them. The
 *  withdraw fold (`DepositWithdrawn` by idHash) rides the same parse. */
function toRegisteredClauseEvents(registeredLogs: Log[], withdrawnLogs: Log[]): RegisteredClauseEvent[] {
    const withdrawnKeys = new Set(
        parseClauseRegistryLogs(withdrawnLogs).withdrawn.map((w) => w.idHash.toLowerCase()),
    );
    return parseClauseRegistryLogs(registeredLogs).registered.map((row) => {
        const idHash = computeClauseKey(row.clauseId, row.version);
        return {
            idHash,
            clauseId: row.clauseId,
            version: row.version,
            contentHash: row.contentHash,
            contentURI: row.contentURI,
            registrar: row.registrar,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: row.transactionHash ?? "0x",
            stakeWithdrawn: withdrawnKeys.has(idHash.toLowerCase()),
        };
    });
}

/** Read all `DepositWithdrawn` logs, raw — decoded by the SDK parser above. */
async function fetchWithdrawnClauseLogs(
    client: { getContractEvents: typeof publicClient.getContractEvents },
    addr: `0x${string}`,
): Promise<Log[]> {
    return client.getContractEvents({
        address: addr,
        abi: CLAUSE_REGISTRY_ABI,
        eventName: "DepositWithdrawn",
        fromBlock: 0n,
        toBlock: "latest",
    });
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

        Promise.all([
            client.getContractEvents({
                address: addr,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
                args: { registrar },
                fromBlock: 0n,
                toBlock: "latest",
            }),
            fetchWithdrawnClauseLogs(client, addr),
        ])
            .then(([logs, withdrawn]) => {
                if (cancelled) return;
                const items = toRegisteredClauseEvents(logs, withdrawn);
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
    /** True when the last registry read THREW — distinct from resolved-empty:
     *  an empty registry is absence (render it); a failed read is unknown
     *  (never report it as loaded). */
    const [failed, setFailed] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const addr = CONTRACTS.clauseRegistry;
        if (!addr || addr.length !== 42) {
            setData([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setFailed(false);

        Promise.all([
            publicClient.getContractEvents({
                address: addr,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
                fromBlock: 0n,
                toBlock: "latest",
            }),
            fetchWithdrawnClauseLogs(publicClient, addr),
        ])
            .then(([logs, withdrawn]) => {
                if (cancelled) return;
                const items = toRegisteredClauseEvents(logs, withdrawn);
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useAllRegisteredClauses] event read failed:", err);
                setFailed(true);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return useMemo(() => ({ data, isLoading, failed, refetch }), [data, isLoading, failed, refetch]);
}

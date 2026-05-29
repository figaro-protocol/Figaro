"use client";

/**
 * React hooks for reading manifest clauses from ClauseRegistry.
 *
 * Live ClauseRegistry exposes: registered(bytes32), registerClause(), setMechanismClause().
 * Clause details and counts are derived from indexed events (ClauseRegistered, MechanismClauseSet).
 */

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import {
    CONTRACTS,
    CLAUSE_REGISTRY_ABI,
} from "../core/contracts";
import { ZERO_BYTES32 } from "../shared/evm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManifestClause {
    clauseId: `0x${string}`;
    version: number;
    uriHash: `0x${string}`;
    active: boolean;
}

// ── Hook: lookup a single clause ─────────────────────────────────────────────

export function useManifestClause(clauseId: `0x${string}` | undefined) {
    const addr = CONTRACTS.clauseRegistry;
    const hasAddr = !!addr && addr.length === 42;
    const publicClient = usePublicClient();
    const [clause, setClause] = useState<ManifestClause | null>(null);

    // Live registry: check if registered
    const { data: isRegistered, isLoading, error } = useReadContract({
        address: hasAddr ? addr : undefined,
        abi: CLAUSE_REGISTRY_ABI,
        functionName: "registered",
        args: clauseId ? [clauseId] : undefined,
        query: { enabled: hasAddr && !!clauseId },
    });

    // If registered, try to get version/uriHash from ClauseRegistered events
    useEffect(() => {
        if (!isRegistered || !clauseId || !publicClient || !hasAddr) {
            setClause(isRegistered && clauseId ? {
                clauseId,
                version: 1,
                uriHash: ZERO_BYTES32,
                active: true,
            } : null);
            return;
        }

        publicClient.getContractEvents({
            address: addr,
            abi: CLAUSE_REGISTRY_ABI,
            eventName: "ClauseRegistered",
            args: { clauseId },
            fromBlock: 0n,
            toBlock: "latest",
        }).then((logs) => {
            if (logs.length > 0) {
                const latest = logs[logs.length - 1];
                const a = latest.args as Partial<{ version: bigint | number; uriHash: `0x${string}` }>;
                setClause({
                    clauseId,
                    version: Number(a.version ?? 1),
                    uriHash: (a.uriHash ?? ZERO_BYTES32) as `0x${string}`,
                    active: true,
                });
            } else {
                setClause({ clauseId, version: 1, uriHash: ZERO_BYTES32, active: true });
            }
        }).catch(() => {
            setClause({ clauseId, version: 1, uriHash: ZERO_BYTES32, active: true });
        });
    }, [isRegistered, clauseId, publicClient, hasAddr, addr]);

    return { clause, isLoading, error };
}

// ── Hook: registry stats ─────────────────────────────────────────────────────

export function useManifestClauseCount() {
    const addr = CONTRACTS.clauseRegistry;
    const hasAddr = !!addr && addr.length === 42;
    const publicClient = usePublicClient();
    const [count, setCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!publicClient || !hasAddr) {
            setCount(0);
            return;
        }

        setIsLoading(true);
        publicClient.getContractEvents({
            address: addr,
            abi: CLAUSE_REGISTRY_ABI,
            eventName: "ClauseRegistered",
            fromBlock: 0n,
            toBlock: "latest",
        }).then((logs) => {
            // Count unique clause IDs
            const uniqueClauses = new Set(
                logs
                    .map((log) => (log.args as Partial<{ clauseId: `0x${string}` }>).clauseId)
                    .filter((clauseId): clauseId is `0x${string}` => typeof clauseId === "string"),
            );
            setCount(uniqueClauses.size);
        }).catch(() => {
            setCount(0);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [publicClient, hasAddr, addr]);

    return { count, isLoading };
}

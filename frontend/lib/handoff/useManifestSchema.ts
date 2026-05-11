"use client";

/**
 * React hooks for reading manifest schemas from SchemaRegistry.
 *
 * Live SchemaRegistry exposes: registered(bytes32), registerSchema(), setMechanismSchema().
 * Schema details and counts are derived from indexed events (SchemaRegistered, MechanismSchemaSet).
 */

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import {
    CONTRACTS,
    SCHEMA_REGISTRY_ABI,
} from "../core/contracts";
import { ZERO_BYTES32 } from "../shared/evm";

/** Well-known schema IDs — shared constants for all archetypes. */
export const FULFILMENT_V2_SCHEMA_KEY = "figaro-fulfilment-v2";
export const COMMERCE_SCHEMA_KEY = "figaro-commerce-v1";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ManifestSchema {
    schemaId: `0x${string}`;
    version: number;
    uriHash: `0x${string}`;
    active: boolean;
}

// ── Hook: lookup a single schema ─────────────────────────────────────────────

export function useManifestSchema(schemaId: `0x${string}` | undefined) {
    const addr = CONTRACTS.schemaRegistry;
    const hasAddr = !!addr && addr.length === 42;
    const publicClient = usePublicClient();
    const [schema, setSchema] = useState<ManifestSchema | null>(null);

    // Live registry: check if registered
    const { data: isRegistered, isLoading, error } = useReadContract({
        address: hasAddr ? addr : undefined,
        abi: SCHEMA_REGISTRY_ABI,
        functionName: "registered",
        args: schemaId ? [schemaId] : undefined,
        query: { enabled: hasAddr && !!schemaId },
    });

    // If registered, try to get version/uriHash from SchemaRegistered events
    useEffect(() => {
        if (!isRegistered || !schemaId || !publicClient || !hasAddr) {
            setSchema(isRegistered && schemaId ? {
                schemaId,
                version: 1,
                uriHash: ZERO_BYTES32,
                active: true,
            } : null);
            return;
        }

        publicClient.getContractEvents({
            address: addr,
            abi: SCHEMA_REGISTRY_ABI,
            eventName: "SchemaRegistered",
            args: { schemaId },
            fromBlock: 0n,
            toBlock: "latest",
        }).then((logs) => {
            if (logs.length > 0) {
                const latest = logs[logs.length - 1];
                const a = latest.args as Partial<{ version: bigint | number; uriHash: `0x${string}` }>;
                setSchema({
                    schemaId,
                    version: Number(a.version ?? 1),
                    uriHash: (a.uriHash ?? ZERO_BYTES32) as `0x${string}`,
                    active: true,
                });
            } else {
                setSchema({ schemaId, version: 1, uriHash: ZERO_BYTES32, active: true });
            }
        }).catch(() => {
            setSchema({ schemaId, version: 1, uriHash: ZERO_BYTES32, active: true });
        });
    }, [isRegistered, schemaId, publicClient, hasAddr, addr]);

    return { schema, isLoading, error };
}

// ── Hook: registry stats ─────────────────────────────────────────────────────

export function useManifestSchemaCount() {
    const addr = CONTRACTS.schemaRegistry;
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
            abi: SCHEMA_REGISTRY_ABI,
            eventName: "SchemaRegistered",
            fromBlock: 0n,
            toBlock: "latest",
        }).then((logs) => {
            // Count unique schema IDs
            const uniqueSchemas = new Set(
                logs
                    .map((log) => (log.args as Partial<{ schemaId: `0x${string}` }>).schemaId)
                    .filter((schemaId): schemaId is `0x${string}` => typeof schemaId === "string"),
            );
            setCount(uniqueSchemas.size);
        }).catch(() => {
            setCount(0);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [publicClient, hasAddr, addr]);

    return { count, isLoading };
}

/**
 * lib/mechanisms/useOperatorRegistry.ts
 *
 * Hook for writing to the OperatorRegistry contract.
 * Read state derived from indexer events (event-only contract).
 *
 * Web2-strip (2026-04-26): updateProfile / deactivate / reactivate hooks
 * removed alongside their on-chain functions. To switch role or metadata,
 * an operator withdraws and re-registers — the dedup guard is cleared on
 * withdraw. Lifecycle / availability is signal-by-availability off-chain,
 * not registry state.
 */
import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContract } from "wagmi";
import { getOperatorRegistry, OPERATOR_REGISTRY_ABI } from "./contracts";
import { getOperatorState, getOperatorMetadataURI } from "@/lib/core/indexer";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

// Mirror the Solidity enum: None=0, Merchant=1, Driver=2, Both=3
export const OperatorRole = { None: 0, Merchant: 1, Driver: 2, Both: 3 } as const;

const registry = getOperatorRegistry();

// ── Agent service types (ERC-8004 interop) ───────────────────────────────────

/** Service endpoints an autonomous agent may declare in its metadataURI JSON. */
export interface AgentServices {
    mcp?: string;
    a2a?: string;
    rest?: string;
    did?: string;
    ens?: string;
}

/** Parsed agent service info from operator metadata. */
export interface AgentServiceInfo {
    services: AgentServices;
    capabilities: string[];
    isAgent: boolean;
}

/**
 * Extract agent service endpoints from a fetched metadata JSON object.
 * Returns { isAgent: false } if no services key is present.
 */
export function parseAgentServices(metadata: Record<string, unknown>): AgentServiceInfo {
    const services = metadata.services;
    if (!services || typeof services !== "object") {
        return { services: {}, capabilities: [], isAgent: false };
    }
    const s = services as Record<string, unknown>;
    const caps = Array.isArray(metadata.capabilities)
        ? (metadata.capabilities as unknown[]).filter((c): c is string => typeof c === "string")
        : [];
    return {
        services: {
            mcp: typeof s.mcp === "string" ? s.mcp : undefined,
            a2a: typeof s.a2a === "string" ? s.a2a : undefined,
            rest: typeof s.rest === "string" ? s.rest : undefined,
            did: typeof s.did === "string" ? s.did : undefined,
            ens: typeof s.ens === "string" ? s.ens : undefined,
        },
        capabilities: caps,
        isAgent: true,
    };
}

// ── Read hooks (indexer-backed) ──────────────────────────────────────────────

/** [role, metadataURI, registeredBlock] — derived from OperatorRegistered events. */
export type OperatorProfileData = readonly [number, string, bigint | null];

/**
 * Returns the operator's role and metadataURI from indexed events.
 * Returns undefined if the address has not registered (or has registered
 * and then withdrawn — withdraw clears the dedup guard).
 */
export function useOperatorProfile(address: `0x${string}` | undefined) {
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<OperatorProfileData | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        if (!client || !address) {
            setData(undefined);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        getOperatorState(client, chainId, address).then((state) => {
            if (cancelled) return;
            if (state) {
                setData([state.role, state.metadataURI, state.registeredBlock] as const);
            } else {
                setData(undefined);
            }
            setIsLoading(false);
        }).catch(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [client, chainId, address, generation]);

    return { data, isLoading, refetch: () => setGeneration((g) => g + 1) };
}

// ── Write hooks ───────────────────────────────────────────────────────────────

export function useRegisterOperator() {
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    async function register(role: number, metadataURI: string, value?: bigint) {
        if (!registry) return;
        return writeContractAsync({
            address: registry,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: "register",
            args: [role, metadataURI],
            value: value ?? 0n,
        });
    }

    return { register, isPending, isConfirming, isSuccess, error, hash };
}

export function useWithdrawDeposit() {
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    async function withdraw() {
        if (!registry) return;
        return writeContractAsync({
            address: registry,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: "withdraw",
        });
    }

    return { withdraw, isPending, isConfirming, isSuccess, error, hash };
}

export function useRegistrationDeposit() {
    return useReadContract({
        address: registry ?? undefined,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: "registrationDeposit",
    });
}

export function useDepositLockPeriod() {
    return useReadContract({
        address: registry ?? undefined,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: "depositLockPeriod",
    });
}

// ── Agent service discovery hook ─────────────────────────────────────────────

/**
 * Fetches an operator's metadataURI and parses ERC-8004-compatible
 * agent service endpoints if present. Returns { isAgent: false } for
 * human-operated participants (no services key in metadata).
 */
export function useAgentServices(address: `0x${string}` | undefined) {
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<AgentServiceInfo | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!client || !address) {
            setData(undefined);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        getOperatorMetadataURI(client, chainId, address)
            .then((uri) => {
                if (cancelled || !uri) {
                    if (!cancelled) {
                        setData({ services: {}, capabilities: [], isAgent: false });
                        setIsLoading(false);
                    }
                    return;
                }
                return fetch(uri).then((r) => safeJsonFromResponse(r));
            })
            .then((json) => {
                if (cancelled) return;
                if (json && typeof json === "object") {
                    setData(parseAgentServices(json as Record<string, unknown>));
                } else {
                    setData({ services: {}, capabilities: [], isAgent: false });
                }
                setIsLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setData({ services: {}, capabilities: [], isAgent: false });
                    setIsLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [client, chainId, address]);

    return { data, isLoading };
}

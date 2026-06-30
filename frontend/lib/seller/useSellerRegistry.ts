/**
 * lib/mechanisms/useSellerRegistry.ts
 *
 * Hooks for writing to the SellerRegistry contract — register, updateProfile,
 * withdraw — and for reading event-derived seller state.
 *
 * The on-chain surface carries no role taxonomy and no categorization
 * field. A seller's business is inferred from their catalogue items
 * (referenced by `metadataURI`); role attribution at the runtime tier
 * comes from event-derived state via the indexer, never from a metadata
 * field. Lifecycle / availability is signal-by-availability off-chain,
 * not registry state.
 */
import { useCallback, useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContract } from "wagmi";
import { getSellerRegistry } from "@/lib/core/contracts";
import { SELLER_REGISTRY_ABI } from "@figaro/core";
import { getSellerState, getSellerMetadataURI } from "@/lib/core/indexer";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { resolveContentUri } from "@/lib/shared/ipfsService";
import {
    AgentServiceInfo,
    SellerAgentServices,
    projectAgentServices,
} from "@/lib/seller/sellerProfileMetadata";

const registry = getSellerRegistry();

// ── Agent service types (ERC-8004 interop) ───────────────────────────────────

/**
 * Service endpoints an autonomous agent may declare in its metadataURI
 * JSON. Re-exported under the historical name; new code should import
 * `SellerAgentServices` from `sellerProfileMetadata`.
 */
type AgentServices = SellerAgentServices;

export type { AgentServiceInfo };

/**
 * Extract agent service endpoints from a fetched metadata JSON object.
 * Delegates to the canonical projection in `sellerProfileMetadata`;
 * retained as a thin wrapper so existing call-sites keep working.
 */
export function parseAgentServices(metadata: Record<string, unknown>): AgentServiceInfo {
    return projectAgentServices(metadata);
}

// ── Read hooks (indexer-backed) ──────────────────────────────────────────────

/** [metadataURI, registeredBlock] — derived from seller-registry events. */
export type SellerProfileData = readonly [string, bigint | null];

/**
 * Returns the seller's current metadataURI and registration block from
 * indexed events. Returns undefined if the address has never registered or
 * has withdrawn since (withdraw clears the dedup guard).
 */
export function useSellerProfile(address: `0x${string}` | undefined) {
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<SellerProfileData | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        if (!client || !address) {
            setData(undefined);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        getSellerState(client, chainId, address).then((state) => {
            if (cancelled) return;
            if (state) {
                // Only emit a fresh tuple ref when the underlying values
                // actually changed — otherwise consumers' `useEffect`s
                // keyed on `data` re-fire on every poll for nothing,
                // which compounds into update-depth thrash on routes
                // that chain `refetch() + router.push(...)` in a
                // success-useEffect (see /sellers/edit/* family).
                setData((prev) => {
                    const same = prev
                        && prev[0] === state.metadataURI
                        && prev[1] === state.registeredBlock;
                    return same ? prev : [state.metadataURI, state.registeredBlock] as const;
                });
            } else {
                setData(undefined);
            }
            setIsLoading(false);
        }).catch(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [client, chainId, address, generation]);

    // Stable refetch — a new arrow function on every render makes any
    // consumer that puts `refetch` in a `useEffect` dep array re-fire
    // on every parent render, which is what powered the post-success
    // refetch-redirect cycle on /sellers/edit/<route> pages.
    const refetch = useCallback(() => setGeneration((g) => g + 1), []);

    return { data, isLoading, refetch };
}

// ── Write hooks ───────────────────────────────────────────────────────────────

// Each write hook below follows the canonical 4-step pattern:
//   simulate → write → wait → status-check
// Simulate runs before the wallet opens so the user sees a typed revert
// (kernel error name, decoded via the merged extractErrorMessage) instead
// of a silent on-chain revert after submission. The returned `isSuccess`
// is gated on `receipt.status === "success"` — `useWaitForTransactionReceipt`'s
// own `isSuccess` flag fires on receipt-fetched, which is true even when
// the transaction reverted.

export function useRegisterSeller() {
    const client = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const {
        isLoading: isConfirming,
        isSuccess: receiptFetched,
        data: receipt,
    } = useWaitForTransactionReceipt({ hash });
    const isSuccess = receiptFetched && receipt?.status === "success";

    async function register(metadataURI: string, value?: bigint) {
        if (!registry) throw new Error("SellerRegistry address not configured");
        if (!client) throw new Error("No public client available");
        if (!account) throw new Error("Wallet not connected");
        await client.simulateContract({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "register",
            args: [metadataURI],
            value: value ?? 0n,
            account,
        });
        const txHash = await writeContractAsync({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "register",
            args: [metadataURI],
            value: value ?? 0n,
        });
        const r = await client.waitForTransactionReceipt({ hash: txHash });
        if (r.status !== "success") {
            throw new Error(`Register transaction reverted on-chain (tx ${txHash}).`);
        }
        return txHash;
    }

    return { register, isPending, isConfirming, isSuccess, error, hash };
}

export function useUpdateProfile() {
    const client = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const {
        isLoading: isConfirming,
        isSuccess: receiptFetched,
        data: receipt,
    } = useWaitForTransactionReceipt({ hash });
    const isSuccess = receiptFetched && receipt?.status === "success";

    async function updateProfile(metadataURI: string) {
        if (!registry) throw new Error("SellerRegistry address not configured");
        if (!client) throw new Error("No public client available");
        if (!account) throw new Error("Wallet not connected");
        await client.simulateContract({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "updateProfile",
            args: [metadataURI],
            account,
        });
        const txHash = await writeContractAsync({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "updateProfile",
            args: [metadataURI],
        });
        const r = await client.waitForTransactionReceipt({ hash: txHash });
        if (r.status !== "success") {
            throw new Error(`Profile update reverted on-chain (tx ${txHash}).`);
        }
        return txHash;
    }

    return { updateProfile, isPending, isConfirming, isSuccess, error, hash };
}

export function useWithdrawDeposit() {
    const client = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const {
        isLoading: isConfirming,
        isSuccess: receiptFetched,
        data: receipt,
    } = useWaitForTransactionReceipt({ hash });
    const isSuccess = receiptFetched && receipt?.status === "success";

    async function withdraw() {
        if (!registry) throw new Error("SellerRegistry address not configured");
        if (!client) throw new Error("No public client available");
        if (!account) throw new Error("Wallet not connected");
        await client.simulateContract({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "withdraw",
            account,
        });
        const txHash = await writeContractAsync({
            address: registry,
            abi: SELLER_REGISTRY_ABI,
            functionName: "withdraw",
        });
        const r = await client.waitForTransactionReceipt({ hash: txHash });
        if (r.status !== "success") {
            throw new Error(`Withdraw transaction reverted on-chain (tx ${txHash}).`);
        }
        return txHash;
    }

    return { withdraw, isPending, isConfirming, isSuccess, error, hash };
}

export function useRegistrationDeposit() {
    return useReadContract({
        address: registry ?? undefined,
        abi: SELLER_REGISTRY_ABI,
        functionName: "registrationDeposit",
    });
}

export function useDepositLockPeriod() {
    return useReadContract({
        address: registry ?? undefined,
        abi: SELLER_REGISTRY_ABI,
        functionName: "depositLockPeriod",
    });
}

// ── Agent service discovery hook ─────────────────────────────────────────────

/**
 * Fetches an seller's metadataURI and parses ERC-8004-compatible
 * agent service endpoints if present. Returns { isAgent: false } for
 * human-operated participants (no services key in metadata).
 */
function useAgentServices(address: `0x${string}` | undefined) {
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

        getSellerMetadataURI(client, chainId, address)
            .then((uri) => {
                // The on-chain metadataURI is an `ipfs://` URI; the browser
                // cannot fetch that scheme directly — resolve it to the
                // gateway URL first. `resolveContentUri` returns null for an
                // unrecognised scheme, handled here like a missing URI.
                const url = uri ? resolveContentUri(uri) : null;
                if (cancelled || !url) {
                    if (!cancelled) {
                        setData({ services: {}, capabilities: [], isAgent: false });
                        setIsLoading(false);
                    }
                    return;
                }
                return fetch(url).then((r) => safeJsonFromResponse(r));
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

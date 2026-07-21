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
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContract } from "wagmi";
import { getSellerRegistry } from "@/lib/kernel/contracts";
import { SELLER_REGISTRY_ABI } from "@figaro/sdk";
import { getSellerState } from "@/lib/protocol/sellerRegistryIndexer";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { fetchCappedContent, resolveContentUri } from "@/lib/shared/ipfsService";
import { useAsyncSellerResource } from "@/lib/seller/useAsyncSellerResource";
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
    // "Not scanned yet" must not read as "scanned and absent": isLoading
    // starts TRUE and settles false only when a scan completes. The prior
    // false start left commit windows (wagmi client/address still hydrating
    // → the effect's early return) where consumers saw
    // {data: undefined, isLoading: false} and treated an unscanned wallet
    // as unregistered — the /sellers/edit/* guards redirected mid-session
    // on exactly that window, killing in-flight saves (e2e flake 2026-07-09).
    const [isLoading, setIsLoading] = useState(true);
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
        await verifyTxSuccess(client, txHash, "The seller was not registered.");
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
        await verifyTxSuccess(client, txHash, "The profile was not updated.");
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
        await verifyTxSuccess(client, txHash, "The deposit was not withdrawn.");
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

// ── Agent service discovery hook ─────────────────────────────────────────────

/** The absence value: a human-operated participant (no services key). */
const NO_AGENT_SERVICES: AgentServiceInfo = { services: {}, capabilities: [], isAgent: false };

/**
 * Fetches a seller's metadataURI and parses ERC-8004-compatible
 * agent service endpoints if present. Returns { isAgent: false } for
 * human-operated participants (no services key in metadata). Absence
 * semantics all the way down: a missing/unfetchable/unparsable document is
 * a human participant, never an error. Built on the ONE seller-resource
 * fetcher (`useAsyncSellerResource`).
 */
export function useAgentServices(address: `0x${string}` | undefined) {
    const { data, isLoading } = useAsyncSellerResource<AgentServiceInfo>(address, {
        fetcher: async (metadataURI) => {
            // The on-chain metadataURI is an `ipfs://` URI; the browser
            // cannot fetch that scheme directly — resolve it to the gateway
            // URL first. `resolveContentUri` returns null for an
            // unrecognised scheme, handled like a missing URI.
            const url = resolveContentUri(metadataURI);
            if (!url) return NO_AGENT_SERVICES;
            try {
                // Size-capped fetch (F4): the seller-pinned metadata document
                // is external-party-controlled — oversize throws → absence.
                const json = await fetchCappedContent(url).then((r) => safeJsonFromResponse(r));
                return json && typeof json === "object"
                    ? parseAgentServices(json as Record<string, unknown>)
                    : NO_AGENT_SERVICES;
            } catch {
                return NO_AGENT_SERVICES;
            }
        },
        failureMessage: "Agent services unavailable",
    });
    return { data: data ?? undefined, isLoading };
}

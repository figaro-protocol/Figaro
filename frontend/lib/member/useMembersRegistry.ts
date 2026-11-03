/**
 * lib/member/useMembersRegistry.ts
 *
 * Hooks for writing to the MembersRegistry contract — register, updateProfile,
 * requestWithdrawal/withdraw — and for reading event-derived member state.
 *
 * The on-chain surface carries no role taxonomy and no categorization
 * field. A member's business is inferred from their catalog items
 * (referenced by `metadataURI`); role attribution at the runtime tier
 * comes from event-derived state via the indexer, never from a metadata
 * field. Lifecycle / availability is signal-by-availability off-chain,
 * not registry state.
 */
import { useState, useEffect } from "react";
import type { Abi } from "viem";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContract } from "wagmi";
import { getMembersRegistry } from "@/lib/kernel/contracts";
import { MEMBERS_REGISTRY_ABI } from "@figaro-protocol/sdk";
import { getMemberState } from "@/lib/protocol/membersRegistryIndexer";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { fetchCappedContent, resolveMemberDocumentUri } from "@/lib/shared/ipfsService";
import { useAsyncMemberResource } from "@/lib/member/useAsyncMemberResource";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import { PENDING, present, queryRead, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import {
    AgentServiceInfo,
    MemberAgentServices,
    projectAgentServices,
} from "@/lib/member/memberProfileMetadata";

const registry = getMembersRegistry();

// ── Agent service types (ERC-8004 interop) ───────────────────────────────────

/**
 * Service endpoints an autonomous agent may declare in its metadataURI
 * JSON. Re-exported under the historical name; new code should import
 * `MemberAgentServices` from `memberProfileMetadata`.
 */
type AgentServices = MemberAgentServices;

export type { AgentServiceInfo };

/**
 * Extract agent service endpoints from a fetched metadata JSON object.
 * Delegates to the canonical projection in `memberProfileMetadata`;
 * retained as a thin wrapper so existing call-sites keep working.
 */
export function parseAgentServices(metadata: Record<string, unknown>): AgentServiceInfo {
    return projectAgentServices(metadata);
}

// ── Read hooks (indexer-backed) ──────────────────────────────────────────────

/** What the MembersRegistry events say of one wallet: registered (with its
 *  current metadataURI and registration block), or not registered — a
 *  resolved answer, never the stand-in for a failed read. */
export type MemberRegistration =
    | { readonly registered: false }
    | { readonly registered: true; readonly metadataURI: string; readonly registeredBlock: bigint | null };

const NOT_REGISTERED: MemberRegistration = Object.freeze({ registered: false as const });

/**
 * The wallet's registration, read from indexed events as a `NetworkRead`:
 * `pending` until the scan completes (including while the wallet or client
 * is still hydrating — an unscanned wallet never reads as unregistered),
 * `present` with the chain's answer, `absent` when the read failed — which a
 * consumer never takes for "unregistered" (no redirect, no register button).
 */
export function useMemberProfile(address: `0x${string}` | undefined): {
    read: NetworkRead<MemberRegistration>;
    refetch: () => void;
} {
    const client = usePublicClient();
    const chainId = useChainId();
    const [read, setRead] = useState<NetworkRead<MemberRegistration>>(PENDING);
    const { generation, refetch } = useRefetchGeneration();

    useEffect(() => {
        if (!client || !address) {
            setRead(PENDING);
            return;
        }

        let canceled = false;

        void readNetwork("useMemberProfile", () => getMemberState(client, chainId, address)).then((next) => {
            if (canceled) return;
            if (next.status !== "present") {
                setRead(next);
                return;
            }
            const state = next.value;
            // Only emit a fresh value when the underlying registration
            // actually changed — otherwise consumers' `useEffect`s keyed on
            // it re-fire on every poll for nothing, which compounds into
            // update-depth thrash on routes that chain
            // `refetch() + router.push(...)` in a success-useEffect (see
            // /members/edit/* family).
            setRead((prev) => {
                const was = prev.status === "present" ? prev.value : null;
                if (!state) return was && !was.registered ? prev : present(NOT_REGISTERED);
                const same = was?.registered
                    && was.metadataURI === state.metadataURI
                    && was.registeredBlock === state.registeredBlock;
                return same
                    ? prev
                    : present({ registered: true, metadataURI: state.metadataURI, registeredBlock: state.registeredBlock });
            });
        });

        return () => { canceled = true; };
    }, [client, chainId, address, generation]);

    return { read, refetch };
}

// ── Write hooks ───────────────────────────────────────────────────────────────

// Each write hook below follows the canonical 4-step pattern:
//   simulate → write → wait → status-check
// Simulate runs before the wallet opens so the user sees a typed revert
// (FigaroCore error name, decoded via the merged extractErrorMessage) instead
// of a silent on-chain revert after submission. The returned `isSuccess`
// is gated on `receipt.status === "success"` — `useWaitForTransactionReceipt`'s
// own `isSuccess` flag fires on receipt-fetched, which is true even when
// the transaction reverted.

interface MembersRegistryWriteConfig {
    functionName: "register" | "updateProfile" | "requestWithdrawal" | "withdraw";
    args?: readonly unknown[];
    value?: bigint;
    failureMessage: string;
}

/**
 * Internal — the wagmi scaffold + guard-triple + simulate → write → verify
 * sequence shared by the four MembersRegistry write hooks below. Each public
 * hook wraps `run` with its own argument shape and failure message; the
 * reactive `isPending`/`isConfirming`/`isSuccess`/`error`/`hash` state and the
 * simulate-before-write discipline live here once.
 */
function useMembersRegistryWrite() {
    const client = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
    const {
        isLoading: isConfirming,
        isSuccess: receiptFetched,
        data: receipt,
    } = useWaitForTransactionReceipt({ hash });
    const isSuccess = receiptFetched && receipt?.status === "success";

    async function run(config: MembersRegistryWriteConfig): Promise<`0x${string}`> {
        if (!registry) throw new Error("MembersRegistry address not configured");
        if (!client) throw new Error("No public client available");
        if (!account) throw new Error("Wallet not connected");
        const abi = MEMBERS_REGISTRY_ABI as Abi;
        const { functionName, args = [], value, failureMessage } = config;
        await client.simulateContract({
            address: registry,
            abi,
            functionName,
            args,
            value,
            account,
        });
        const txHash = await writeContractAsync({
            address: registry,
            abi,
            functionName,
            args,
            value,
        });
        await verifyTxSuccess(client, txHash, failureMessage);
        return txHash;
    }

    return { isPending, isConfirming, isSuccess, error, hash, run };
}

export function useRegisterMember() {
    const { isPending, isConfirming, isSuccess, error, hash, run } = useMembersRegistryWrite();

    async function register(metadataURI: string, value?: bigint) {
        return run({
            functionName: "register",
            args: [metadataURI],
            value: value ?? 0n,
            failureMessage: "The member was not registered.",
        });
    }

    return { register, isPending, isConfirming, isSuccess, error, hash };
}

export function useUpdateProfile() {
    const { isPending, isConfirming, isSuccess, error, hash, run } = useMembersRegistryWrite();

    async function updateProfile(metadataURI: string) {
        return run({
            functionName: "updateProfile",
            args: [metadataURI],
            failureMessage: "The profile was not updated.",
        });
    }

    return { updateProfile, isPending, isConfirming, isSuccess, error, hash };
}

/**
 * Step 1 of leaving: de-surface NOW. Clears the dedup guard, so the member
 * disappears from discovery and may re-register immediately — but the ETH stays
 * locked until `withdrawalCooldown` has elapsed. This is the step that ends designer-rewards
 * eligibility and the step profile erasure should follow, not the later claim.
 */
export function useRequestWithdrawal() {
    const { isPending, isConfirming, isSuccess, error, hash, run } = useMembersRegistryWrite();

    async function requestWithdrawal() {
        return run({
            functionName: "requestWithdrawal",
            failureMessage: "The withdrawal was not requested.",
        });
    }

    return { requestWithdrawal, isPending, isConfirming, isSuccess, error, hash };
}

/**
 * The pending-withdrawal schedule for an address: how much is owed and when it
 * unlocks, each a `NetworkRead` — a failed read is `absent`, never `0n` or
 * "not withdrawable". `pending` present at `0n` means nothing is in flight.
 * Callers compare `releaseAt` against chain time, not wall-clock, when it
 * matters.
 */
export function useWithdrawalStatus(address: `0x${string}` | undefined) {
    const pending = useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "pendingDeposit",
        args: address ? [address] : undefined,
        query: { enabled: Boolean(registry && address) },
    });
    const releaseAt = useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "releaseAt",
        args: address ? [address] : undefined,
        query: { enabled: Boolean(registry && address) },
    });
    // Whether the claim is DUE is the chain's answer, not a clock comparison:
    // `releaseAt` is a block timestamp, and comparing it against `Date.now()`
    // breaks whenever block time and wall time drift — which disabled a
    // legitimate claim outright.
    const withdrawable = useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "withdrawable",
        args: address ? [address] : undefined,
        query: { enabled: Boolean(registry && address), refetchInterval: 5_000 },
    });
    return {
        pending: queryRead<bigint>(pending),
        releaseAt: queryRead<bigint>(releaseAt),
        withdrawable: queryRead<boolean>(withdrawable),
        refetch: () => { void pending.refetch(); void releaseAt.refetch(); void withdrawable.refetch(); },
    };
}

/** How long a requested withdrawal stays locked, in seconds. Deploy-time immutable. */
export function useWithdrawalCooldown() {
    return useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "withdrawalCooldown",
    });
}

/** Step 2 of leaving: claim the ETH, once the cooldown has elapsed. */
export function useWithdrawDeposit() {
    const { isPending, isConfirming, isSuccess, error, hash, run } = useMembersRegistryWrite();

    async function withdraw() {
        return run({
            functionName: "withdraw",
            failureMessage: "The stake was not reclaimed.",
        });
    }

    return { withdraw, isPending, isConfirming, isSuccess, error, hash };
}

/** The registration stake the MembersRegistry asks for, as a `NetworkRead`:
 *  a failed read is `absent` — never `0n`, which a register call would send. */
export function useRegistrationDeposit(): NetworkRead<bigint> {
    return queryRead<bigint>(useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "registrationDeposit",
    }));
}

// ── Agent service discovery hook ─────────────────────────────────────────────

/** The absence value: a human-operated participant (no services key). */
const NO_AGENT_SERVICES: AgentServiceInfo = { services: {}, capabilities: [], reachable: false };

/**
 * Fetches a member's metadataURI and parses ERC-8004-compatible
 * agent service endpoints if present. Returns { reachable: false } for
 * human-operated participants (no services key in metadata). Absence
 * semantics all the way down: a missing/unfetchable/unparsable document is
 * a human participant, never an error. Built on the ONE member-resource
 * fetcher (`useAsyncMemberResource`).
 */
export function useAgentServices(address: `0x${string}` | undefined) {
    const { data, isLoading } = useAsyncMemberResource<AgentServiceInfo>(address, {
        fetcher: async (metadataURI) => {
            // The member-chosen metadataURI reads IPFS-only through the
            // viewer's gateway: an http(s) locator or an unrecognized scheme
            // resolves to null, handled like a missing URI.
            const url = resolveMemberDocumentUri(metadataURI);
            if (!url) return NO_AGENT_SERVICES;
            try {
                // Size-capped fetch (F4): the member-pinned metadata document
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

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
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import type { RevertMessage } from "@/lib/shared/errors";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId, useReadContract } from "wagmi";
import { getMembersRegistry } from "@/lib/kernel/contracts";
import { MEMBERS_REGISTRY_ABI } from "@figaro-protocol/sdk";
import { getMemberState } from "@/lib/protocol/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import { useAsyncMemberResource } from "@/lib/member/useAsyncMemberResource";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
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
export function parseAgentServices(metadata: object): AgentServiceInfo {
    return projectAgentServices(metadata);
}

// ── Read hooks (indexer-backed) ──────────────────────────────────────────────

/** [metadataURI, registeredBlock] — derived from members-registry events. */
export type MemberProfileData = readonly [string, bigint | null];

/**
 * Returns the member's current metadataURI and registration block from
 * indexed events. Returns undefined if the address has never registered or
 * has left since (requestWithdrawal clears the dedup guard).
 */
export function useMemberProfile(address: `0x${string}` | undefined) {
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<MemberProfileData | undefined>(undefined);
    // "Not scanned yet" must not read as "scanned and absent": isLoading
    // starts TRUE and becomes false only when a scan completes. The prior
    // false start left commit windows (wagmi client/address still hydrating
    // → the effect's early return) where consumers saw
    // {data: undefined, isLoading: false} and treated an unscanned wallet
    // as unregistered — the /members/edit/* guards redirected mid-session
    // on exactly that window, killing in-flight saves.
    const [isLoading, setIsLoading] = useState(true);
    const { generation, refetch } = useRefetchGeneration();

    useEffect(() => {
        if (!client || !address) {
            setData(undefined);
            return;
        }

        let canceled = false;
        setIsLoading(true);

        getMemberState(client, chainId, address).then((state) => {
            if (canceled) return;
            if (state) {
                // Only emit a fresh tuple ref when the underlying values
                // actually changed — otherwise consumers' `useEffect`s
                // keyed on `data` re-fire on every poll for nothing,
                // which compounds into update-depth thrash on routes
                // that chain `refetch() + router.push(...)` in a
                // success-useEffect (see /members/edit/* family).
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
            if (!canceled) setIsLoading(false);
        });

        return () => { canceled = true; };
    }, [client, chainId, address, generation]);


    return { data, isLoading, refetch };
}

// ── Write hooks ───────────────────────────────────────────────────────────────

// Each write hook below sends through the shared simulate → send → verify
// (`simulateWriteVerify`): a revert surfaces before the wallet opens,
// translated by the registry's error name (`membersRegistryRevertMessage`).
// The returned `isSuccess` is gated on `receipt.status === "success"` —
// `useWaitForTransactionReceipt`'s own `isSuccess` flag fires on
// receipt-fetched, which is true even when the transaction reverted.

/** The `MembersRegistry` revert table, by error name — shared by these hooks
 *  and the onboarding publish (`usePublishMemberProfile`). */
export const membersRegistryRevertMessage: RevertMessage = (errorName) => {
    switch (errorName) {
        case "AlreadyRegistered":
            return "This wallet is already registered. Update its profile instead, or switch to a fresh wallet.";
        case "NotRegistered":
            return "This wallet is not registered. Register it before updating its profile or leaving.";
        case "InsufficientDeposit":
            return "Registration stake mismatch — the value sent differs from the registry's `registrationDeposit`. Reload and try again.";
        case "NothingPending":
            return "No withdrawal is pending for this wallet.";
        case "CooldownActive":
            return "The stake is still locked: the withdrawal cooldown has not elapsed.";
        case "TransferFailed":
            return "The stake refund transfer failed. No state changed — retry.";
        default:
            return null;
    }
};

/** The registry's `registrationDeposit`, read from the chain at the moment
 *  of the write. A read that fails or returns no amount throws — the caller
 *  sends nothing; there is no default stake. */
export async function readRegistrationDeposit(
    client: { readContract(args: { address: `0x${string}`; abi: Abi; functionName: string }): Promise<unknown> },
    registry: `0x${string}`,
): Promise<bigint> {
    let deposit: unknown;
    try {
        deposit = await client.readContract({
            address: registry,
            abi: MEMBERS_REGISTRY_ABI as Abi,
            functionName: "registrationDeposit",
        });
    } catch (err) {
        throw new Error(
            `The registration stake could not be read from MembersRegistry, so nothing was sent: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (typeof deposit !== "bigint") {
        throw new Error("MembersRegistry returned no registration stake, so nothing was sent.");
    }
    return deposit;
}

interface MembersRegistryWriteConfig {
    functionName: "register" | "updateProfile" | "requestWithdrawal" | "withdraw";
    args?: readonly unknown[];
    /** `register` only: the stake is read from the chain inside `run`. */
    payable?: true;
    failureMessage: string;
}

/**
 * Internal — the wagmi scaffold + guard-triple shared by the four
 * MembersRegistry write hooks below, sending through `simulateWriteVerify`.
 * Each public hook wraps `run` with its own argument shape and failure
 * message; the reactive `isPending`/`isConfirming`/`isSuccess`/`error`/`hash`
 * state lives here once.
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
        const { functionName, args = [], payable, failureMessage } = config;
        const value = payable ? await readRegistrationDeposit(client, registry) : undefined;
        return simulateWriteVerify({
            client,
            writeContractAsync,
            address: registry,
            abi: MEMBERS_REGISTRY_ABI as Abi,
            functionName,
            args,
            value,
            account,
            revertMessage: membersRegistryRevertMessage,
            failureMessage,
        });
    }

    return { isPending, isConfirming, isSuccess, error, hash, run };
}

export function useRegisterMember() {
    const { isPending, isConfirming, isSuccess, error, hash, run } = useMembersRegistryWrite();

    /** Register with the stake the registry asks for, read from the chain
     *  inside the write; an unread stake sends nothing. */
    async function register(metadataURI: string) {
        return run({
            functionName: "register",
            args: [metadataURI],
            payable: true,
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
 * unlocks. `pending === 0n` means nothing is in flight. Callers compare
 * `releaseAt` against chain time, not wall-clock, when it matters.
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
        pending: pending.data,
        releaseAt: releaseAt.data,
        withdrawable: withdrawable.data === true,
        isLoading: pending.isLoading || releaseAt.isLoading,
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

export function useRegistrationDeposit() {
    return useReadContract({
        address: registry ?? undefined,
        abi: MEMBERS_REGISTRY_ABI,
        functionName: "registrationDeposit",
    });
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
            // The ONE cached profile read (IPFS-only, size-capped, parsed):
            // a document that fails to read or parse as a member profile
            // surfaces nothing.
            const profile = await fetchMemberProfile(metadataURI);
            return profile ? parseAgentServices(profile) : NO_AGENT_SERVICES;
        },
        failureMessage: "Agent services unavailable",
    });
    return { data: data ?? undefined, isLoading };
}

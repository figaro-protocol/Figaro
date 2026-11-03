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
export function parseAgentServices(metadata: object): AgentServiceInfo {
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

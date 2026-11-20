"use client";

/**
 * useWithdrawStake — the two withdrawal writes of each K4 staked-intent key
 * registry: `useWithdrawClause`, `useWithdrawAssembly` and
 * `useWithdrawAgreement`. A key's stake comes back as a member's does:
 * `requestWithdrawal(key)` de-surfaces the entry at once, and `withdraw(key)`
 * pays the stake out once the registry's `withdrawable(key)` view is true,
 * after its `withdrawalCooldown()`. One factory, `createUseWithdrawStake`,
 * builds all three: resolve the registry address, then the shared simulate →
 * send → verify (`simulateWriteVerify`); each registry supplies its own
 * address getter, ABI, not-configured message and revert-message table, so its
 * own errors keep surfacing as its own copy.
 *
 * `useKeyWithdrawalStatus(family, key)` reads the pending half from the chain:
 * `releaseAt(key)`, `withdrawable(key)` and the cooldown, each a
 * `NetworkRead` — a failed read is `absent`, never a default.
 *
 * These hooks need a wallet provider, so they live apart from the registries'
 * read modules (`useClauseRegistry.ts`, `useProcessRegistry.ts`,
 * `useAgreementRegistry.ts`), which import nothing from `wagmi` and which a
 * page with no wallet provider reads through.
 */

import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { AGREEMENT_REGISTRY_ABI } from "@figaro-protocol/sdk";
import { PROCESS_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from "@/lib/registries/contracts";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import { withdrawRevertMessage } from "@/lib/registries/registryRevertMessages";
import { clauseWithdrawRevertMessage, getClauseRegistry } from "@/lib/registries/useClauseRegistry";
import { getProcessRegistry } from "@/lib/registries/useProcessRegistry";
import { getAgreementRegistry } from "@/lib/registries/useAgreementRegistry";
import { queryRead } from "@/lib/shared/networkRead";

interface WithdrawStakeConfig {
    /** The registry address if configured and well-formed, else null. */
    getRegistry: () => `0x${string}` | null;
    /** The registry's ABI — must declare `requestWithdrawal(bytes32)` and `withdraw(bytes32)`. */
    abi: Abi;
    /** Thrown verbatim when `getRegistry()` returns null. */
    notConfiguredMessage: string;
    /** Map a decoded revert's errorName to a user-facing message; null falls
     *  through to the shared error-name translation (`simulateWriteVerify`). */
    revertMessage: (errorName: string | undefined) => string | null;
}

/** Build a `useWithdrawX()` hook bound to one registry's config. The
 *  returned function is itself the hook — call it unconditionally at a
 *  component's top level, same as any other hook. */
function createUseWithdrawStake(config: WithdrawStakeConfig) {
    const { getRegistry, abi, notConfiguredMessage, revertMessage } = config;

    return function useWithdrawStake() {
        const client = usePublicClient();
        const { address } = useAccount();
        const { writeContractAsync, isPending } = useWriteContract();

        async function send(
            functionName: "requestWithdrawal" | "withdraw",
            key: `0x${string}`,
            failureMessage: string,
        ): Promise<`0x${string}`> {
            const registry = getRegistry();
            if (!registry) {
                throw new Error(notConfiguredMessage);
            }
            if (!client) throw new Error("No public client available to submit the withdrawal.");
            if (!address) throw new Error("Connect a wallet before reclaiming the stake.");

            return simulateWriteVerify({
                client,
                writeContractAsync,
                address: registry,
                abi,
                functionName,
                args: [key],
                account: address,
                revertMessage: (errorName) => revertMessage(errorName),
                failureMessage,
            });
        }

        /** Step 1: ask for the stake back. De-surfaces the entry now. */
        function requestWithdrawal(key: `0x${string}`): Promise<`0x${string}`> {
            return send("requestWithdrawal", key, "The withdrawal was not requested.");
        }

        /** Step 2: claim the stake, once the chain says the cooldown has passed. */
        function withdraw(key: `0x${string}`): Promise<`0x${string}`> {
            return send("withdraw", key, "The stake was not reclaimed.");
        }

        return { requestWithdrawal, withdraw, isPending };
    };
}

/**
 * Reclaim a clause's registration stake (`ClauseRegistry.requestWithdrawal`,
 * then `ClauseRegistry.withdraw` after the cooldown). Mirrors
 * `useWithdrawAssembly` exactly: the binding is permanent — the request only
 * moves the stake and de-surfaces the clause for NEW compositions;
 * committed orders keep resolving under the clause. Gating on in-flight trades is
 * the caller's job via `useWithdrawGate` (advisory, off-chain); this hook is the
 * plain registeredBy-only write. Simulates first to surface a typed revert before
 * opening the wallet, sends, then waits for a `success` receipt. Throws on any
 * failure.
 */
export const useWithdrawClause = createUseWithdrawStake({
    getRegistry: getClauseRegistry,
    abi: CLAUSE_REGISTRY_ABI,
    notConfiguredMessage: "ClauseRegistry address not configured (NEXT_PUBLIC_CLAUSE_REGISTRY).",
    revertMessage: clauseWithdrawRevertMessage,
});

/**
 * Reclaim an assembly's registration stake (`ProcessRegistry.requestWithdrawal`,
 * then `ProcessRegistry.withdraw` after the cooldown).
 * The binding is permanent — the request only moves the stake and de-surfaces
 * the assembly for NEW orders; committed processes keep resolving. Gating on
 * in-flight trades is the caller's job via `useWithdrawGate` (advisory,
 * off-chain); this hook is the plain registeredBy-only write. Simulates first to
 * surface a typed revert before opening the wallet, sends, then waits for a
 * `success` receipt. Throws on any failure.
 */
export const useWithdrawAssembly = createUseWithdrawStake({
    getRegistry: getProcessRegistry,
    abi: PROCESS_REGISTRY_ABI,
    notConfiguredMessage: "ProcessRegistry address not configured (NEXT_PUBLIC_PROCESS_REGISTRY).",
    revertMessage: withdrawRevertMessage("assembly"),
});

/** Reclaim an agreement's registration stake (`AgreementRegistry.requestWithdrawal`,
 *  then `AgreementRegistry.withdraw` after the cooldown).
 *  The binding is permanent; the request de-surfaces the agreement for new
 *  compositions while every assembly already composed from it keeps reading it.
 *  Consumed by `RegisteredAgreementsReclaim` on the designer landing (gated per
 *  row by `useWithdrawGate({ kind: "agreement", agreementHash })`). */
export const useWithdrawAgreement = createUseWithdrawStake({
    getRegistry: getAgreementRegistry,
    abi: AGREEMENT_REGISTRY_ABI,
    notConfiguredMessage: "AgreementRegistry address not configured (NEXT_PUBLIC_AGREEMENT_REGISTRY).",
    revertMessage: withdrawRevertMessage("agreement"),
});

/** The three key-registry families, by the noun the pages use. */
export type StakeFamily = "clause" | "agreement" | "assembly";

const STATUS_SOURCES: Record<StakeFamily, { getRegistry: () => `0x${string}` | null; abi: Abi }> = {
    clause: { getRegistry: getClauseRegistry, abi: CLAUSE_REGISTRY_ABI },
    agreement: { getRegistry: getAgreementRegistry, abi: AGREEMENT_REGISTRY_ABI },
    assembly: { getRegistry: getProcessRegistry, abi: PROCESS_REGISTRY_ABI },
};

type QueryShape<T> = { status: "pending" | "error" | "success"; data: T | undefined };

/**
 * The pending half of a key's withdrawal, read from the chain: when the
 * requested stake unlocks (`releaseAt`, `0n` when nothing is pending — never
 * requested, or already paid out), whether it can be claimed now
 * (`withdrawable`, the CHAIN's answer — never a `Date.now()` comparison, since
 * block time and wall time drift), and the registry's cooldown. Each is a
 * `NetworkRead`: a failed read is `absent`, never `0n` or "not withdrawable".
 */
export function useKeyWithdrawalStatus(family: StakeFamily, key: `0x${string}`) {
    const { getRegistry, abi } = STATUS_SOURCES[family];
    const registry = getRegistry() ?? undefined;
    const enabled = Boolean(registry);
    const releaseAt = useReadContract({ address: registry, abi, functionName: "releaseAt", args: [key], query: { enabled } });
    const withdrawable = useReadContract({
        address: registry,
        abi,
        functionName: "withdrawable",
        args: [key],
        query: { enabled, refetchInterval: 5_000 },
    });
    const cooldown = useReadContract({ address: registry, abi, functionName: "withdrawalCooldown", query: { enabled } });
    return {
        releaseAt: queryRead<bigint>(releaseAt as QueryShape<bigint>),
        withdrawable: queryRead<boolean>(withdrawable as QueryShape<boolean>),
        cooldown: queryRead<bigint>(cooldown as QueryShape<bigint>),
        refetch: () => {
            void releaseAt.refetch();
            void withdrawable.refetch();
        },
    };
}

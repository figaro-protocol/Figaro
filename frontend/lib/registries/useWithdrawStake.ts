"use client";

/**
 * useWithdrawStake — the `withdrawDeposit` write hook of each K4
 * staked-intent registry: `useWithdrawClause`, `useWithdrawAssembly` and
 * `useWithdrawAgreement`. One factory, `createUseWithdrawStake`, builds all
 * three: resolve the registry address, then the shared simulate → send →
 * verify (`simulateWriteVerify`); each registry supplies its own address
 * getter, ABI, not-configured message and revert-message table, so its own
 * errors keep surfacing as its own copy.
 *
 * These hooks need a wallet provider, so they live apart from the registries'
 * read modules (`useClauseRegistry.ts`, `useProcessRegistry.ts`,
 * `useAgreementRegistry.ts`), which import nothing from `wagmi` and which a
 * page with no wallet provider reads through.
 */

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { AGREEMENT_REGISTRY_ABI } from "@figaro-protocol/sdk";
import { PROCESS_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from "@/lib/registries/contracts";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import { withdrawRevertMessage } from "@/lib/registries/registryRevertMessages";
import { clauseWithdrawRevertMessage, getClauseRegistry } from "@/lib/registries/useClauseRegistry";
import { getProcessRegistry } from "@/lib/registries/useProcessRegistry";
import { getAgreementRegistry } from "@/lib/registries/useAgreementRegistry";

interface WithdrawStakeConfig {
    /** The registry address if configured and well-formed, else null. */
    getRegistry: () => `0x${string}` | null;
    /** The registry's ABI — must declare `withdrawDeposit(bytes32)`. */
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

        async function withdraw(key: `0x${string}`): Promise<`0x${string}`> {
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
                functionName: "withdrawDeposit",
                args: [key],
                account: address,
                revertMessage: (errorName) => revertMessage(errorName),
                failureMessage: "The stake was not reclaimed.",
            });
        }

        return { withdraw, isPending };
    };
}

/**
 * Reclaim a clause's registration stake (`ClauseRegistry.withdrawDeposit`).
 * Mirrors `useWithdrawAssembly` exactly: the binding is permanent — withdraw
 * only moves the stake and de-surfaces the clause for NEW compositions;
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
 * Reclaim an assembly's registration stake (`ProcessRegistry.withdrawDeposit`).
 * The binding is permanent — withdraw only moves the stake and de-surfaces
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

/** Reclaim an agreement's registration stake (`AgreementRegistry.withdrawDeposit`).
 *  The binding is permanent; withdraw de-surfaces the agreement for new
 *  compositions while every assembly already composed from it keeps reading it.
 *  Consumed by `RegisteredAgreementsReclaim` on the designer landing (gated per
 *  row by `useWithdrawGate({ kind: "agreement", agreementHash })`). */
export const useWithdrawAgreement = createUseWithdrawStake({
    getRegistry: getAgreementRegistry,
    abi: AGREEMENT_REGISTRY_ABI,
    notConfiguredMessage: "AgreementRegistry address not configured (NEXT_PUBLIC_AGREEMENT_REGISTRY).",
    revertMessage: withdrawRevertMessage("agreement"),
});

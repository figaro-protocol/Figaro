"use client";

/**
 * createUseWithdrawStake — factory for a K4 staked-intent registry's
 * `withdrawDeposit` write hook. `useWithdrawAssembly` (`useAssemblyRegistry.ts`)
 * and `useWithdrawClause` (`useClauseRegistry.ts`) were byte-identical per
 * their own "Mirrors X exactly" comments: resolve the registry address, then
 * the shared simulate → send → verify (`simulateWriteVerify`). This factory is the one shared shape;
 * each registry supplies its own address getter, ABI, not-configured
 * message, and revert-message table so its own errors keep surfacing as its
 * own copy.
 *
 * Lives outside both `useAssemblyRegistry.ts` and `useClauseRegistry.ts` so
 * neither registry file has to import the other.
 */

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";

export interface WithdrawStakeConfig {
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

/**
 * The register/publish reverts every registry shares — the stake that changed
 * between read and send, and the empty pin — as a message, or null for a
 * revert only one registry has. Each register translator's table ends in it.
 */
export function sharedRegisterRevertMessage(
    errorName: string | undefined,
    args: readonly unknown[] | undefined,
): string | null {
    switch (errorName) {
        case "WrongDeposit": {
            const provided = (args?.[0] as bigint | undefined)?.toString() ?? "?";
            const required = (args?.[1] as bigint | undefined)?.toString() ?? "?";
            return `Registration stake mismatch (provided ${provided} wei, required ${required} wei). The stake amount changed between the read and the send — retry.`;
        }
        case "EmptyContentURI":
            return "The IPFS pin returned an empty URI.";
        default:
            return null;
    }
}

/**
 * The shared `withdrawDeposit` revert table — the on-chain guards only
 * (registeredBy-only, once-only, must-exist; the commits==resolves gate is
 * off-chain/advisory via `useWithdrawGate`). The registries' tables
 * differed only by noun, so the noun is the parameter; the assembly keeps
 * "composition" for the must-exist case because the binding's identity IS
 * the composition.
 */
export function withdrawRevertMessage(noun: "clause" | "assembly" | "agreement") {
    return (errorName: string | undefined): string | null => {
        switch (errorName) {
            case "AlreadyWithdrawn":
                return `This ${noun}'s registration stake has already been reclaimed.`;
            case "NotRegisteredBy":
                return `Only the wallet that registered this ${noun} can reclaim its registration stake.`;
            case "NotRegistered":
                return noun === "assembly"
                    ? "No registration binding exists for this composition."
                    : `No registration binding exists for this ${noun}.`;
            case "TransferFailed":
                return "The stake refund transfer failed. No state changed — retry.";
            default:
                return null;
        }
    };
}

/** Build a `useWithdrawX()` hook bound to one registry's config. The
 *  returned function is itself the hook — call it unconditionally at a
 *  component's top level, same as any other hook. */
export function createUseWithdrawStake(config: WithdrawStakeConfig) {
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

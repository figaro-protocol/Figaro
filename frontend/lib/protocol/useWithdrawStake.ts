"use client";

/**
 * createUseWithdrawStake — factory for a K4 staked-intent registry's
 * `withdrawDeposit` write hook. `useWithdrawAssembly` (`useAssemblyRegistry.ts`)
 * and `useWithdrawClause` (`useClauseRegistry.ts`) were byte-identical per
 * their own "Mirrors X exactly" comments: resolve the registry address,
 * simulate first to surface a typed revert before opening the wallet, send,
 * then wait for a `success` receipt. This factory is the one shared shape;
 * each registry supplies its own address getter, ABI, not-configured
 * message, and revert-message table so its own errors keep surfacing as its
 * own copy.
 *
 * Lives outside both `useAssemblyRegistry.ts` and `useClauseRegistry.ts` so
 * neither registry file has to import the other.
 */

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, type Abi } from "viem";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { toError } from "@/lib/shared/errors";

export interface WithdrawStakeConfig {
    /** The registry address if configured and well-formed, else null. */
    getRegistry: () => `0x${string}` | null;
    /** The registry's ABI — must declare `withdrawDeposit(bytes32)`. */
    abi: Abi;
    /** Thrown verbatim when `getRegistry()` returns null. */
    notConfiguredMessage: string;
    /** Map a decoded revert's errorName to a user-facing message; null falls
     *  through to the generic `toError`. */
    revertMessage: (errorName: string | undefined) => string | null;
}

/** Build a `useWithdrawX()` hook bound to one registry's config. The
 *  returned function is itself the hook — call it unconditionally at a
 *  component's top level, same as any other hook. */
export function createUseWithdrawStake(config: WithdrawStakeConfig) {
    const { getRegistry, abi, notConfiguredMessage, revertMessage } = config;

    function translateRevert(err: unknown): Error {
        if (err instanceof BaseError) {
            const revert = err.walk(
                (e) => e instanceof ContractFunctionRevertedError,
            ) as ContractFunctionRevertedError | undefined;
            const message = revertMessage(revert?.data?.errorName);
            if (message) return new Error(message);
        }
        return toError(err);
    }

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

            try {
                await client.simulateContract({
                    address: registry,
                    abi,
                    functionName: "withdrawDeposit",
                    args: [key],
                    account: address,
                });
            } catch (err) {
                throw translateRevert(err);
            }

            const txHash = await writeContractAsync({
                address: registry,
                abi,
                functionName: "withdrawDeposit",
                args: [key],
            });

            await verifyTxSuccess(client, txHash, "The stake was not reclaimed.");
            return txHash;
        }

        return { withdraw, isPending };
    };
}

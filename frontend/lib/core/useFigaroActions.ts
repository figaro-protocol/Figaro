// Core hook for Figaro protocol actions (unified commit, Commitment[] resolution)

import { useWriteContract, useWaitForTransactionReceipt, useAccount, usePublicClient } from "wagmi";
import type { Abi } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import type { Commitment } from "@figaro-protocol/sdk";

// Re-export for existing consumers
export type { Commitment };

export const useFigaroActions = () => {

    // Call wagmi/react hooks unconditionally to satisfy Rules of Hooks
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    const { address: account } = useAccount();
    const publicClient = usePublicClient();

    /** One write through the shared simulate → send → verify: the dry-run
     *  catches a wrong contract address, a short ERC-20 allowance, an invalid
     *  signature or any FigaroCore revert BEFORE the wallet prompt opens, and
     *  the revert is reported by FigaroCore's error name. */
    const send = async (
        call: { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] },
        failureMessage: string,
    ): Promise<`0x${string}`> => {
        if (!publicClient) throw new Error("No public client available to send the transaction.");
        if (!account) throw new Error("Wallet not connected.");
        return simulateWriteVerify({ ...call, account, client: publicClient, writeContractAsync, failureMessage });
    };

    // Unified commit: root and sub-orders use the same function.
    // Root orders: processId = 0x00...00, expectedCumulativeValue = payment
    // Sub-orders: processId = existing process, expectedCumulativeValue = prev + payment
    const commit = async (
        commitment: Commitment,
        buyerSig: `0x${string}`,
        sellerSig: `0x${string}`,
    ): Promise<`0x${string}`> => send({
        address: CONTRACTS.core as `0x${string}`,
        abi: CORE_ABI as Abi,
        functionName: "commit",
        args: [commitment, buyerSig, sellerSig],
    }, "The order was not committed.");

    // Resolve process: takes full Commitment[] (FigaroCore re-derives orderHash from each).
    const resolveProcess = async (
        processId: string,
        commitments: Commitment[]
    ): Promise<`0x${string}`> => send({
        address: CONTRACTS.core as `0x${string}`,
        abi: CORE_ABI as Abi,
        functionName: "resolveProcess",
        args: [processId as `0x${string}`, commitments],
    }, "The process was not resolved.");

    return {
        // Core actions: unified commit, Commitment[] resolution.
        commit,
        resolveProcess,

        // Transaction state
        hash,
        isPending,
        isConfirming,
        isConfirmed,
    };
};

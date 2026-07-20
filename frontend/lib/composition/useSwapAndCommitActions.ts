"use client";

/**
 * useSwapAndCommitActions — broadcast a fully-signed commitment through the
 * WitnessSwapAndCommitCoordinator when either party carries a swap-funded
 * bond leg (the buyer's rides the payload; the seller's is built at accept).
 * Same shape as `useFigaroActions.commit` (simulate → write), but the write
 * targets the coordinator: it pulls each funded party's input token via their
 * witness-signed Permit2 permit, swaps it at the immutable venue, forwards
 * the proceeds to that party, then calls the kernel's `commit`. Composition
 * layer — the coordinator is a contract the frontend composes with, never
 * core (`lib/kernel` carries only the five core ABIs).
 */
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
    DISABLED_SWAP_FUNDING_LEG,
    WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
    type Commitment,
    type Hex,
    type SwapFundingLeg,
} from "@figaro/sdk";
import { activeChain } from "@/lib/shared/chains";
import { getWitnessSwapAndCommitCoordinator } from "@/lib/composition/contracts";

export function useSwapAndCommitActions() {
    const { writeContractAsync } = useWriteContract();
    const { address: account } = useAccount();
    const publicClient = usePublicClient();

    /** Broadcast `swapAndCommit` with either party's funding leg (an absent
     *  leg is passed disabled — that party self-funds, as in the plain flow). */
    const swapAndCommit = async (
        commitment: Commitment,
        buyerSig: Hex,
        sellerSig: Hex,
        buyerFunding?: SwapFundingLeg,
        sellerFunding?: SwapFundingLeg,
    ): Promise<Hex> => {
        const coordinator = getWitnessSwapAndCommitCoordinator();
        if (!coordinator) {
            throw new Error(
                "Swap-and-commit coordinator address is unconfigured — cannot broadcast a swap-funded order.",
            );
        }
        const args = [
            commitment, buyerSig, sellerSig,
            buyerFunding ?? DISABLED_SWAP_FUNDING_LEG,
            sellerFunding ?? DISABLED_SWAP_FUNDING_LEG,
        ] as const;
        // Same pre-flight dry-run as the kernel commit path: any coordinator or
        // kernel revert (witness mismatch, output below bond, allowance gap)
        // surfaces BEFORE the wallet prompt opens.
        if (publicClient) {
            await publicClient.simulateContract({
                address: coordinator,
                abi: WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
                functionName: "swapAndCommit",
                args,
                account,
            });
        }
        return writeContractAsync({
            address: coordinator,
            abi: WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
            functionName: "swapAndCommit",
            args,
            account,
            chain: activeChain,
        });
    };

    return { swapAndCommit };
}

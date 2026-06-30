// Core Hook for V5 Protocol Actions (Unified Commit, Commitment[] Resolution)

import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, usePublicClient } from "wagmi";
import { CORE_ABI, ERC20_ABI, CONTRACTS } from "@/lib/core/contracts";
import { TEST_HELPERS_ENABLED, windowSafe } from '@/lib/core/testHelpers';
import { activeChain } from "@/lib/shared/chains";
import type { Commitment } from "@figaro/core";

// Re-export for existing consumers
export type { Commitment };

export const useFigaroActions = () => {

    // Call wagmi/react hooks unconditionally to satisfy Rules of Hooks
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    const { address: account } = useAccount();
    const chainId = useChainId();
    const publicClient = usePublicClient();


    // Use activeChain so wallets that enforce chain-matching
    // (Coinbase Wallet, WalletConnect v2) don't reject the call.
    const chainConfig = activeChain;

    // Token Approval: Approve ERC20 for Core contract
    const approveToken = async (
        tokenAddress: `0x${string}`,
        amount: bigint
    ) => {
        return writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [CONTRACTS.core as `0x${string}`, amount],
            account,
            chain: chainConfig,
        });
    };

    // V5: Unified commit (root and sub-orders use the same function)
    // Root orders: processId = 0x00...00, expectedCumulativeValue = payment
    // Sub-orders: processId = existing process, expectedCumulativeValue = prev + payment
    const commit = async (
        commitment: Commitment,
        buyerSig: `0x${string}`,
        sellerSig: `0x${string}`,
    ): Promise<`0x${string}`> => {
        // Pre-flight dry-run via eth_call. Catches: wrong contract address
        // (no method match), insufficient ERC20 allowance, invalid sig, any
        // kernel revert path — all BEFORE the wallet prompt opens. If a
        // browser extension swapped calldata between simulate and write,
        // simulate would still have used clean data, so the simulate-pass
        // is a strong "this would work" signal even if the write differs.
        if (publicClient) {
            await publicClient.simulateContract({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                functionName: "commit",
                args: [commitment, buyerSig, sellerSig],
                account,
            });
        }
        return writeContractAsync({
            address: CONTRACTS.core as `0x${string}`,
            abi: CORE_ABI,
            functionName: "commit",
            args: [commitment, buyerSig, sellerSig],
            account,
            chain: chainConfig,
        });
    };

    // V5: Resolve Process — takes full Commitment[] (kernel re-derives orderHash from each)
    const resolveProcess = async (
        processId: string,
        commitments: Commitment[]
    ): Promise<`0x${string}`> => {
        if (publicClient) {
            await publicClient.simulateContract({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                functionName: "resolveProcess",
                args: [processId as `0x${string}`, commitments],
                account,
            });
        }
        return writeContractAsync({
            address: CONTRACTS.core as `0x${string}`,
            abi: CORE_ABI,
            functionName: "resolveProcess",
            args: [processId as `0x${string}`, commitments],
            account,
            chain: chainConfig,
        });
    };

    return {
        // Token approval
        approveToken,

        // Core actions (V5: unified commit, Commitment[] resolution)
        commit,
        resolveProcess,

        // Transaction state
        hash,
        isPending,
        isConfirming,
        isConfirmed,
    };
};

"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { CONTRACTS, MOCK_MINT_ABI } from "@/lib/core/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";

export function useMockTokenMint() {
    const { address } = useAccount();
    const chainId = useChainId();
    const chain = activeChain;
    const tokenAddress = CONTRACTS.mockToken as `0x${string}` | undefined;
    const { decimals } = useTokenDecimals(tokenAddress);
    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const [error, setError] = useState("");

    const mint = async (amount: string) => {
        if (!address || !tokenAddress) {
            const message = "Mock token minting is unavailable for the connected wallet or network.";
            setError(message);
            throw new Error(message);
        }

        setError("");

        try {
            return await writeContractAsync({
                address: tokenAddress,
                abi: MOCK_MINT_ABI,
                functionName: "mint",
                args: [address, parseUnits(amount, decimals ?? 18)],
                account: address,
                chain,
            });
        } catch (cause: unknown) {
            const message = extractErrorMessage(cause, "Mint failed");
            setError(message);
            throw new Error(message);
        }
    };

    return {
        mint,
        isPending,
        isConfirming,
        isSuccess,
        error,
        available: !!address && !!tokenAddress,
    };
}
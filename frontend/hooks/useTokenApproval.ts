"use client";

import { useCallback, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_ABI } from "@/lib/kernel/contracts";

function useTokenApproval({ tokenAddress, owner, spender }: { tokenAddress?: `0x${string}` | undefined; owner?: `0x${string}` | undefined; spender: `0x${string}` }) {
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, spender],
        query: { enabled: !!owner && !!tokenAddress },
    });

    const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();

    const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

    // Re-read the allowance once an approve tx has been confirmed so
    // `needsApproval` reflects the updated on-chain state immediately.
    useEffect(() => {
        if (isApproveSuccess) {
            refetchAllowance();
        }
    }, [isApproveSuccess, refetchAllowance]);

    const needsApproval = useCallback((amount?: bigint) => {
        if (!allowance) return true;
        if (!amount) return false;
        try {
            return (allowance as bigint) < amount;
        } catch (e) {
            return true;
        }
    }, [allowance]);

    const approve = useCallback((amount: bigint) => {
        if (!tokenAddress) return;
        return writeApprove({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [spender, amount],
        });
    }, [tokenAddress, spender, writeApprove]);

    return {
        allowance,
        needsApproval,
        approve,
        isApprovePending,
        isApproveConfirming,
        isApproveSuccess,
        refetchAllowance,
    } as const;
}

export default useTokenApproval;

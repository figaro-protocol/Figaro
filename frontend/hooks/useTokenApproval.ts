"use client";

import { useCallback, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_ABI } from "@/lib/kernel/contracts";

function useTokenApproval({ tokenAddress, owner, spender }: { tokenAddress?: `0x${string}` | undefined; owner?: `0x${string}` | undefined; spender: `0x${string}` }) {
    const { data: allowance, isFetched: allowanceKnown, refetch: refetchAllowance } = useReadContract({
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

    // `needsApproval` answers "must an approve precede the act?" — and while
    // the allowance is still UNKNOWN the safe answer is yes (an approve is
    // idempotent; acting without one reverts). Surfaces that only DISPLAY an
    // authorize step must gate on `allowanceKnown` too, or the button flashes
    // for every wallet whose allowance turns out sufficient.
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
        /** True once the allowance read has settled (a value, or a confirmed
         *  zero) — the display gate for any authorize affordance. */
        allowanceKnown,
        needsApproval,
        approve,
        isApprovePending,
        isApproveConfirming,
        isApproveSuccess,
        refetchAllowance,
    } as const;
}

export default useTokenApproval;

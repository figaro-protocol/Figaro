"use client";

import { useCallback, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ERC20_ABI } from "@/lib/kernel/contracts";

function useTokenApproval({ tokenAddress, owner, spender }: { tokenAddress?: `0x${string}` | undefined; owner?: `0x${string}` | undefined; spender: `0x${string}` }) {
    const { data: allowance, isFetched: allowanceKnown, isRefetching: isAllowanceRefetching, refetch: refetchAllowance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, spender],
        query: { enabled: !!owner && !!tokenAddress },
    });

    const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending, isError: isApproveWriteError } = useWriteContract();

    const { data: approveReceipt, isLoading: isApproveConfirming, isSuccess: isApproveReceiptRead, isError: isApproveReceiptError } = useWaitForTransactionReceipt({ hash: approveHash });
    // A mined approve that REVERTED still resolves the receipt query (wagmi
    // reports the query's success with `status: "reverted"`), and it granted
    // no allowance — so only a receipt whose status is "success" is the
    // approval's success, and a reverted one is its error.
    const isApproveReverted = isApproveReceiptRead && approveReceipt?.status === "reverted";
    const isApproveSuccess = isApproveReceiptRead && approveReceipt?.status === "success";
    // wagmi's `writeContract` never throws: a wallet rejection (or any send
    // failure) arrives later as the mutation's error state, and a receipt that
    // cannot be read arrives as the receipt query's. Any of these, or a
    // reverted receipt, ends the approval.
    const isApproveError = isApproveWriteError || isApproveReceiptError || isApproveReverted;

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
        /** True once the allowance read has completed (a value, or a confirmed
         *  zero) — the display gate for any authorize affordance. */
        allowanceKnown,
        /** True while a known allowance is being read again — after an
         *  approval's receipt, the value in hand is the one from before it. */
        isAllowanceRefetching,
        needsApproval,
        approve,
        isApprovePending,
        isApproveConfirming,
        isApproveSuccess,
        /** True once the latest approval ended without granting the allowance
         *  — the wallet refused it, the send failed, its receipt could not be
         *  read, or it was mined and reverted. */
        isApproveError,
        refetchAllowance,
    } as const;
}

export default useTokenApproval;

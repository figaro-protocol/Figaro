// Payment Authorization Component - Handles payment authorization before order creation

"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ERC20_ABI, CONTRACTS } from "@/lib/core/contracts";
import { handleOrderSurfaceFailure } from "@/lib/shared/orderSurfaceActions";
import useTokenApproval from "@/hooks/core/useTokenApproval";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { formatToken } from "@/lib/shared/utils";

interface TokenApprovalProps {
    tokenAddress: `0x${string}`;
    requiredAmount: bigint;
    onApprovalComplete: () => void;
    onCancel?: () => void;
}

export function TokenApprovalFlow({
    tokenAddress,
    requiredAmount,
    onApprovalComplete,
    onCancel,
}: TokenApprovalProps) {
    const { address } = useAccount();
    const { decimals } = useTokenDecimals(tokenAddress);
    const { data: tokenBalance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [(address ?? ZERO_ADDRESS) as `0x${string}`],
        query: { enabled: !!address && !!tokenAddress },
    });
    const {
        allowance,
        needsApproval,
        approve,
        isApprovePending,
        isApproveConfirming,
    } = useTokenApproval({
        tokenAddress,
        owner: address as `0x${string}` | undefined,
        spender: CONTRACTS.core,
    });

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [completionSent, setCompletionSent] = useState(false);

    const balance = (tokenBalance as bigint | undefined) ?? 0n;
    const currentAllowance = allowance ?? 0n;
    const isChecking = !!address && (tokenBalance === undefined || allowance === undefined);
    const hasInsufficientBalance = !isChecking && balance < requiredAmount;
    const approved = !!address && !isChecking && !hasInsufficientBalance && !needsApproval(requiredAmount);
    const isApproving = isApprovePending || isApproveConfirming;

    useEffect(() => {
        if (approved && !completionSent) {
            setErrorMessage(null);
            setCompletionSent(true);
            onApprovalComplete();
            return;
        }

        if (!approved && completionSent) {
            setCompletionSent(false);
        }
    }, [approved, completionSent, onApprovalComplete]);

    const handleApprove = async () => {
        try {
            setErrorMessage(null);
            await approve(requiredAmount);
        } catch (error: unknown) {
            handleOrderSurfaceFailure(error, {
                failureMessage: "Failed to approve token",
                logLabel: "Approval error:",
                onError: (message) => setErrorMessage(message),
            });
        }
    };

    if (!address) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Sign In Required</h3>
                <p className="text-red-700 mb-4">Sign in to place your order.</p>
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                    >
                        Cancel
                    </button>
                )}
            </div>
        );
    }

    if (isChecking) {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                    <p className="text-blue-800">Checking payment status...</p>
                </div>
            </div>
        );
    }

    if (hasInsufficientBalance || errorMessage) {
        const message = hasInsufficientBalance
            ? `Insufficient funds. Required: ${formatToken(requiredAmount, decimals)}, Available: ${formatToken(balance, decimals)}`
            : errorMessage;

        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
                <p className="text-red-700 mb-4">{message}</p>
                <div className="flex gap-3">
                    {!hasInsufficientBalance && (
                        <button
                            onClick={() => setErrorMessage(null)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                            Retry
                        </button>
                    )}
                    {onCancel && (
                        <button
                            onClick={onCancel}
                            className="px-6 py-2 bg-gray-400 text-white rounded-lg font-medium hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (!approved) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">Payment Authorization Needed</h3>
                <p className="text-yellow-700 mb-4">
                    Authorize Figaro to hold your deposit for this order.
                </p>
                <div className="space-y-2 mb-4 text-sm text-yellow-600">
                    <p>• Deposit amount: {formatToken(requiredAmount, decimals)}</p>
                    <p>• This exact amount will be authorized — nothing more.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleApprove}
                        disabled={isApproving}
                        className={`px-6 py-2 bg-yellow-600 text-white rounded-lg font-medium ${isApproving ? "opacity-50 cursor-not-allowed" : "hover:bg-yellow-700"
                            }`}
                    >
                        {isApproving ? "Authorizing..." : "Authorize Payment"}
                    </button>
                    {onCancel && (
                        <button
                            onClick={onCancel}
                            disabled={isApproving}
                            className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Approved - show success message
    return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center">
                <svg
                    className="w-5 h-5 text-green-600 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                    />
                </svg>
                <p className="text-green-800 font-medium">Payment authorized — ready to place order</p>
            </div>
        </div>
    );
}

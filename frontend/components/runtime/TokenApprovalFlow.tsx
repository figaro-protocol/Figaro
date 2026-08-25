// Payment Authorization Component - Handles payment authorization before order creation

"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ERC20_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { handleOrderSurfaceFailure } from "@/lib/shared/orderSurfaceActions";
import useTokenApproval from "@/hooks/useTokenApproval";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { formatToken } from "@/lib/shared/utils";
import { Button } from "@/components/ui/Button";

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
            <div className="bg-error/10 border border-error/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-error-fg mb-2">Sign In Required</h3>
                <p className="text-error-fg mb-4">Sign in to place your order.</p>
                {onCancel && (
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
        );
    }

    if (isChecking) {
        return (
            <div className="bg-info/10 border border-info/30 rounded-lg p-4">
                <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-info mr-3"></div>
                    <p className="text-info-fg">Checking payment status...</p>
                </div>
            </div>
        );
    }

    if (hasInsufficientBalance || errorMessage) {
        const message = hasInsufficientBalance
            ? `Insufficient funds. Required: ${formatToken(requiredAmount, decimals)}, Available: ${formatToken(balance, decimals)}`
            : errorMessage;

        return (
            <div className="bg-error/10 border border-error/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-error-fg mb-2">Error</h3>
                <p className="text-error-fg mb-4">{message}</p>
                <div className="flex gap-3">
                    {!hasInsufficientBalance && (
                        <Button variant="destructive" onClick={() => setErrorMessage(null)}>
                            Retry
                        </Button>
                    )}
                    {onCancel && (
                        <Button variant="secondary" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    if (!approved) {
        return (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-warning-fg mb-2">Payment Authorization Needed</h3>
                <p className="text-warning-fg mb-4">
                    Authorize Figaro to hold your deposit for this order.
                </p>
                <div className="space-y-2 mb-4 text-sm text-warning-fg">
                    <p>• Deposit amount: {formatToken(requiredAmount, decimals)}</p>
                    <p>• This exact amount will be authorized — nothing more.</p>
                </div>
                {/* The action is the filled-sumi default, not an amber fill:
                    white on `warning` measures 3.97:1 and DESIGN_TOKENS §7 bans
                    amber under white text. Amber stays on the surround. */}
                <div className="flex gap-3">
                    <Button onClick={handleApprove} disabled={isApproving}>
                        {isApproving ? "Authorizing..." : "Authorize Payment"}
                    </Button>
                    {onCancel && (
                        <Button variant="secondary" onClick={onCancel} disabled={isApproving}>
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // Approved - show success message
    return (
        <div className="bg-success/10 border border-success/30 rounded-lg p-4">
            <div className="flex items-center">
                <svg
                    className="w-5 h-5 text-success mr-3"
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
                <p className="text-success-fg font-medium">Payment authorized — ready to place order</p>
            </div>
        </div>
    );
}

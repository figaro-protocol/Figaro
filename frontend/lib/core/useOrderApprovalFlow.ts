import { useCallback, useState } from "react";
import useTokenApproval, { type PermitSignature } from "@/hooks/core/useTokenApproval";
import { approveAmount, isApprovalSatisfied, signPermitWithFallback } from "@/lib/core/orderApproval";

interface UseOrderApprovalFlowArgs {
    tokenAddress: `0x${string}`;
    owner?: `0x${string}` | undefined;
    spender: `0x${string}`;
    amount: bigint;
    currency: string;
    hasPermit?: boolean;
    onPermitSigned: (permit: PermitSignature) => void;
}

export function useOrderApprovalFlow({
    tokenAddress,
    owner,
    spender,
    amount,
    currency,
    hasPermit = false,
    onPermitSigned,
}: UseOrderApprovalFlowArgs) {
    const [mockApproved, setMockApproved] = useState(false);
    const tokenApproval = useTokenApproval({
        tokenAddress,
        owner,
        spender,
    });

    const approved = amount > 0n && isApprovalSatisfied({
        amount,
        currency,
        mockApproved,
        hasPermit,
        needsApproval: tokenApproval.needsApproval,
    });

    const approveBond = useCallback(async () => {
        const approvalMode = await approveAmount({
            amount,
            currency,
            approve: tokenApproval.approve,
            refetchAllowance: tokenApproval.refetchAllowance,
        });

        if (approvalMode === "mock") {
            setMockApproved(true);
        }
    }, [amount, currency, tokenApproval]);

    const signPermitForBond = useCallback(async () => {
        await signPermitWithFallback({
            amount,
            signPermitForTx: tokenApproval.signPermitForTx,
            onPermitSigned,
            onFallbackApprove: approveBond,
        });
    }, [amount, tokenApproval, onPermitSigned, approveBond]);

    const resetApprovalState = useCallback(() => {
        setMockApproved(false);
    }, []);

    return {
        approved,
        approveBond,
        signPermitForBond,
        mockApproved,
        resetApprovalState,
        setMockApproved,
        tokenApproval,
    };
}

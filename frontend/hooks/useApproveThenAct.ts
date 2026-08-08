"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseApproveThenActArgs {
    /** True when the wallet's current allowance is short of an amount. */
    needsApproval: (amount: bigint) => boolean;
    /** Fire the ERC-20 `approve` transaction. */
    approve: (amount: bigint) => void;
    /** True once the pending approval has confirmed on-chain. */
    isApproveSuccess: boolean;
}

/**
 * useApproveThenAct — the approve-then-auto-chain choreography shared by
 * every "bond an amount, then perform this action" surface: seller accept
 * (`YourTurnCard`), seller broadcast (`ReadyToSubmitCard`), and buyer
 * checkout (`CheckoutView`). If the current allowance already covers the
 * amount, the action runs immediately; otherwise a 10×-buffered approval is
 * submitted and the action is PENDED until `isApproveSuccess` flips (a prior
 * max approval just makes `needsApproval` false — no-op).
 *
 * A synchronous `approve()` throw clears the pending action before
 * rethrowing, so a failed/rejected approval never leaves a stale pending
 * action to fire on some LATER, unrelated approval's success. (One of the
 * three original copies reset on throw; the other two did not — this is the
 * one correct behavior, adopted everywhere.)
 */
export function useApproveThenAct({ needsApproval, approve, isApproveSuccess }: UseApproveThenActArgs) {
    const pendingAction = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (isApproveSuccess && pendingAction.current) {
            const act = pendingAction.current;
            pendingAction.current = null;
            act();
        }
    }, [isApproveSuccess]);

    const runWithApproval = useCallback((amount: bigint, act: () => void) => {
        if (!needsApproval(amount)) {
            act();
            return;
        }
        try {
            pendingAction.current = act;
            approve(amount * 10n);
        } catch (err) {
            pendingAction.current = null;
            throw err;
        }
    }, [needsApproval, approve]);

    return { runWithApproval };
}

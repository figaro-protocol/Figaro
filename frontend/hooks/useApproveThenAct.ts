"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseApproveThenActArgs {
    /** True when the wallet's current allowance is short of an amount. */
    needsApproval: (amount: bigint) => boolean;
    /** Fire the ERC-20 `approve` transaction. */
    approve: (amount: bigint) => void;
    /** True once the pending approval has confirmed on-chain with a
     *  successful receipt. */
    isApproveSuccess: boolean;
    /** True once the pending approval has ended without granting the
     *  allowance — the wallet refused it, the send failed, or it was mined and
     *  reverted (`useTokenApproval`'s `isApproveError`). */
    isApproveError: boolean;
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
 * A failed or refused approval clears the pending action, so it never fires
 * on some LATER, unrelated approval's success. wagmi reports a wallet
 * refusal asynchronously (`isApproveError` flips; `approve()` returns
 * normally), a reverted approve the same way (its receipt reads, with
 * status "reverted"), and a synchronous `approve()` throw is cleared before
 * it is rethrown.
 */
export function useApproveThenAct({ needsApproval, approve, isApproveSuccess, isApproveError }: UseApproveThenActArgs) {
    const pendingAction = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (isApproveError) pendingAction.current = null;
    }, [isApproveError]);

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

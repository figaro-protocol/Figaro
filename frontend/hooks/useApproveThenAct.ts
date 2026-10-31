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
 * every "bond an amount, then perform this action" surface: seller broadcast
 * (`ReadyToSubmitCard`) and buyer checkout (`CheckoutView`) through
 * `runWithApproval`; seller accept (`YourTurnCard`) through
 * `ensureApproval`, the awaitable form the accept flow runs after its terms
 * confirm, so a seller who declines the terms has approved nothing. If the
 * current allowance already covers the
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
    // The awaited form's promise callbacks; a refusal rejects it.
    const pendingFail = useRef<((err: Error) => void) | null>(null);

    useEffect(() => {
        if (!isApproveError) return;
        pendingAction.current = null;
        const fail = pendingFail.current;
        pendingFail.current = null;
        fail?.(new Error("The bond approval was refused or failed."));
    }, [isApproveError]);

    useEffect(() => {
        if (isApproveSuccess && pendingAction.current) {
            const act = pendingAction.current;
            pendingAction.current = null;
            pendingFail.current = null;
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

    /** The same step, awaited: resolves once the allowance covers `amount`
     *  (at once when it already does), rejects when the approval is refused,
     *  fails or reverts — for a flow that approves between its own steps. */
    const ensureApproval = useCallback((amount: bigint) => new Promise<void>((resolve, reject) => {
        try {
            if (needsApproval(amount)) pendingFail.current = reject;
            runWithApproval(amount, resolve);
        } catch (err) {
            pendingFail.current = null;
            reject(err);
        }
    }), [needsApproval, runWithApproval]);

    return { runWithApproval, ensureApproval };
}

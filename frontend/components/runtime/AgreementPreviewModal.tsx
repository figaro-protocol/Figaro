"use client";

/**
 * AgreementPreviewModal — the confirm gate's modal, for both the SIGN and
 * the COMMIT step of a Commitment.
 *
 * Threat-model 🟡 Priority 4 (UI ↔ MetaMask injection). The wallet prompt
 * shows only the agreementHash (sign) or an opaque transaction (commit).
 * This modal renders the human-readable agreement terms — the shared
 * `AgreementReview` — next to the hash so the user can verify "the hash
 * I'm about to bind to corresponds to the agreement in front of me"
 * before delegating to the wallet.
 *
 * Consumers should not import this directly — it's rendered by the
 * `<CommitmentSignPreviewProvider>` against the confirm gate in
 * `orderPreview`. To gate a sign flow, call
 * `requestSignConfirmation(commitment, agreement)` from your async path;
 * to gate a broadcast, call `requestCommitConfirmation(commitment, agreement)`;
 * the provider opens this modal and resolves your promise on confirm/cancel.
 */

import type { Commitment, Agreement } from "@figaro-protocol/sdk";
import { ModalChrome } from "@/components/ui/ModalChrome";
import { AgreementReview } from "@/components/runtime/AgreementReview";
import type { ConfirmationIntent, SwapConfirmationDetails } from "@/lib/checkout/orderPreview";

interface Props {
    commitment: Commitment;
    agreement: Agreement | null;
    intent: ConfirmationIntent;
    /** Present when this order's bond is swap-funded — surfaced so the party
     *  reviews the swap's maxInput on the Figaro side, not only in the wallet's
     *  native Permit2 prompt. */
    swap?: SwapConfirmationDetails | null;
    onConfirm: () => void;
    onCancel: () => void;
}

const INTENT_COPY: Record<ConfirmationIntent, { eyebrow: string; lede: React.ReactNode; confirm: string }> = {
    sign: {
        eyebrow: "Review before signing",
        lede: (
            <>
                Your wallet will display only the <code className="font-mono text-xs">agreementHash</code>.
                Verify the terms below match what you intend to sign.
            </>
        ),
        confirm: "Confirm & sign",
    },
    commit: {
        eyebrow: "Review before committing",
        lede: (
            <>
                This broadcasts the fully-signed commitment on-chain and locks both
                parties&apos; bonds. Verify the terms below match the agreement both
                parties signed.
            </>
        ),
        confirm: "Confirm & commit",
    },
};

export function AgreementPreviewModal({ commitment, agreement, intent, swap, onConfirm, onCancel }: Props) {
    const copy = INTENT_COPY[intent];

    return (
        <ModalChrome
            onClose={onCancel}
            aria-labelledby="agreement-preview-title"
            data-testid="agreement-preview-modal"
            panelClassName="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50">
                    <p className="text-xs font-semibold text-neutral-500 mb-1">
                        {copy.eyebrow}
                    </p>
                    <h2 id="agreement-preview-title" className="text-lg font-semibold text-black">
                        Agreement preview
                    </h2>
                    <p className="text-sm text-neutral-600 mt-1">
                        {copy.lede}
                    </p>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <AgreementReview commitment={commitment} agreement={agreement} />
                    {swap && (
                        <section className="mt-5 border-t border-neutral-200 pt-4" data-testid="preview-swap">
                            <h3 className="text-xs font-semibold text-neutral-500 mb-2">
                                Swap-funded bond
                            </h3>
                            <p className="text-sm text-neutral-600 mb-2">
                                Your bond is funded by swapping another token into the process
                                currency. You are also authorizing a Permit2 transfer of up to
                                the amount below — your wallet will show it as a second signature.
                            </p>
                            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm">
                                <dt className="text-neutral-500">Max input</dt>
                                <dd className="text-black" data-testid="preview-swap-max-input">
                                    <span className="font-mono text-xs">{swap.maxInput.toString()}</span>
                                </dd>
                                <dt className="text-neutral-500">From token</dt>
                                <dd className="font-mono text-xs text-black break-all">{swap.inputToken}</dd>
                                <dt className="text-neutral-500">Into</dt>
                                <dd className="font-mono text-xs text-black break-all">{swap.currency}</dd>
                            </dl>
                        </section>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="preview-cancel"
                        className="px-4 py-2 text-sm font-semibold border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        data-testid="preview-confirm"
                        className="px-4 py-2 text-sm font-semibold bg-black text-white rounded hover:bg-neutral-800"
                        autoFocus
                    >
                        {copy.confirm}
                    </button>
                </div>
        </ModalChrome>
    );
}

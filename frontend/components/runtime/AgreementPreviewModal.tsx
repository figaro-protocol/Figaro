"use client";

/**
 * AgreementPreviewModal — the confirm gate's modal, for both the SIGN and
 * the COMMIT step of a Commitment.
 *
 * Threat-model 🟡 Priority 4 (UI ↔ MetaMask injection). The wallet prompt
 * shows only the checkoutHash (sign) or an opaque transaction (commit).
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
import { Button } from "@/components/ui/Button";
import { AgreementReview } from "@/components/runtime/AgreementReview";
import type { ConfirmationIntent, SwapConfirmationDetails } from "@/lib/checkout/orderPreview";
import { useWalletChain } from "@/components/runtime/ActiveNetworkLine";
import useTokenBalance from "@/hooks/useTokenBalance";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { tokenFigure } from "@/lib/shared/utils";
import { formatSlippagePercent } from "@/lib/composition/swapVenue";

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
                Your wallet will display only the <code className="font-mono text-xs">checkoutHash</code>.
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

/** The swap leg's figures, read-only: the margin was set in the funding-token
 *  chooser before the quote, so these are exactly what the party signs. The
 *  coordinator pulls the whole max input from the party through Permit2, so
 *  the party's balance of the input token is shown against it. */
function SwapLegFigures({ swap }: { swap: SwapConfirmationDetails }) {
    const inputToken = swap.inputToken as `0x${string}`;
    const { read: balance } = useTokenBalance(inputToken, swap.party as `0x${string}`);
    // The figures are in the FUNDING token's units, read from the chain —
    // never the process token's. Until decimals() answers, no figure shows.
    const { decimals } = useTokenDecimals(inputToken);
    const { data: symbol } = useTokenSymbol(swap.inputToken);
    const figure = (value: bigint) => `${tokenFigure(value, decimals)}${typeof symbol === "string" && symbol ? ` ${symbol}` : ""}`;
    return (
        <>
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
                {decimals !== undefined && (
                    <>
                        <dt className="text-ink-muted">Max input</dt>
                        <dd className="text-ink-primary" data-testid="preview-swap-max-input">
                            <span className="font-mono text-xs">{figure(swap.maxInput)}</span>
                        </dd>
                    </>
                )}
                <dt className="text-ink-muted">Slippage margin</dt>
                <dd className="text-ink-primary" data-testid="preview-swap-margin">
                    {formatSlippagePercent(swap.slippageBps)}%
                </dd>
                {balance.status === "present" && decimals !== undefined && (
                    <>
                        <dt className="text-ink-muted">Your balance</dt>
                        <dd className="text-ink-primary" data-testid="preview-swap-balance">
                            <span className="font-mono text-xs">{figure(balance.value)}</span>
                        </dd>
                    </>
                )}
                <dt className="text-ink-muted">From token</dt>
                <dd className="font-mono text-xs text-ink-primary break-all">{swap.inputToken}</dd>
                <dt className="text-ink-muted">Into</dt>
                <dd className="font-mono text-xs text-ink-primary break-all">{swap.currency}</dd>
            </dl>
            {balance.status === "present" && balance.value < swap.maxInput && (
                <p role="alert" className="mt-2 text-sm text-error-fg" data-testid="preview-swap-balance-short">
                    Your balance is below the max input, so this commit will fail.
                </p>
            )}
        </>
    );
}

export function AgreementPreviewModal({ commitment, agreement, intent, swap, onConfirm, onCancel }: Props) {
    const copy = INTENT_COPY[intent];
    // The wallet's chain, by id, from viem's registry: whether it is a test
    // network and what it is called are the network's own facts. Read from
    // the wallet's connection, the same reading as the shell's network line.
    const chain = useWalletChain();

    return (
        <ModalChrome
            onClose={onCancel}
            aria-labelledby="agreement-preview-title"
            data-testid="agreement-preview-modal"
            panelClassName="bg-paper rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
                {/* Header */}
                <div className="px-6 py-4 border-b border-default bg-subtle">
                    <p className="text-xs font-semibold text-ink-muted mb-1">
                        {copy.eyebrow}
                    </p>
                    <h2 id="agreement-preview-title" className="text-lg font-semibold text-ink-primary">
                        Agreement preview
                    </h2>
                    <p className="text-sm text-ink-body mt-1">
                        {copy.lede}
                    </p>
                    {/* Every commitment signature and commit broadcast passes through here,
                        so on a test network the wallet's chain says so at that moment, from
                        viem's definition of that network (stored nowhere, pinned to no build). */}
                    {chain?.testnet && (
                        <p role="note" data-testid="preview-testnet-notice" className="mt-2 text-sm font-semibold text-ink-primary">
                            This is {chain.name}, a test network. The commitment you sign here runs on {chain.name},
                            and so do the tokens it locks.
                        </p>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    <AgreementReview commitment={commitment} agreement={agreement} />
                    {swap && (
                        <section className="mt-5 border-t border-default pt-4" data-testid="preview-swap">
                            <h3 className="text-xs font-semibold text-ink-muted mb-2">
                                Swap-funded bond
                            </h3>
                            <p className="text-sm text-ink-body mb-2">
                                Your bond is funded by swapping another token into the process
                                currency. You are also authorizing a Permit2 transfer of up to
                                the amount below — your wallet will show it as a second signature.
                            </p>
                            <SwapLegFigures swap={swap} />
                        </section>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-default bg-subtle flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        data-testid="preview-cancel"
                        className="border-default text-ink-body font-semibold"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onConfirm}
                        data-testid="preview-confirm"
                        className="font-semibold"
                        autoFocus
                    >
                        {copy.confirm}
                    </Button>
                </div>
        </ModalChrome>
    );
}

"use client";

/**
 * AgreementPreviewModal — pre-sign gate for Commitment EIP-712 signing.
 *
 * Threat-model 🟡 Priority 4 (UI ↔ MetaMask injection). The wallet prompt
 * shows only the agreementHash. This modal renders the human-readable
 * agreement terms (line items, addresses, amounts, jurisdiction, etc.)
 * next to the hash so the user can verify "the hash I'm about to sign
 * corresponds to the agreement I assembled in the UI" before delegating
 * to the wallet.
 *
 * Consumers should not import this directly — it's rendered by the
 * `<CommitmentSignPreviewProvider>` against the confirm gate in
 * `orderPreview`. To gate a sign flow, call
 * `requestSignConfirmation(commitment, agreement)` from your async path;
 * the provider opens this modal and resolves your promise on confirm/cancel.
 */

import { formatToken } from "@/lib/shared/utils";
import type { Commitment, Agreement, AgreementSection } from "@figaro/core";
import { truncateHex } from "@/lib/shared/formatHex";
import { ModalChrome } from "@/components/ui/ModalChrome";

interface Props {
    commitment: Commitment;
    agreement: Agreement | null;
    onConfirm: () => void;
    onCancel: () => void;
}

function formatPayment(commitment: Commitment): string {
    // Heuristic: if currency is the well-known USDC address pattern, scale by 6;
    // otherwise scale by 18 (ETH / FIG / most ERC-20s). This is for display
    // only — the bytes signed are the bigint exactly.
    try {
        // If it doesn't fit the typical 18-decimal path we fall back to raw.
        return formatToken(commitment.payment);
    } catch {
        return commitment.payment.toString();
    }
}

function commerceLineItems(agreement: Agreement | null): Array<{
    name: string;
    quantity: string;
    unitPrice: string;
}> {
    if (!agreement) return [];
    // Structural, not nominal: the line-item table renders from whichever
    // section carries a `lineItems` array — no clause is named, so a
    // third-party commerce-equivalent clause gets the same rendering.
    const commerce = agreement.sections.find((s) => Array.isArray(s.data?.lineItems));
    if (!commerce) return [];
    const items = commerce.data?.lineItems;
    if (!Array.isArray(items)) return [];
    return items.map((item: Record<string, unknown>) => ({
        name: typeof item.name === "string" ? item.name : "(unnamed item)",
        quantity: typeof item.quantity === "string" || typeof item.quantity === "number"
            ? String(item.quantity)
            : "?",
        unitPrice: typeof item.unitPrice === "string" || typeof item.unitPrice === "number"
            ? String(item.unitPrice)
            : "?",
    }));
}

function nonCommerceSections(agreement: Agreement | null): AgreementSection[] {
    if (!agreement) return [];
    return agreement.sections.filter((s) => !Array.isArray(s.data?.lineItems));
}

export function AgreementPreviewModal({ commitment, agreement, onConfirm, onCancel }: Props) {
    const lineItems = commerceLineItems(agreement);
    const otherSections = nonCommerceSections(agreement);
    const hasAgreement = agreement !== null;
    const deadlineDate = new Date(Number(commitment.deadline) * 1000);

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
                        Review before signing
                    </p>
                    <h2 id="agreement-preview-title" className="text-lg font-semibold text-black">
                        Agreement preview
                    </h2>
                    <p className="text-sm text-neutral-600 mt-1">
                        Your wallet will display only the <code className="font-mono text-xs">agreementHash</code>.
                        Verify the terms below match what you intend to sign.
                    </p>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 text-sm">
                    {!hasAgreement && (
                        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            ⚠ The full agreement document isn&apos;t available locally. Verify the
                            <code className="font-mono mx-1">agreementHash</code> below against the source you trust
                            before continuing.
                        </div>
                    )}

                    {/* Parties */}
                    <section>
                        <h3 className="text-xs font-semibold text-neutral-500 mb-2">Parties</h3>
                        <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                            <dt className="text-neutral-500">Buyer</dt>
                            <dd className="font-mono text-xs text-black" data-testid="preview-buyer">{commitment.buyer}</dd>
                            <dt className="text-neutral-500">Seller</dt>
                            <dd className="font-mono text-xs text-black" data-testid="preview-seller">{commitment.seller}</dd>
                        </dl>
                    </section>

                    {/* Payment */}
                    <section>
                        <h3 className="text-xs font-semibold text-neutral-500 mb-2">Payment</h3>
                        <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                            <dt className="text-neutral-500">Currency</dt>
                            <dd className="font-mono text-xs text-black">{commitment.currency}</dd>
                            <dt className="text-neutral-500">Amount</dt>
                            <dd className="text-black" data-testid="preview-payment">
                                {formatPayment(commitment)} <span className="text-neutral-500 text-xs">(raw: {commitment.payment.toString()})</span>
                            </dd>
                            <dt className="text-neutral-500">Deadline</dt>
                            <dd className="text-black">
                                {deadlineDate.toLocaleString()} <span className="text-neutral-500 text-xs">(unix {commitment.deadline.toString()})</span>
                            </dd>
                        </dl>
                    </section>

                    {/* Commerce / line items */}
                    {lineItems.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-neutral-500 mb-2">Line items</h3>
                            <ul className="border border-neutral-200 rounded divide-y divide-neutral-200 text-sm" data-testid="preview-line-items">
                                {lineItems.map((item, i) => (
                                    <li key={i} className="px-3 py-2 flex justify-between">
                                        <span className="text-black">{item.name}</span>
                                        <span className="text-neutral-600 font-mono text-xs">×{item.quantity} @ {item.unitPrice}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Other agreement sections */}
                    {otherSections.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-neutral-500 mb-2">Clauses</h3>
                            <ul className="space-y-2 text-xs" data-testid="preview-clauses">
                                {otherSections.map((section) => (
                                    <li key={section.clause} className="border border-neutral-200 rounded px-3 py-2">
                                        <p className="font-mono text-neutral-500 mb-1">{section.clause}</p>
                                        <pre className="text-black whitespace-pre-wrap break-words">
                                            {JSON.stringify(section.data, null, 2)}
                                        </pre>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Hash */}
                    <section className="border-t border-neutral-200 pt-4">
                        <h3 className="text-xs font-semibold text-neutral-500 mb-2">
                            agreementHash (signed value)
                        </h3>
                        <p className="font-mono text-xs text-black break-all bg-neutral-50 border border-neutral-200 rounded p-2" data-testid="preview-agreement-hash">
                            {commitment.agreementHash}
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                            Your wallet will show this exact value. Confirm only if it matches the agreement above.
                        </p>
                    </section>
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
                        Confirm &amp; sign
                    </button>
                </div>
        </ModalChrome>
    );
}

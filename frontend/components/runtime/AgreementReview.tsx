"use client";

/**
 * AgreementReview — the ONE human-readable rendering of a commitment's
 * agreement terms, shared by every surface that asks a party to review
 * before signing or committing.
 *
 * The wallet prompt shows only the 32-byte agreementHash; this component
 * renders the terms that hash to it — parties, payment, line items,
 * consent documents, every clause section — next to the hash itself, so
 * the reviewer can verify "the hash I'm about to bind to corresponds to
 * the agreement in front of me."
 *
 * Consumers: the pre-sign/pre-commit confirm gate (`AgreementPreviewModal`
 * via `CommitmentSignPreviewProvider`) and the `/sign` counter-party page.
 * Rendering here is identity-blind — sections are read structurally
 * (`lineItems` array) or by the spec's own `block.design.article`, never by
 * clause name, so a never-seen third-party clause gets the same surface.
 */

import { formatToken } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import type { Commitment, Agreement, AgreementSection } from "@figaro-protocol/sdk";
import { formatBlockTimestamp } from "@/lib/shared/formatTimestamp";
import { describeClause, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { resolveContentUri } from "@/lib/shared/ipfsService";

interface Props {
    commitment: Commitment;
    agreement: Agreement | null;
}

function formatPayment(payment: bigint, decimals: number): string {
    // Display only — the bytes signed are the bigint exactly. Decimals are the
    // token's on-chain `decimals()` (read on the connected chain), NOT an
    // 18-default: this is the verify-before-sign surface, so a wrong magnitude
    // here defeats the modal's whole purpose for a non-18-decimal token.
    try {
        return formatToken(payment, decimals);
    } catch {
        return payment.toString();
    }
}

export function commerceLineItems(agreement: Agreement | null): Array<{
    name: string;
    quantity: string;
    unitPrice: string;
}> {
    if (!agreement) return [];
    // Structural, not nominal: the line-item table renders from EVERY section
    // that carries a `lineItems` array — no clause is named, so a third-party
    // commerce-equivalent clause gets the same rendering. All such sections are
    // flattened (not just the first): the table is a readability layer, and the
    // exhaustive JSON dump below is what guarantees nothing signed is hidden.
    return agreement.sections.flatMap((s) => {
        const items = s.data?.lineItems;
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
    });
}

/**
 * EVERY section, dumped in full as canonical JSON — the exhaustive rendering
 * that closes the "sign what you didn't see" gap. The pretty line-item table
 * and the consent-terms block are additive readability layers ON TOP of this;
 * this dump is the guarantee that no author-controlled key (an extra field on
 * a commerce section, a second `lineItems`-bearing section) can suppress
 * merkle-committed content from the review. Do NOT filter by section shape:
 * the whole `section.data` is bound into `agreementHash`
 * (`getSectionDataBytes` hashes every key), so the whole `section.data` is
 * shown.
 */
export function fullDumpSections(agreement: Agreement | null): AgreementSection[] {
    if (!agreement) return [];
    return agreement.sections;
}

/** Sections whose clause declares the `consent` ARTICLE — the spec's own
 *  classification, never a clause name; a never-seen consent-article clause
 *  gets the same notice. */
function consentSections(agreement: Agreement | null): AgreementSection[] {
    if (!agreement) return [];
    return agreement.sections.filter((s) => getClauseSpec(s.clause)?.block?.design.article === "consent");
}

/** A described value token, linkified when it is a fetchable locator so the
 *  signer can READ the affixed document before signing. */
function ConsentValueToken({ token }: { token: string }) {
    const href = token.startsWith("ipfs://") ? resolveContentUri(token) : null;
    if (!href) return <>{token}</>;
    return (
        <a href={href} target="_blank" rel="noreferrer" className="underline text-ink-primary">
            {token}
        </a>
    );
}

export function AgreementReview({ commitment, agreement }: Props) {
    const { decimals } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    const lineItems = commerceLineItems(agreement);
    const dumpedSections = fullDumpSections(agreement);
    const consented = consentSections(agreement);
    const hasAgreement = agreement !== null;

    return (
        <div className="space-y-5 text-sm" data-testid="agreement-review">
            {!hasAgreement && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ The full agreement document isn&apos;t available locally. Verify the
                    <code className="font-mono mx-1">agreementHash</code> below against the source you trust
                    before continuing.
                </div>
            )}

            {/* Parties */}
            <section>
                <h3 className="text-xs font-semibold text-ink-muted mb-2">Parties</h3>
                <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                    <dt className="text-ink-muted">Buyer</dt>
                    <dd className="font-mono text-xs text-ink-primary break-all" data-testid="preview-buyer">{commitment.buyer}</dd>
                    <dt className="text-ink-muted">Seller</dt>
                    <dd className="font-mono text-xs text-ink-primary break-all" data-testid="preview-seller">{commitment.seller}</dd>
                </dl>
            </section>

            {/* Payment */}
            <section>
                <h3 className="text-xs font-semibold text-ink-muted mb-2">Payment</h3>
                <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                    <dt className="text-ink-muted">Currency</dt>
                    <dd className="font-mono text-xs text-ink-primary break-all">{commitment.currency}</dd>
                    <dt className="text-ink-muted">Amount</dt>
                    <dd className="text-ink-primary" data-testid="preview-payment">
                        {formatPayment(commitment.payment, decimals)} <span className="text-ink-muted text-xs">(raw: {commitment.payment.toString()})</span>
                    </dd>
                    <dt className="text-ink-muted">Deadline</dt>
                    <dd className="text-ink-primary">
                        {formatBlockTimestamp(commitment.deadline)} <span className="text-ink-muted text-xs">(unix {commitment.deadline.toString()})</span>
                    </dd>
                </dl>
            </section>

            {/* Commerce / line items */}
            {lineItems.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Line items</h3>
                    <ul className="border border-default rounded divide-y divide-default text-sm" data-testid="preview-line-items">
                        {lineItems.map((item, i) => (
                            <li key={i} className="px-3 py-2 flex justify-between">
                                <span className="text-ink-primary">{item.name}</span>
                                <span className="text-ink-body font-mono text-xs">×{item.quantity} @ {item.unitPrice}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Consent terms — the /faq framing, verbatim register:
                consent is an AGREEMENT concern (the assembly composes a
                consent clause and affixes its documents to the deal);
                the signature over the agreementHash IS the recorded
                acceptance — no separate ceremony, no checkbox. */}
            {consented.length > 0 && (
                <section data-testid="preview-consent-terms">
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Consent terms</h3>
                    <div className="rounded border border-default bg-subtle px-3 py-2 space-y-2 text-xs text-ink-body">
                        <p>
                            This agreement composes a consent clause and affixes its
                            documents to the deal. Your signature over the{" "}
                            <code className="font-mono">agreementHash</code> cryptographically
                            records your acceptance of each document listed below — consent as
                            an agreement term, the pattern the European Data Protection Board
                            recommends for blockchains (Guidelines 02/2025): the documents stay
                            off-chain; the chain keeps only fingerprints.
                        </p>
                        <ul className="space-y-1" data-testid="preview-consent-documents">
                            {consented.flatMap((section) =>
                                describeClause(section.clause, section.data as Record<string, unknown>).fields.flatMap((field) =>
                                    field.values.map((line, i) => (
                                        <li key={`${section.clause}-${field.name}-${i}`} className="font-mono break-all text-ink-primary">
                                            {line.split(" · ").map((token, j) => (
                                                <span key={j}>
                                                    {j > 0 && <span className="text-ink-faint"> · </span>}
                                                    <ConsentValueToken token={token} />
                                                </span>
                                            ))}
                                        </li>
                                    ))))}
                        </ul>
                    </div>
                </section>
            )}

            {/* Every agreement section, dumped in full — the exhaustive view
                that makes the readability layers above safe: no committed key
                can be hidden from what the signer binds. */}
            {dumpedSections.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Clauses</h3>
                    <ul className="space-y-2 text-xs" data-testid="preview-clauses">
                        {dumpedSections.map((section) => (
                            <li key={section.clause} className="border border-default rounded px-3 py-2">
                                <p className="font-mono text-ink-muted mb-1">{section.clause}</p>
                                <pre className="text-ink-primary whitespace-pre-wrap break-words">
                                    {JSON.stringify(section.data, null, 2)}
                                </pre>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Hash */}
            <section className="border-t border-default pt-4">
                <h3 className="text-xs font-semibold text-ink-muted mb-2">
                    agreementHash (signed value)
                </h3>
                <p className="font-mono text-xs text-ink-primary break-all bg-subtle border border-default rounded p-2" data-testid="preview-agreement-hash">
                    {commitment.agreementHash}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                    This is the exact 32-byte value the signatures bind to. Proceed only if it matches the agreement above.
                </p>
            </section>
        </div>
    );
}

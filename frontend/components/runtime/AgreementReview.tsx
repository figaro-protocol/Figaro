"use client";

/**
 * AgreementReview — the ONE human-readable rendering of a commitment's
 * agreement terms, shared by every surface that asks a party to review
 * before signing or committing.
 *
 * The wallet prompt shows only the 32-byte checkoutHash; this component
 * renders the terms that hash to it — parties, payment, line items,
 * consent documents, every clause — next to the hash itself, so
 * the reviewer can verify "the hash I'm about to bind to corresponds to
 * the agreement in front of me."
 *
 * Consumers: the pre-sign/pre-commit confirm gate (`AgreementPreviewModal`
 * via `CommitmentSignPreviewProvider`) and the `/sign` counter-party page.
 * Rendering here is identity-blind — clauses are read structurally
 * (`lineItems` array) or by the spec's own `block.design.article`, never by
 * clause name, so a never-seen third-party clause gets the same surface.
 */

import { formatToken } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { calculateBonds, type Commitment, type Agreement, type AgreementClause } from "@figaro-protocol/sdk";
import { ZERO_BYTES32 } from "@figaro-protocol/sdk";
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
    itemId: string | undefined;
    name: string;
    quantity: string;
    unitPrice: string;
}> {
    if (!agreement) return [];
    // Structural, not nominal: the line-item table renders from EVERY clause
    // that carries a `lineItems` array — no clause is named, so a third-party
    // commerce-equivalent clause gets the same rendering. All such clauses are
    // flattened (not just the first): the table is a readability layer, and the
    // exhaustive JSON dump below is what guarantees nothing signed is hidden.
    return agreement.clauses.flatMap((s) => {
        const items = s.data?.lineItems;
        if (!Array.isArray(items)) return [];
        return items.map((item: Record<string, unknown>) => ({
            itemId: typeof item.itemId === "string" ? item.itemId : undefined,
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
 * EVERY clause, dumped in full as canonical JSON — the exhaustive rendering
 * that closes the "sign what you didn't see" gap. The pretty line-item table
 * and the consent-terms block are additive readability layers ON TOP of this;
 * this dump is the guarantee that no author-controlled key (an extra field on
 * a commerce clause, a second `lineItems`-bearing clause) can suppress
 * merkle-committed content from the review. Do NOT filter by clause shape:
 * the whole `clauseEntry.data` is bound into `checkoutHash`
 * (`getClauseDataBytes` hashes every key), so the whole `clauseEntry.data` is
 * shown.
 */
export function fullDumpClauses(agreement: Agreement | null): AgreementClause[] {
    if (!agreement) return [];
    return agreement.clauses;
}

/** What the dump says of a clause whose content is WITHHELD — a leaf carrying
 *  a `dataHash` and no `data`: the signer binds a leaf it cannot read, and the
 *  review says so in words beside the hash, never an empty box. Null for a
 *  clause with content. */
export function withheldLeafNotice(clauseEntry: AgreementClause): string | null {
    if (clauseEntry.data !== undefined) return null;
    return `Content withheld by the party that wrote it — you sign the fingerprint ${clauseEntry.dataHash ?? "(none)"} without reading what it stands for.`;
}

/** Clauses whose clause declares the `consent` ARTICLE — the spec's own
 *  classification, never a clause name; a never-seen consent-article clause
 *  gets the same notice. */
function consentClauses(agreement: Agreement | null): AgreementClause[] {
    if (!agreement) return [];
    return agreement.clauses.filter((s) => getClauseSpec(s.clause)?.block?.design.article === "consent");
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
    const { decimals, ready: decimalsReady } = useTokenDecimals(commitment.currency as `0x${string}` | undefined);
    // A figure is shown only once the token's decimals are READ: until then
    // the raw integer stands alone, never a magnitude formatted on a default.
    const figure = (amount: bigint) => decimalsReady ? formatPayment(amount, decimals) : "(token decimals loading)";
    const isRoot = commitment.processId === ZERO_BYTES32;
    const bonds = calculateBonds(commitment.expectedCumulativeValue, commitment.payment);
    const lineItems = commerceLineItems(agreement);
    const dumpedClauses = fullDumpClauses(agreement);
    const consented = consentClauses(agreement);
    const hasAgreement = agreement !== null;

    return (
        <div className="space-y-5 text-sm" data-testid="agreement-review">
            {!hasAgreement && (
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
                    ⚠ The full agreement document isn&apos;t available locally. Verify the
                    <code className="font-mono mx-1">checkoutHash</code> below against the source you trust
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
                        {figure(commitment.payment)} <span className="text-ink-muted text-xs">(raw: {commitment.payment.toString()})</span>
                    </dd>
                    <dt className="text-ink-muted">Deadline</dt>
                    <dd className="text-ink-primary">
                        {formatBlockTimestamp(commitment.deadline)} <span className="text-ink-muted text-xs">(unix {commitment.deadline.toString()})</span>
                    </dd>
                </dl>
            </section>

            {/* The process and the bonds — every field of the signed struct the
                sections above do not show, so the one shared gate shows them all */}
            <section>
                <h3 className="text-xs font-semibold text-ink-muted mb-2">Process and bonds</h3>
                <dl className="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                    <dt className="text-ink-muted">Process</dt>
                    <dd className="font-mono text-xs text-ink-primary break-all" data-testid="preview-process">
                        {isRoot ? "a new process — this is its root order" : commitment.processId}
                    </dd>
                    <dt className="text-ink-muted">Cumulative</dt>
                    <dd className="text-ink-primary" data-testid="preview-cumulative">
                        {figure(commitment.expectedCumulativeValue)} <span className="text-ink-muted text-xs">(raw: {commitment.expectedCumulativeValue.toString()} — the process&rsquo;s value through this order)</span>
                    </dd>
                    <dt className="text-ink-muted">Buyer bond</dt>
                    <dd className="text-ink-primary" data-testid="preview-buyer-bond">
                        {figure(bonds.buyerBond)} <span className="text-ink-muted text-xs">(raw: {bonds.buyerBond.toString()} — twice the payment, locked at commit)</span>
                    </dd>
                    <dt className="text-ink-muted">Seller bond</dt>
                    <dd className="text-ink-primary" data-testid="preview-seller-bond">
                        {figure(bonds.sellerBond)} <span className="text-ink-muted text-xs">(raw: {bonds.sellerBond.toString()} — twice the cumulative value, locked at commit)</span>
                    </dd>
                    <dt className="text-ink-muted">Salt</dt>
                    <dd className="font-mono text-xs text-ink-muted break-all">{commitment.salt.toString()}</dd>
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
                consent clause and affixes its documents to the trade);
                the signature over the checkoutHash IS the recorded
                acceptance — no separate ceremony, no checkbox. */}
            {consented.length > 0 && (
                <section data-testid="preview-consent-terms">
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Consent terms</h3>
                    <div className="rounded border border-default bg-subtle px-3 py-2 space-y-2 text-xs text-ink-body">
                        <p>
                            This agreement composes a consent clause and affixes its
                            documents to the trade. Your signature over the{" "}
                            <code className="font-mono">checkoutHash</code> cryptographically
                            binds your acceptance of each document listed below — consent as
                            an agreement term, the pattern the European Data Protection Board
                            recommends for blockchains (Guidelines 02/2025): the documents stay
                            off-chain; the chain keeps only fingerprints.
                        </p>
                        <ul className="space-y-1" data-testid="preview-consent-documents">
                            {consented.flatMap((clauseEntry) =>
                                describeClause(clauseEntry.clause, clauseEntry.data as Record<string, unknown>).fields.flatMap((field) =>
                                    field.values.map((line, i) => (
                                        <li key={`${clauseEntry.clause}-${field.name}-${i}`} className="font-mono break-all text-ink-primary">
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

            {/* Every agreement clauseEntry, dumped in full — the exhaustive view
                that makes the readability layers above safe: no committed key
                can be hidden from what the signer binds. */}
            {dumpedClauses.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Clauses</h3>
                    <ul className="space-y-2 text-xs" data-testid="preview-clauses">
                        {dumpedClauses.map((clauseEntry) => (
                            <li key={clauseEntry.clause} className="border border-default rounded px-3 py-2">
                                <p className="font-mono text-ink-muted mb-1">{clauseEntry.clause}</p>
                                {withheldLeafNotice(clauseEntry) ? (
                                    <p className="text-warning-fg break-words" data-testid={`preview-clause-withheld-${clauseEntry.clause}`}>
                                        {withheldLeafNotice(clauseEntry)}
                                    </p>
                                ) : (
                                    <pre className="text-ink-primary whitespace-pre-wrap break-words">
                                        {JSON.stringify(clauseEntry.data, null, 2)}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Provenance — the registered agreement this order instantiates and
                the assembly's assembly root, both committed under the
                checkoutHash as the provenance leaf. */}
            {agreement?.provenance && (
                <section data-testid="preview-provenance">
                    <h3 className="text-xs font-semibold text-ink-muted mb-2">Provenance</h3>
                    <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs">
                        <dt className="text-ink-muted">Agreement hash</dt>
                        <dd className="font-mono text-ink-primary break-all" data-testid="preview-provenance-agreement-hash">
                            {agreement.provenance.agreementHash}
                        </dd>
                        <dt className="text-ink-muted">Assembly root</dt>
                        <dd className="font-mono text-ink-primary break-all" data-testid="preview-provenance-assembly-hash">
                            {agreement.provenance.assemblyHash}
                        </dd>
                    </dl>
                </section>
            )}

            {/* Hash */}
            <section className="border-t border-default pt-4">
                <h3 className="text-xs font-semibold text-ink-muted mb-2">
                    checkoutHash (signed value)
                </h3>
                <p className="font-mono text-xs text-ink-primary break-all bg-subtle border border-default rounded p-2" data-testid="preview-checkout-hash">
                    {commitment.checkoutHash}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                    This is the exact 32-byte value the signatures bind to. Proceed only if it matches the agreement above.
                </p>
            </section>
        </div>
    );
}

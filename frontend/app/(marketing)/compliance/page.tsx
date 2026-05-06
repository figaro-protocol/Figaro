import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Compliance — Figaro Protocol",
    description: "Every settled process carries its own evidence bundle. Terms, performance, timestamps, signatures — verifiable on chain without a platform.",
};

export default function Compliance() {
    return (
        <>

            {/* Hero — practitioner register, not academic */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-eyebrow uppercase text-ink-muted mb-4">
                    Compliance &amp; audit
                </p>
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Every settled process carries its own evidence bundle.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl">
                    Terms, performance, timestamps, signatures. Verifiable on chain, without trusting a platform&apos;s internal records. If you need to confirm what actually happened between two counterparties who transacted through Figaro, this page is for you.
                </p>
            </section>

            {/* What's in an evidence bundle */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <p className="text-eyebrow uppercase text-ink-muted mb-3">
                    What&apos;s in the bundle
                </p>
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    The chain records everything that happened.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    A Figaro process consists of one or more bonded commitments between a buyer and sellers. Every stage of the lifecycle produces an on-chain artifact:
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Terms</span>
                        <span>An <code>agreementHash</code> on each commitment binds both parties to a specific off-chain document (contract, spec, order details). The hash proves which document is at issue; tampering with any field invalidates the signature.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Signatures</span>
                        <span>Both parties sign the commitment via EIP-712 typed data. Meets AdES technical requirements under eIDAS; satisfies UCC §1-201 definitions of &ldquo;record&rdquo; and &ldquo;signature&rdquo;; functional-equivalent under UNCITRAL Model Law.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Time</span>
                        <span>Block timestamps on finalized blocks. Set by consensus rules, not retroactively modifiable.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Bonds</span>
                        <span>Locked collateral visible on chain. Who posted what, when, in what currency.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Lifecycle</span>
                        <span>Schema-typed attestations emitted during process life &mdash; delivery progression, proximity witness, GHG disclosures. Each is role-gated and validated by the registered schema validator before emission.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Settlement</span>
                        <span>The <code>resolveProcess</code> call (or its conspicuous absence) closes the process. Payouts to sellers; refunds to buyer; exact amounts recorded.</span>
                    </li>
                </ul>
            </section>

            {/* Class A / Class B — practitioner framing */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <p className="text-eyebrow uppercase text-ink-muted mb-3">
                    Two classes of record
                </p>
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Not all on-chain evidence carries the same weight.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Inside the bundle, some records are byproducts of settlement (parties couldn&apos;t avoid producing them without giving up their bond) and some are voluntary attestations (parties chose to emit them). Your audit methodology should treat the two classes differently.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-default rounded-lg p-5">
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">Class A — settlement byproduct</div>
                        <p className="text-sm text-ink-body leading-relaxed mb-3">
                            Commitments, bonds, resolution calls. Produced mechanically as a side effect of the bonding game. No party can opt out of emitting these without opting out of payment.
                        </p>
                        <p className="text-xs text-ink-muted">Weight: high. The incentive structure guarantees emission.</p>
                    </div>
                    <div className="border border-default rounded-lg p-5">
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">Class B — discretionary attestation</div>
                        <p className="text-sm text-ink-body leading-relaxed mb-3">
                            Lifecycle events, proximity proofs, GHG figures. Voluntarily emitted by the parties. Schema-validated for format; not for truth.
                        </p>
                        <p className="text-xs text-ink-muted">Weight: conditional. Apply ordinary authentication-and-hearsay analysis. The record is tamper-proof once signed; accuracy at the moment of signing is the audit question.</p>
                    </div>
                </div>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    The distinction matters in practice: a missing Class B attestation can mean the event never happened, or that the seller chose not to attest. Your report should say which.
                </p>
            </section>

            {/* How to verify */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <p className="text-eyebrow uppercase text-ink-muted mb-3">
                    How to verify
                </p>
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Four ways into the same record.
                </h2>
                <div className="space-y-6 text-sm text-ink-body leading-relaxed">
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">For an individual process</div>
                        <p>Given the <code>processId</code>, use a block explorer to read the commitments, attestations, and resolution events, or use the SDK&apos;s <code>reconstruct()</code> primitive to replay the events into a state machine. The reconstructed state is the complete accounting position of the process at any point in its life.</p>
                    </div>
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">For a counterparty over time</div>
                        <p>Use settlement-velocity queries against event logs: index every <code>OrderCommitted</code> and <code>OrderResolved</code> where the party appears. The aggregate is a tamper-proof participation record &mdash; the on-chain analogue of a trading record or transaction history, without a custodian.</p>
                    </div>
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">For a claim about specific off-chain performance</div>
                        <p>The on-chain record will show <em>what was attested</em>. Verifying that the attestation matches what actually happened off-chain (the driver arrived, the goods matched spec, the emissions were what was disclosed) is your work &mdash; the protocol can&apos;t do it. This is the new audit function; see the accounting paper below.</p>
                    </div>
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">For a dispute between parties</div>
                        <p>The on-chain record is admissible electronic evidence under eIDAS, UCC, UNCITRAL, and the Singapore Electronic Transactions Act. It does not replace adjudication &mdash; forums adjudicate. It provides the input.</p>
                    </div>
                </div>
            </section>

            {/* What this replaces */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <p className="text-eyebrow uppercase text-ink-muted mb-3">
                    What this replaces &mdash; and what it doesn&apos;t
                </p>
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Record-keeping moves to the protocol. Judgment stays human.
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">Replaces</div>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed">
                            <li>&mdash; Internal bookkeeping for process-scoped activity</li>
                            <li>&mdash; Reconciliation between parties&apos; separate records</li>
                            <li>&mdash; Period-end close (automatic at process resolution)</li>
                            <li>&mdash; Audit-of-records-against-records (there is only one record)</li>
                            <li>&mdash; Disputes about what the books say</li>
                        </ul>
                    </div>
                    <div>
                        <div className="text-eyebrow uppercase text-ink-muted mb-2">Does not replace</div>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed">
                            <li>&mdash; Revenue recognition under ambiguity</li>
                            <li>&mdash; Going-concern and fair-value judgment</li>
                            <li>&mdash; Regulatory filings in jurisdictional formats</li>
                            <li>&mdash; Audit-of-records-against-reality (did the goods exist, was the service performed)</li>
                            <li>&mdash; Adjudication of disputes that go to a forum</li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* Deeper reading */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-default pt-12">
                <p className="text-eyebrow uppercase text-ink-muted mb-3">
                    Deeper reading
                </p>
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Two papers, if you need them.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <div className="border border-default rounded-lg p-5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <strong>Paper E &mdash; On-Chain Evidence, Off-Chain Adjudication</strong>
                            <a href="/papers/figaro-legal.pdf" className="text-xs font-semibold text-ink-heading hover:text-ink-body shrink-0">PDF &rarr;</a>
                        </div>
                        <p>Full doctrinal treatment of the evidentiary framework. eIDAS / UCC / UNCITRAL / Singapore ETA fit. Why on-chain juries are a category error.</p>
                    </div>
                    <div className="border border-default rounded-lg p-5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <strong>Paper G &mdash; Bookkeeping as Protocol Byproduct</strong>
                            <a href="/papers/figaro-accounting.pdf" className="text-xs font-semibold text-ink-heading hover:text-ink-body shrink-0">PDF &rarr;</a>
                        </div>
                        <p>A Figaro process as a self-closing ledger period. The Pacioli stack, re-examined under protocol-level records. What the audit profession stops needing to do, and what remains genuinely professional.</p>
                    </div>
                </div>
                <p className="mt-6 text-xs text-ink-muted leading-relaxed">
                    This page does not constitute legal or accounting advice. It describes what the on-chain record is and what can be verified directly from chain state. Professional judgments about recognition, interpretation, and regulatory treatment are yours to make.
                </p>
            </section>

        </>
    );
}

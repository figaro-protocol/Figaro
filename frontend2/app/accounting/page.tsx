import Link from "next/link";

export default function Accounting() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Accounting &amp; auditing
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    A Figaro process is a self-closing ledger period.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Luca Pacioli solved a problem in 1494: how to track the position of an opaque economic entity over time. The apparatus built on top &mdash; bookkeeping, accounting, auditing, commercial law &mdash; rests on the assumption that books exist and need external verification. A Figaro process makes the books the byproduct of the protocol.
                </p>
            </section>

            {/* The Pacioli problem */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The Pacioli problem
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Double-entry made the firm possible.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Pacioli&apos;s <em>Summa de arithmetica</em> (Venice, 1494) codified double-entry bookkeeping as practiced by Venetian merchants. The method: every transaction recorded twice &mdash; once as a debit, once as a credit. Sum of debits always equals sum of credits. The books self-check; the cumulative position is derivable at any moment as a trial balance.
                    </p>
                    <p>
                        This was the innovation that made the modern firm possible. A cook running a kitchen can track inventories in their head; a merchant house running dozens of ships cannot. Double-entry made scale legible under distributed operations. Werner Sombart (1916) argued the technique was a necessary condition for modern capitalism. The argument has been debated but not decisively refuted.
                    </p>
                    <p>
                        Five centuries of professional apparatus have grown on top: bookkeepers, accountants, auditors, tax preparers, commercial lawyers. The stack is expensive &mdash; compliance-related accounting runs into percentages of revenue for public firms &mdash; but is justified because it answers a question that cannot otherwise be answered: <em>is the firm&apos;s position as its managers say it is?</em>
                    </p>
                </div>
            </section>

            {/* The technical mapping */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The mapping
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Every Pacioli element, protocol-constituted.
                </h2>
                <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase tracking-widest text-gray-500 border-b border-gray-200">
                            <tr>
                                <th className="py-2 pr-4 font-semibold">Accounting concept</th>
                                <th className="py-2 font-semibold">Figaro equivalent</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700">
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Balance-sheet position</td>
                                <td className="py-3">Contract custody balance (ProcessState)</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Journal entry</td>
                                <td className="py-3"><code>OrderCommitted</code> event, dual-signed, block-timestamped</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Bookkeeping identity</td>
                                <td className="py-3">Conservation law (every custody debit balanced)</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Supporting documentation</td>
                                <td className="py-3"><code>agreementHash</code> + schema-typed attestations</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Closing entries</td>
                                <td className="py-3"><code>resolveProcess</code> atomic distribution</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Period close</td>
                                <td className="py-3">Process dissolution</td>
                            </tr>
                            <tr className="border-b border-gray-100">
                                <td className="py-3 pr-4">Trial balance</td>
                                <td className="py-3">SDK <code>reconstruct()</code> primitive &mdash; universal</td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4">Audit trail</td>
                                <td className="py-3">The chain itself &mdash; immutable, publicly verifiable</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Every entry is on chain. Every pair balances. The trial balance reconciles at every reachable state by construction of the conservation law. The record is complete without any party maintaining books.
                </p>
            </section>

            {/* What stops */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What stops being necessary
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Four classes of work, retired.
                </h2>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Keep</span>
                        <span><strong>Record-keeping.</strong> Maintaining journals, posting to ledgers, reconciling sub-ledgers. The chain records; any reader reconstructs.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Close</span>
                        <span><strong>Period-end close.</strong> Adjusting entries, trial balance, accruals, closing entries. Automatic at resolution.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Verify</span>
                        <span><strong>Internal and external audit of records.</strong> There is no separate record to reconcile against; the chain is the record.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Dispute</span>
                        <span><strong>Commercial-law disputes about what the books say.</strong> The chain settles the question; disagreements shift to what the chain&apos;s contents mean.</span>
                    </li>
                </ul>
            </section>

            {/* What continues */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What continues, and why
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Judgment, translation, reality-audit.
                </h2>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-24 shrink-0 uppercase">Judgment</span>
                        <span><strong>What records mean.</strong> Revenue recognition under ambiguity, going-concern assessment, fair-value assessment, impairment judgment. The protocol records what happened; it does not determine how what happened should be interpreted under GAAP, IFRS, tax code, or sector-specific regulation.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-24 shrink-0 uppercase">Translate</span>
                        <span><strong>For non-technical readers.</strong> Narrative MD&amp;A, executive summaries, regulatory filings in jurisdictional formats. The chain is complete but unreadable to most intended audiences; the accountant becomes translator rather than record-keeper.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-24 shrink-0 uppercase">Real-audit</span>
                        <span><strong>Reconciling records to reality.</strong> Did the cook prepare the food? Did the courier deliver it? Did the attested GHG figure reflect the measured quantity? The protocol can&apos;t answer; an auditor testing records-against-world is doing genuinely new work, and may become the core function of the post-Pacioli audit profession.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-24 shrink-0 uppercase">Comply</span>
                        <span><strong>Regulatory translation.</strong> Tax law, securities law, sector-specific regulation assume conventional books. For an extended period &mdash; probably decades &mdash; firms on Figaro processes will produce conventional financial statements from on-chain records to satisfy regulatory requirements.</span>
                    </li>
                </ul>
            </section>

            {/* The third inflection */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The third inflection
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Pacioli → Nakamoto/Buterin → Figaro.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        <strong>1494 — Pacioli.</strong> Entity-tracking becomes possible. Double-entry lets an opaque firm make its position legible over time.
                    </p>
                    <p>
                        <strong>2008–2015 — Nakamoto, Buterin.</strong> Settlement becomes distributed. Bitcoin and Ethereum establish that a ledger can exist without a central authority.
                    </p>
                    <p>
                        <strong>2026 — Figaro.</strong> Records become process-scoped and self-closing. The books exist for the duration of the process and dissolve at settlement, replaced by a permanent on-chain record that any reader can verify.
                    </p>
                    <p className="text-gray-500">
                        Each inflection reduces a specific apparatus from necessary to optional for the class of activity it covers, leaving the rest intact. The accounting profession is at the beginning of absorbing the third. The paper is an attempt to describe precisely what that entails &mdash; before the debate gets muddied by the usual overpromising of blockchain-accounting claims and the usual under-appreciation of what has actually changed.
                    </p>
                </div>
            </section>

            {/* What is gained */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Distributional implication
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Accounting becomes accessible.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    The Pacioli apparatus is a gating function. Small firms and individual participants who can&apos;t afford professional accounting are partially excluded from formal contracts, audited transactions, and disclosures that require an attestor. A protocol that produces the accounting record as a byproduct of ordinary settlement makes the record available to participants who couldn&apos;t otherwise have afforded it. This is real: accounting infrastructure becomes available at the protocol layer to participants who previously faced the full cost of the apparatus. The consequences &mdash; for smaller economic units, for participants in jurisdictions without strong accounting-profession infrastructure, for machine and agent-led economic activity whose scale does not justify an accountant &mdash; are substantial and remain to be worked out.
                </p>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                            Read the paper
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The full argument, with the Pacioli engagement, Ijiri&apos;s and Grigg&apos;s triple-entry antecedents, the formal mapping to balance-sheet and journal entries, and the connections to the institutional-economics and legal-evidence companions, is in the accounting paper.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-accounting.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (G) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-gray-500">
                    <p>
                        Companion reading:&nbsp;
                        <Link href="/legal" className="underline hover:text-black transition-colors">
                            the electronic-evidence paper
                        </Link>
                        &nbsp;(the on-chain record as evidence and as constitutive ledger);&nbsp;
                        <Link href="/economics" className="underline hover:text-black transition-colors">
                            the institutional-economics paper
                        </Link>
                        &nbsp;(the firm&apos;s self-knowledge function alongside its coordination function). Full set:&nbsp;
                        <Link href="/research" className="underline hover:text-black transition-colors">
                            research index
                        </Link>.
                    </p>
                </div>
            </section>

        </>
    );
}

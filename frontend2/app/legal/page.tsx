import Link from "next/link";

export default function Legal() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Law &amp; evidence
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Settlement on chain. Adjudication off chain.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Smart-contract dispute resolution does not require an on-chain jury. It requires that the on-chain record meet existing evidentiary standards, so that off-chain forums can do what they already do well.
                </p>
            </section>

            {/* The split */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The argument
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Two activities, two layers, no conflation.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Settlement is on chain by nature: deterministic, automated, public. Adjudication is off chain by nature: contextual, discretionary, jurisdiction-specific. On-chain dispute-resolution designs that try to do both &mdash; juror-vote arbitration, DAO court, optimistic challenge windows &mdash; conflate the two activities and re-introduce the discretionary intermediary that smart contracts were supposed to remove.
                    </p>
                    <p>
                        Figaro&apos;s three-layer enforcement architecture treats this split explicitly. Layer 1 (bonding) and Layer 2 (peer coordination) handle the vast majority of disputes by preventing them. Layer 3 is the on-chain record itself: an evidentiary artifact that off-chain forums can already use.
                    </p>
                </div>
            </section>

            {/* Six properties */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Six evidentiary properties
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    What the on-chain record actually carries.
                </h2>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Time</span>
                        <span>Block timestamp on a finalized block. Set by consensus, not by either party.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Sign</span>
                        <span>Both parties sign the commitment via EIP-712 typed structured data. Tampering with any field invalidates the signature.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Hash</span>
                        <span>Order identifier is content-addressed. The same content always produces the same identifier; different content always produces different identifiers.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Hold</span>
                        <span>The record cannot be modified or deleted on a finalized block. A party seeking to repudiate cannot purge the chain.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Open</span>
                        <span>Anyone can read the chain and replay the verification. Disputing parties cannot disagree about what the record says &mdash; only about what it means, which is precisely the question adjudication is suited to.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Bind</span>
                        <span>The signed payload includes a content hash of the off-chain agreement. The on-chain record commits both parties to a specific document; the document itself can be anything &mdash; structured contract, free-text PDF, schema-typed JSON.</span>
                    </li>
                </ul>
            </section>

            {/* Legal fit */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Existing electronic-evidence law
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    The frameworks already exist.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">eIDAS (EU)</div>
                        <p>EIP-712 signatures meet the technical requirements for advanced electronic signatures (AdES). Block timestamps satisfy the technical requirements for qualified electronic time stamps. Practical effect: admissible electronic evidence, with weight a matter of contextual judicial assessment.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">UCC §1-201 / UETA / E-SIGN (US)</div>
                        <p>On-chain log entries satisfy the UCC definitions of &ldquo;record&rdquo; and &ldquo;signature.&rdquo; UETA and E-SIGN extend the same principle to contracts more broadly.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Singapore Electronic Transactions Act</div>
                        <p>Functional equivalents for &ldquo;writing,&rdquo; &ldquo;signature,&rdquo; and &ldquo;original.&rdquo; The 2021 amendments recognize electronic transferable records, particularly relevant for process trees in which the right to receive performance moves along the supply chain.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">UNCITRAL Model Law on Electronic Commerce</div>
                        <p>Adopted in over 80 jurisdictions. The functional-equivalence principle (accessibility, integrity, identifiability) is satisfied by on-chain commitments. The 2017 Model Law on Electronic Transferable Records extends the framework further.</p>
                    </div>
                </div>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    No jurisdiction we are aware of categorically excludes on-chain records from evidentiary consideration. What varies is the weight courts assign and the procedural authentication required &mdash; both are practice questions, not admissibility ones.
                </p>
            </section>

            {/* Why not on-chain juries */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The structural objection
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Why not on-chain juries.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Token-weighted juries (Kleros), DAO-governed arbitration (Aragon Court), and optimistic challenge windows all import a third-party decision-maker into the resolution path. The mechanism analysis treats this as a security failure: any third party whose incentives are not constrained by the bond structure breaks the kernel&apos;s self-enforcing property.
                    </p>
                    <p>
                        Off-chain adjudication has the opposite structure. The forum&apos;s incentives are constrained by its institutional context &mdash; judges face appellate review, arbitrators face institutional reputation, both face professional sanction. The forum is not unbonded in the kernel sense; it operates inside a different bond structure (its institutional authority).
                    </p>
                    <p>
                        The protocol does not re-implement that institutional authority. It provides input to it.
                    </p>
                </div>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                            Read the paper
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The full legal argument, including jurisdictional analysis and the structural case against on-chain adjudication, is developed in the law &amp; evidence paper.
                        </p>
                        <p className="mt-3 text-xs text-gray-500">
                            This page does not constitute legal advice. Practitioners should obtain jurisdiction-specific counsel.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-legal.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (E) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-gray-500">
                    <p>
                        Related:&nbsp;
                        <Link href="/evidence-display" className="underline hover:text-black transition-colors">
                            view a rendered evidence record
                        </Link>
                        &nbsp;or open the&nbsp;
                        <Link href="/research" className="underline hover:text-black transition-colors">
                            research index
                        </Link>
                        &nbsp;for the full paper portfolio.
                    </p>
                </div>
            </section>

        </>
    );
}

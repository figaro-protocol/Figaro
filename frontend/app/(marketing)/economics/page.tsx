import Link from "next/link";

export default function Economics() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Institutional economics
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    The firm becomes one pattern among many.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Coase argued that firms exist because market transaction costs sometimes exceed hierarchical management costs. When enforcement is priced at a fixed capital lockup, the firm&apos;s privileged position &mdash; as the default container for productive coordination &mdash; is no longer uniquely efficient. What changes is not the firm&apos;s existence; it is the firm&apos;s status.
                </p>
            </section>

            {/* Threshold */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The Coasean threshold
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Three transaction costs, one decisive variable.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Search</div>
                        <p>Public on-chain signals (settlement history, accepted-token lists, attested capabilities) allow autonomous discovery. Search cost approaches zero, and crucially the search index is non-proprietary.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Negotiation</div>
                        <p>Off-chain commitment building lets parties iterate on terms without gas costs. The substantive change is that the counterparty space is no longer mediated by a platform&apos;s terms of service.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Enforcement &mdash; the decisive variable</div>
                        <p>Historically: courts (slow, jurisdiction-dependent), arbitrators (trusted third parties), or standing intermediaries that internalize coordination and charge for it. The primitive prices enforcement at exactly 2&times; the transaction value &mdash; fixed, predictable, jurisdiction-independent, and requiring no third party.</p>
                    </div>
                </div>
                <div className="mt-8 border border-gray-200 rounded-lg p-6 bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">Proposition (Coasean Threshold Shift)</p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                        For any transaction where 2P (the capital lockup cost) is less than the firm&apos;s coordination overhead for the same transaction, the rational organizational choice is market exchange via the primitive rather than hierarchical integration.
                    </p>
                </div>
                <p className="mt-6 text-xs text-gray-500 leading-relaxed">
                    Comparative statics, not a sweeping institutional prediction. Non-empty class (most retail-scale transactions), bounded class (very-high-frequency, very-long-duration transactions do not). The threshold is now defined by capital opportunity cost rather than by the cost of standing institutional infrastructure.
                </p>
            </section>

            {/* Subordination */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What actually shifts
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Subordination was load-bearing. Now it isn&apos;t.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        The firm has always been a coordination mechanism. What distinguishes the modern corporate firm from older coordination forms &mdash; partnerships, guilds, cooperatives, market exchange &mdash; is not the coordination function itself but a particular overlay placed on top of it: <strong>subordination</strong>. The allocation of labor and productive assets under an ownership nucleus; the transfer of residual output rights and residual control rights to that nucleus in exchange for a wage.
                    </p>
                    <p>
                        In Coase&apos;s analysis, subordination is not incidental; it is load-bearing. Prior to the settlement primitive, enforcement between non-subordinated counterparties was costly, and aggregation under an ownership nucleus that resolved enforcement internally through managerial authority was the institutional response.
                    </p>
                    <p>
                        When bilateral enforcement is priced at a fixed capital lockup, the subordination overlay loses its cost advantage in the region defined by the threshold proposition. What is left behind is coordination without subordination &mdash; the same productive assets, the same coordination requirements, but without the ownership aggregation that historically secured them.
                    </p>
                </div>
            </section>

            {/* Space of patterns */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What emerges
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    A space of patterns, not a new kind of firm.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    Where subordination is no longer load-bearing, the firm becomes one organizational pattern among several. The organizational space admits multiple viable coordination patterns that were previously suppressed by the enforcement-cost structure:
                </p>
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-3">
                        <span className="text-black mt-0.5">&mdash;</span>
                        <span><strong>Transaction-scoped assemblies</strong> that form around a process and dissolve at settlement.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-black mt-0.5">&mdash;</span>
                        <span><strong>Standing treasury communities</strong> whose members recurrently participate in compatible process trees.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-black mt-0.5">&mdash;</span>
                        <span><strong>Peer networks</strong> of independent bonded counterparties without a common treasury.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-black mt-0.5">&mdash;</span>
                        <span><strong>Agent coalitions</strong> mixing human, software, and machine participants on identical terms.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="text-black mt-0.5">&mdash;</span>
                        <span><strong>The firm</strong> &mdash; continues to exist, now sharing the space with the forms above rather than occupying it alone.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    Which form dominates for a given industry is an empirical question about the threshold parameters and about the non-coordination functions (capital aggregation, risk pooling, legal personhood) that the primitive does not itself address.
                </p>
            </section>

            {/* Three concrete implications */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Three concrete implications
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    What the wallet means.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">(a) The wallet is the unit of coordination</div>
                        <p>Each productive asset is represented directly by a wallet address, which can hold content-addressed credentials &mdash; NFT-anchored deeds, attested capabilities, operator profiles &mdash; that certify the asset&apos;s identity and performance history. In the firm model, the cook&apos;s skill, the kitchen&apos;s equipment, the courier&apos;s vehicle are subsumed under the firm&apos;s legal identity. In the wallet model, each asset is its own coordination endpoint. The productive asset <em>is</em> the identity.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">(b) Tokens replace stock</div>
                        <p>Participants in the shifted region do not receive shares in a firm; they hold tokens denominated by the communities with which they coordinate. Token holdings signal community affiliation and participation-history, not residual-output ownership in a centralized nucleus. Tokens are borderless, community-defined rather than jurisdiction-issued, and the community&apos;s definition is itself an open parameter.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">(c) Actor type is neutral</div>
                        <p>Nothing in the coordination layer distinguishes an AI capable of bearing capital risk from a human capable of the same risk. A person with a law degree and an AI trained on legal precedent compete on identical terms &mdash; each as a bonded counterparty whose capabilities are attested by on-chain credentials. Actor-type neutrality follows directly from the primitive&apos;s indifference to what sits behind a wallet.</p>
                    </div>
                </div>
            </section>

            {/* Property rights */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Property rights, relocated
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Residual control rights stay with the asset.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    The property-rights tradition (Grossman-Hart 1986; Hart-Moore 1990; Hart 1995) locates the firm boundary at the allocation of residual control rights over non-contractible decisions. The primitive does not abolish non-contractibility; it changes <em>where</em> residual control rights are allocated.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    In the firm model, those rights are allocated to the ownership nucleus. In the wallet model, they are allocated to whoever controls the wallet &mdash; which, under self-sovereign key management and NFT-anchored credentials, is the productive asset itself (or the individual operating it). Residual control rights do not disappear; they are held by the asset rather than aggregated under an ownership layer.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                    The property-rights logic still applies; the allocation question has a new answer, not a dissolved one.
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
                            The full institutional-economics argument, including engagement with Williamson&apos;s three drivers and the property-rights theory&apos;s treatment of residual control rights under wallet-layer allocation, is in the institutional-economics paper.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-economics.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (B1) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-gray-500">
                    <p>
                        Companion reading:&nbsp;
                        <Link href="/sovereign-commerce" className="underline hover:text-black transition-colors">
                            the political-economy argument
                        </Link>
                        &nbsp;treats the same shift in the register of critical theory and develops the substrate / paradigm-shift framing. Both can be read independently. Full set:&nbsp;
                        <Link href="/research" className="underline hover:text-black transition-colors">
                            research index
                        </Link>.
                    </p>
                </div>
            </section>

        </>
    );
}

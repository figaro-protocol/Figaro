import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "FIG design — Figaro Protocol",
    description: "FIG is a Schelling-point token for the Figaro ecosystem. Its value is focality — not utility, governance, or yield. 1B fixed cap, 10/30/60 allocation.",
};

export default function FigDesign() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    A Schelling-point token for the Figaro ecosystem.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl">
                    FIG is a focal coordination anchor in the sense of Thomas Schelling &mdash; the token Figaro-aligned participants converge on without central authority. Its value is focality, not utility, governance, or yield. Every other design choice follows from that.
                </p>
            </section>

            {/* The lineage */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Same pattern, new layer.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <p>
                        <strong>Satoshi Nakamoto (2008)</strong> took money out of institutions and made it a protocol. Bitcoin became the Schelling point at the money layer &mdash; a bearer asset around which participants converge because its design makes convergence credible: fixed supply, issuer-less, peer-to-peer.
                    </p>
                    <p>
                        <strong>Vitalik Buterin (2014)</strong> made contracts composable and put ETH at the focal point of programmable settlement.
                    </p>
                    <p>
                        <strong>Figaro (2026)</strong> extends the pattern one layer further: institutions themselves become composable from bonded commitments between self-sovereign counterparties. FIG is the focal point for participants who coordinate around that composition.
                    </p>
                    <p className="text-ink-muted">
                        The pattern is the same at each layer: a native token whose value derives from focality rather than from utility or rights, sustained by a cohort of participants who recognize it as the coordination anchor of its ecosystem.
                    </p>
                </div>
            </section>

            {/* Schelling-point design category */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Held by choice, not by financial argument.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <p>
                        A Schelling point (Schelling 1960) is a solution that parties converge on without explicit coordination, because some feature makes it the natural focal choice. In coordination games with many equilibria, focality selects one. In crypto: Bitcoin is the focal digital bearer asset for a peer-to-peer monetary intent; Ether is the focal settlement unit for programmable contracts.
                    </p>
                    <p>
                        A Schelling-point token is distinct from a utility token (valued for services it purchases), a governance token (valued for votes it conveys), or a yield-bearing token (valued for cash flow it represents). Its value is <em>coordination</em>: holding it signals alignment with a specific ecosystem, and the shared holding among aligned participants constitutes the coordination itself.
                    </p>
                    <p>
                        Pure Schelling-point tokens are rare because most designs add utility or governance to create additional demand drivers. Each such addition introduces holders whose reason for holding is <em>not</em> focal alignment &mdash; governance speculators, yield farmers, utility arbitrageurs &mdash; and their presence dilutes the signal. Bitcoin&apos;s focality has survived partly because Bitcoin has refused to add features beyond the base-layer payment rail. Each refused feature protects the signal&apos;s purity.
                    </p>
                </div>
            </section>

            {/* What underpins FIG */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Trade. Value-added.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    A Schelling-point token requires focal convergence, but focal convergence coordinates <em>which</em> token participants pick &mdash; it does not by itself create value. Each token in the lineage has a distinct economic underpinning at a distinct layer of the economic stack.
                </p>
                <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm text-left">
                        <thead className="font-semibold text-ink-heading border-b border-default">
                            <tr>
                                <th className="py-2 pr-4">Token</th>
                                <th className="py-2 pr-4">Underpinning</th>
                                <th className="py-2">Economic layer</th>
                            </tr>
                        </thead>
                        <tbody className="text-ink-body">
                            <tr className="border-b border-default">
                                <td className="py-3 pr-4 font-semibold">Bitcoin</td>
                                <td className="py-3 pr-4">PoW cost of production</td>
                                <td className="py-3">Factor inputs (energy, hardware)</td>
                            </tr>
                            <tr className="border-b border-default">
                                <td className="py-3 pr-4 font-semibold">Ethereum</td>
                                <td className="py-3 pr-4">Gas demand for block space</td>
                                <td className="py-3">Transaction utility</td>
                            </tr>
                            <tr>
                                <td className="py-3 pr-4 font-semibold">FIG</td>
                                <td className="py-3 pr-4"><strong>Trade / value-added</strong></td>
                                <td className="py-3"><strong>Exchange between counterparties</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <p>
                        Every bonded commitment in the Figaro ecosystem is a real transfer of value &mdash; goods for payment, services for payment, coordination for payment. The aggregate volume and quality of these transfers is the economic content of the ecosystem. FIG is the token denomination of alignment with the value-adding activity that produces them.
                    </p>
                    <p>
                        This places FIG not at a weaker position in the lineage than its predecessors but at a different one, attached to a different primary economic quantity. In classical economics: Bitcoin is underpinned by <em>factor cost</em>; Ethereum by <em>transaction utility</em>; FIG by <em>value-added</em>. The three answers sit at three different points in the economic chain. FIG&apos;s is the most proximate to end-value creation &mdash; because trade is where economic value is actually created.
                    </p>
                    <p className="text-ink-muted">
                        Consequence: FIG&apos;s value is fully endogenous to Figaro&apos;s trade activity. If little trade flows through the ecosystem, FIG is correspondingly worth little; if substantial trade flows, FIG&apos;s value rises with it. This coupling is direct and on-chain visible &mdash; anyone can read the ledger and see the volume of bonded commitments. That legibility is the right relation between a coordination token and the activity it coordinates: the token is worth the trade it identifies aligned participants in, and no more.
                    </p>
                </div>
            </section>

            {/* Why FIG */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    General-purpose tokens can&apos;t carry the signal.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <p>
                        The Figaro kernel is token-agnostic. Any ERC-20 can serve as the bond and payment currency. But general-purpose tokens (USDC, ETH, BTC) signal many things: legal-system alignment, programmable-settlement alignment, monetary store-of-value intent. None of them signal <em>Figaro-ecosystem alignment specifically</em>.
                    </p>
                    <p>
                        A focal-point token that signals Figaro alignment and nothing else provides a coordination instrument the ecosystem doesn&apos;t otherwise have. It&apos;s useful in two settings: <strong>finding aligned counterparties</strong> (searching for Figaro-native participants by FIG holding is cheaper than searching by settlement history) and <strong>signaling alignment in contested contexts</strong> (a founder accepting FIG instead of USDC signals more than a founder accepting USDC).
                    </p>
                    <p className="text-ink-muted">
                        These uses are modest. We don&apos;t claim FIG is indispensable or that the ecosystem fails without it. We claim only that a focal-point token has a coordination function unavailable to general-purpose tokens, and that a cohort of participants will find it useful.
                    </p>
                </div>
            </section>

            {/* Design rules */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    What a focal-point token can&apos;t afford.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Supporting focal-point emergence is not the same as manufacturing it. A designer can&apos;t declare a token is a Schelling point; focality emerges from convergence. What the designer <em>can</em> do is remove features that make convergence implausible and add features that make it stable.
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-16 shrink-0">Pure</span>
                        <span><strong>Pure signaling.</strong> The token must carry one unambiguous reason to hold it. Holders should be alignment-signalers &mdash; not yield-chasers, governance-speculators, utility-arbitrageurs, fee-path-optimizers.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-16 shrink-0">Pred</span>
                        <span><strong>Predictable supply.</strong> Focality is fragile under surprise inflation. Supply schedule committed at deploy, unmodifiable thereafter.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-16 shrink-0">Clean</span>
                        <span><strong>Clean distribution.</strong> Concentrated ownership makes Schelling convergence less credible. We&apos;re honest about the 40% founder+DAO share and address it in the attack-surface section below.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-16 shrink-0">Decouple</span>
                        <span><strong>Absence of protocol-activity coupling.</strong> If supply is a function of protocol activity, holders acquire the token by doing things that are not alignment. The signal is muddied by dual-motivation holders.</span>
                    </li>
                </ul>
            </section>

            {/* Supply integrity */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    1B fixed cap, two-tier enforcement, one-way latch.
                </h2>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0">Per-mint</span>
                        <span><code>mint</code> reverts with <code>SupplyCapExceeded</code> if <code>totalSupply() + amount &gt; MAX_SUPPLY</code>. Atomic, non-reentrant.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0">Pre-reg</span>
                        <span><code>registerMinter</code> reverts if <code>totalRegisteredCap + cap &gt; MAX_SUPPLY</code>. Full allocation plan is bound to the 1B ceiling before any token is minted.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0">Renounce</span>
                        <span>One-way Boolean latch. Once set by deployer, no further minters can be registered. Set as the final action of the deploy transaction.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    After deploy: <code>totalRegisteredCap = 1B</code> exactly. No path exists to register additional minters. Supply is frozen by a single transaction, and the contract has no further &ldquo;governance moments&rdquo; available to anyone.
                </p>
            </section>

            {/* Allocation */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    10 / 30 / 60.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <div className="border border-default rounded-lg p-5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <strong>Founder &mdash; 10% (100M)</strong>
                            <span className="text-xs text-ink-muted">Genesis, no vesting</span>
                        </div>
                        <p>Non-vesting is deliberate: a vesting cliff is a tacit promise of schedule-driven holding, which is a reason to hold FIG other than alignment. The structural observation is that an unvested founder forgoes the vesting option; whether 10% is the right magnitude is a political-economy question outside this page.</p>
                    </div>
                    <div className="border border-default rounded-lg p-5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <strong>DAO &mdash; 30% (300M)</strong>
                            <span className="text-xs text-ink-muted">Genesis, no vesting</span>
                        </div>
                        <p>Coordination treasury for ecosystem activity (grants, public goods, reference implementations). We concede the objection that a liquid 30% treasury introduces policy-level coupling that partially dilutes focality; the defense is that policy-level coupling is attenuated by off-chain discretion and revocable grants, in a way that mechanism-level coupling (Euler emission) was not.</p>
                    </div>
                    <div className="border border-default rounded-lg p-5">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <strong>Airdrop &mdash; 60% (600M)</strong>
                            <span className="text-xs text-ink-muted">Three stages</span>
                        </div>
                        <p>Distributed via one staged-merkle airdrop contract with three immutable calendar unlocks: 300M at year 2, 200M at year 5, 100M at year 9. Front-loaded for bootstrap; declining tail rewards continued participation. Calendar-based (not activity-based) to preserve Rule 4.</p>
                    </div>
                </div>
            </section>

            {/* Exclusions */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Every &ldquo;not X&rdquo; removes a non-alignment holder class.
                </h2>
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The negatives are not restraint without purpose. Each exclusion removes a class of holder whose presence would dilute the signal:
                </p>
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>Not a governance token.</strong> Removes governance speculators.</li>
                    <li><strong>Not yield-bearing.</strong> Removes yield farmers.</li>
                    <li><strong>Not a fee path.</strong> Removes utility arbitrageurs.</li>
                    <li><strong>Not bond collateral for the kernel.</strong> Removes collateral demand that distorts price discovery.</li>
                    <li><strong>Not founder-vested.</strong> Removes schedule-driven holders.</li>
                    <li><strong>Not settlement-emitted.</strong> Removes holders acquiring FIG by gaming an emission curve. This is the most rigorous exclusion and is why we rejected the earlier Euler-oscillation design (below).</li>
                    <li><strong>Not a coordinator-pattern extension.</strong> FIG and the kernel are siblings, not a composition. FIG has no kernel interaction at all.</li>
                </ul>
            </section>

            {/* Rejected: Euler */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Activity-coupled emission destroys focality.
                </h2>
                <div className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <p>
                        An earlier iteration included a settlement-anchored emission: a cosine-modulated halving curve with seller-only payout at resolution. Three properties motivated it: persistent bootstrap subsidy, partial wash-trade resistance, seasonal coordination.
                    </p>
                    <p>
                        The rejection reason, under the Schelling frame, is sharper than the prior technical reasons: <strong>activity-coupled emission mixes two holder populations in the FIG distribution</strong> &mdash; holders-by-alignment and holders-because-the-Euler-function-paid-them. A third party looking at FIG holdings cannot read focal alignment from the distribution because the distribution is dual-origin. Focality requires that the token mean one thing; activity coupling makes it mean two.
                    </p>
                    <p>
                        The wash-trade analysis and the reflexivity argument are secondary. The primary reason to reject Euler is that it violates the fundamental Schelling-point design rule: one unambiguous reason to hold.
                    </p>
                </div>
            </section>

            {/* Attack surface */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Three ways FIG can lose focal status.
                </h2>
                <div className="space-y-6 text-sm text-ink-body leading-relaxed">
                    <p>
                        <strong>Focal-shift attack.</strong> An adversary tries to move focal convergence to a different token. Canonical example: the Bitcoin-Cash / Bitcoin-SV campaigns against Bitcoin&apos;s SoV status. Defense: Schelling stickiness &mdash; participants who have converged typically hold through the attempt, because moving costs coordination value.
                    </p>
                    <p>
                        <strong>Dump attack.</strong> An adversary with large holdings dumps to destabilize price. In the Schelling-point frame this is <em>less damaging</em> than in a yield-anchored frame: holders are holders by alignment choice, not by financial hedging, and a price crash that leaves alignment unchanged does not necessarily destroy the focal point. What destroys it is coordinated loss of participant alignment, not a price crash.
                    </p>
                    <p>
                        <strong>Acquiescence attack.</strong> The quietest attack: no attack at all. Nobody converges, and FIG fails to become a focal point. Defense is limited &mdash; we can support emergence but can&apos;t force it. If no cohort recognizes FIG as focal, the token has no Schelling-point value; the supply-integrity and allocation properties still hold but the signaling function fails.
                    </p>
                </div>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    Schelling-point design is a matter of supporting emergence, not causing it. We document the design so those who choose to converge can do so legibly, and those who don&apos;t can see what they are declining.
                </p>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-default pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-sm text-ink-body leading-relaxed">
                            The full cryptoeconomic argument, with Schelling (1960) and the Bitcoin/ETH lineage developed formally, and the verification surface (TLA⁺ FigToken / Halmos airdrop / Certora 9 rules), is in the cryptoeconomics paper.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-fig-token.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-ink-heading text-paper text-sm font-semibold rounded-lg hover:bg-ink-primary transition-colors"
                    >
                        Download paper (D) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-ink-muted">
                    <p>
                        For wallet view, balance, and claim:&nbsp;
                        <Link href="/fig" className="underline transition-colors">
                            the FIG page
                        </Link>. Full paper portfolio:&nbsp;
                        <Link href="/cryptoeconomics" className="underline transition-colors">
                            cryptoeconomics index
                        </Link>.
                    </p>
                </div>
            </section>

        </>
    );
}

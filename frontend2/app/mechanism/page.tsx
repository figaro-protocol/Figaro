import type { Metadata } from "next";
import Link from "next/link";
import { BondingDiagram } from "@/components/shared/BondingDiagram";

export const metadata: Metadata = {
    title: "Mechanism — Figaro Protocol",
    description: "Paper A. The game-theoretic derivation of self-enforcing agreements between strangers. Asymmetric bonding, 2× ratio, progressive collateralization, and the six protocol properties.",
};

export default function Mechanism() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <div className="flex items-baseline gap-3 mb-4 flex-wrap">
                    <span className="font-mono text-sm text-gray-500">Paper A</span>
                    <span className="text-xs text-gray-500">·</span>
                    <span className="text-xs text-gray-500">Mechanism design · game theory</span>
                </div>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    The mechanism.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    The substrate every other paper assumes. Self-enforcing agreements between strangers, derived from one mechanism — asymmetric bonding — which scales itself from two parties to N-party process trees and carries the Nash equilibrium at every edge.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">The property</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Two people who have never met can make a deal, and both will keep it — not because they trust each other, not because a judge is watching, but because breaking the deal costs more than keeping it. Always. Automatically.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    This is the property Figaro creates. Everything else — the composition, the evidence, the token — follows from it.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">How it works</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Both parties put down a deposit. The buyer deposits 2× the payment. The seller deposits 2× the value they deliver. If both perform, both get their deposits back and the seller earns the payment. If either cheats, both lose their deposits.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    A cheating buyer keeps the goods but forfeits a deposit worth twice the goods. Net loss. A cheating seller keeps nothing and forfeits a deposit worth twice their obligation. Worse loss. Neither party benefits from defecting, regardless of what the other does.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-6">
                    This is a Nash equilibrium. The only rational move is to cooperate. No arbitrator decides the outcome. No timeout releases the funds. No one needs to trust anyone. The locked capital <em>is</em> the enforcement.
                </p>
                <BondingDiagram />
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Why 2×</h2>
                <p className="text-base text-gray-700 leading-relaxed">
                    At 1×, a cheating seller breaks even. At 2×, cheating always costs more than the maximum possible gain. 2× is the minimum amount that makes every form of defection irrational. A higher ratio is capital-inefficient; a lower ratio breaks the Nash property.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Composition</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Real commerce is not one buyer and one seller. It is a tree of contributors: a cook, a kitchen operator, an ingredient sourcer, a courier, a vehicle owner. Each one makes a separate self-enforcing agreement within the same process.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Each contributor deposits against the full <em>cumulative</em> value of everything upstream — not just their own slice. A courier delivering a $10 meal deposits against the $12 cumulative value (meal + delivery), not against $2. If the courier fails, the cook also loses their deposit — because the buyer cannot approve a half-complete process.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    This creates the micro-lending circle effect: everyone in the tree is accountable for everyone else. Coordination emerges from self-interest, not management. The buyer resolves once. The entire tree settles in a single transaction.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">The mechanism: asymmetric bonding</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Asymmetric bonding is the kernel&apos;s core mechanism and the source of the Nash equilibrium. The buyer bonds 2&times; the payment. The seller bonds 2&times; the cumulative value delivered. With these bonds locked, cooperation weakly dominates defection for both parties, and the cooperative profile is the unique survivor of iterated elimination of weakly dominated strategies.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The 2&times; multiplier is not a design parameter — it&apos;s the minimum integer multiplier that yields weak dominance of cooperation for both players. At 1&times;, the buyer is indifferent between cooperating and defecting once the seller has delivered; the mechanism provides no incentive to resolve. At 2&times;, cooperation strictly dominates. Higher multipliers preserve the dominance but lock more capital without improving the equilibrium.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">How the mechanism scales to N parties</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The same mechanism that secures two parties scales to arbitrary-depth process trees through <strong>progressive collateralization</strong>: each seller bonds against the <em>cumulative</em> upstream value, not just their own slice. A courier carrying a $10 meal bonds against the $12 total (meal + delivery), not against $2. Scaling the seller bond with cumulative value creates a mesh of independently secured edges, and cooperation remains weakly dominant at every position in the tree, with the dominance margin growing with chain depth.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The risk-to-reward ratio for the <em>i</em>-th seller is ρᵢ = 2Gᵢ / Pᵢ — deeper positions face amplified exposure. In the courier example: 12.0 for the courier versus 2.0 for the cook. That amplification is what propagates coordination pressure through the mesh and gives the N-party result its strength.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Rules that compose with the scaled mesh</h2>
                <p className="text-sm text-gray-600 mb-6">
                    Asymmetric bonding carries the Nash equilibrium at every edge. Two rules compose with the already-scaled mesh to handle the things asymmetric bonding alone doesn&apos;t: multi-party resolution and peer-enforcement dynamics.
                </p>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Buyer dominance (resolution rule)</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Only the buyer can trigger <code>resolveProcess</code>. What it does: takes advantage of the mesh structure to make multi-party coordination resolvable from a single signature. Without this rule, an N-party resolution would require the mutual agreement of all N parties, which cannot be aggregated cleanly in the general case. Buyer dominance replaces that aggregation with a single authorized caller.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Atomic resolution (settlement rule)</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">The whole process tree settles in one transaction, or none of it does. Combined with asymmetric bonding, this induces a weakest-link subgame among sellers: one defection collapses every seller&apos;s payoff to the non-cooperative level, so each seller has direct economic interest in every other seller&apos;s cooperation. Peer enforcement emerges without explicit communication.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">No escape hatches (security constraint)</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">No owner, no admin, no pause, no timeout, no unilateral exit from the bonded state. Every additional exit path weakens the Nash equilibrium: no timeout duration and no recovery fraction α &gt; 0 can be added without weakening the buyer&apos;s incentive to cooperate.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">The microfinance reduction</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The weakest-link subgame that asymmetric bonding + atomic resolution induce among sellers is the mechanism analog of Grameen-style joint-liability group lending. Figaro reproduces the cooperation-pressure equilibrium of the microfinance literature under strictly weaker assumptions: no repeated interaction, no local information among sellers, no punishment technology exogenous to the contract, no joint-liability contracting. The settlement layer replaces the social substrate.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Peer enforcement arrives at Figaro&apos;s coordination layer without any trace of a reputation system, a social graph, or repeated-game machinery. The buyer dominance and atomic resolution rules implement the mechanism design of group lending at a kernel granularity.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The practical consequence is a residual dispute rate in the same regime as Grameen&apos;s: joint-liability circles historically drop default rates from roughly 20% to roughly 2%. Figaro&apos;s peer-enforced mesh inherits that regime as the theoretical upper bound on disputes escaping economic and social enforcement. The residual is what off-chain forums — Kleros, courts, arbitrators — are composed in to absorb.
                </p>
                <p className="text-sm text-gray-600 mt-4">
                    What is not reproduced: peer selection under private type information — that requires a type-screening mechanism outside the bonded kernel (attested credentials, operator registries, or equivalent).
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Immutable evidence</h2>
                <p className="text-base text-gray-700 leading-relaxed">
                    Every lifecycle event is an on-chain attestation bound to the signed agreement via a merkle inclusion proof. Evidence is a side effect of using the protocol, not a separate feature. This follows from the network&apos;s tamper-evident log plus the attestation coordinator&apos;s proof-verification at the on-chain composition layer — not from the kernel itself.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Token-agnostic</h2>
                <p className="text-base text-gray-700 leading-relaxed">
                    Figaro works with any ERC-20 token. You can bond in stablecoins, ETH wrappings, or community currencies. Within a single process, the bond currency is monotoken by design — this is what makes the 2× ratio Nash-stable from chain state alone, without an oracle or DEX. Cross-currency coordination is achieved through composition, not through protocol-level currency conversion.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Further
                </h2>
                <ul className="space-y-3 text-sm">
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/paper/figaro3a.pdf" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            Paper A (PDF) &rarr;
                        </a>
                    </li>
                    <li>
                        <Link href="/about#enforcement" className="text-black hover:underline">
                            The three enforcement layers (economic, social, legal) &rarr;
                        </Link>
                    </li>
                    <li>
                        <Link href="/spec" className="text-black hover:underline">
                            Specifications &mdash; the contracts that implement these properties &rarr;
                        </Link>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/DESIGN_DECISIONS.md" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            Design decisions &mdash; 11 patterns that look like vulnerabilities but are correct by design &rarr;
                        </a>
                    </li>
                </ul>
            </section>
        </>
    );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Why — Figaro Protocol",
    description:
        "Three eras of rule-making — coercion, cognition, crypto. What changes when economic rules become common knowledge enforced by mathematics, and what Figaro contributes.",
};

export default function Why() {
    return (
        <>
            <MarketingHero
                title="Three eras of rule-making."
                lead={
                    <>
                        Coercion. Cognition. Crypto. Each is a way humans give rules legitimacy. The first two are ancient, sophisticated, and persistent. The third is new &mdash; and brings something the first two could not: clarity, anchored in mathematics and deterministic computing. Figaro is what cryptoeconomics looks like when it is applied to trade. This is Figaro read as history: how it arrives, not what it is.
                    </>
                }
            />

            <MarketingSection title="Coercion.">
                <p className="text-base text-ink-body leading-relaxed">
                    The oldest answer to who governs is force &mdash; <em>might makes right</em>. Force can compel an action, but it cannot by itself make the rule legitimate in the mind of the person it binds. Force without legitimacy is unstable; the ruled have always found ways to refuse it.
                </p>
            </MarketingSection>

            <MarketingSection title="Cognition.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A rule has to do two things at once: constrain the actions of a community&apos;s members, and stay legitimate in the minds of all of them as it does. Force is good at the first and poor at the second. So societies developed a second apparatus to carry the legitimacy &mdash; shared mental models. Environmental knowledge, mythology, oral tradition, eventually written law. The apparatus has grown sophisticated as societies have scaled &mdash; administrative law, contracts, treaties, regulatory regimes &mdash; but the underlying mechanism is the one antiquity used. Legitimacy by belief, sustained by institutions trusted to carry the belief.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Both coercion and cognition remain with us. Both can be captured by interests &mdash; at best collaboratively, at worst as instruments turned against the ruled. Sophisticated institutions can carry sophisticated capture.
                </p>
            </MarketingSection>

            <MarketingSection title="Crypto.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Bitcoin introduced a third way to make rules. Encode them in a deterministic program. Publish the rules that cannot be encoded. Attach a token denominated in the economic value of the resource the program secures. The result is a substrate whose rules are common knowledge by construction and enforced by mathematics, not by any institution.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Layer-one networks furnish measurable guarantees on which further economic systems can be built.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Crypto does not substitute for coercion or cognition. They persist. What crypto adds is <em>clarity</em>: a rule set that cannot be quietly captured because it cannot be quietly changed.
                </p>
            </MarketingSection>

            <MarketingSection title="Figaro is cryptoeconomics for trade.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Most of what runs on crypto today is one of two things: traditional financial products ported to a new venue, or grifters exploiting the same social engineering that underlies adoption. Figaro is neither. It is cryptoeconomics applied to value-added processes &mdash; trade.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A third strain ports the institutional apparatus directly: on-chain governance projects that recreate corporate or legislative voting on crypto rails, legal-engineering toolchains that lift written contracts onto chain. The cognitive era&apos;s instruments, running on a new substrate. Figaro is not that either.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    As a primitive, Figaro is the substrate for any economic system grounded in value-added. Supply chains. Manufacturing &mdash; physical or digital. Internal corporate processes. The substrate takes no position on where value flows or under what conditions; the participants in each process decide.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    From here the ground turns from the everyday deal to the theory beneath it. If you would rather see the same mechanism walked through as one evening&apos;s dinner, that lived version is at <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">local commerce</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    There is a deeper point in that neutrality. Everyday life has no ready category for money that is neither spent nor invested &mdash; yet that missing third category sits at the heart of every economic system, and each system answers it differently. The kernel answers for none of them. The graph tier above it can express any of them &mdash; a market arrangement, a cooperative one, mutual aid, and others still. And because every process is transparent and every participant self-sovereign, free to choose what they join and which token carries it, people can fuse elements of different traditions by their own preference, one deal at a time, without a polity choosing for them. The &ldquo;-isms&rdquo; stop being package deals.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Above the kernel: clauses carrying the terms and conditions that recur across processes, tailored where a designer fills in the particulars &mdash; an attached consent document, a pinned settlement token &mdash; that would otherwise sit in a written contract. A clause is one reusable rule &mdash; say, &ldquo;food arrives hot&rdquo;; an assembly is a ready-made recipe of clauses for a whole kind of deal &mdash; say, &ldquo;meal delivery.&rdquo; Clauses compose into processes &mdash; what the protocol calls assemblies. Sellers index processes freely; buyers negotiate the terms directly, with no intermediary in the path.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Traditional negotiation rests on a belief &mdash; that the counterparties are acting in good faith. The assumption belongs to the cognitive era; it holds when the institutions ready to enforce it remain trusted, and weakens when they do not.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Figaro does not assume good faith. It asks each party to demonstrate it, directly, by posting a bond against the commitment they are making &mdash; putting money where the mouth is. The kitchen that accepts your dinner order stakes more than the meal is worth; so do you. Neither of you has to believe anything about the other. Posting the bond is the parties&apos; act of subscribing to the mechanism&apos;s rules. Like any deterministic system, the outcome follows from the rules themselves &mdash; not from anyone&apos;s goodwill or discretion. The bond is not an expenditure in the traditional sense. It replaces the pre-existing requirement for lawyers, accountants, or a legal entity to wrap the relationship and underwrite the assumption.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    So the good faith that traditional trade must presume, Figaro instead produces. It is never the input to the deal; it is the output of the bonds. Once both sides have bonded, each can proceed as if the other will follow through &mdash; no monitoring, no chasing, no extending the benefit of the doubt, and nothing to act on unless a genuine dispute arises &mdash; because walking away has become the losing move for whoever would try it. Good faith is not something either party brings to the table; it is what the two bonds leave standing. That is the shift in a line: &ldquo;trust me&rdquo; becomes &ldquo;you don&apos;t need to trust me.&rdquo;
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Buyer dominance and atomic settlement compact, into a single call, the value-added work that a legal entity used to hold and meter. When the process is token-bound, the value of the assembled work accrues to the token, not to a share price. The token recenters as defining a community of users &mdash; not a substitute for ordinary money. The denominations in a wallet reflect its owner&apos;s communities and values. The kernel takes no position on which token; any ERC20 &mdash; the common standard for tokens on Ethereum &mdash; the community already uses can carry the trade.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Each wallet represents something real &mdash; a kitchen, a vehicle, a person&apos;s labour, a public service &mdash; and it sustains its participation the way a business does under going-concern, or the way a node sustains a blockchain. This is where the whole arrangement comes to rest. Receipts from on-chain participation have to cover the asset&apos;s off-chain operating expenses over time; when they stop covering them, the seller stops bonding the wallet into processes and it drops out of the market it served. So the resting point is not some grand redistribution but something plainer and more durable: each asset earns whatever it needs to keep taking part, and no more &mdash; in other words, a productive life. The kernel does not enforce this. The market does, through ordinary rational exit.
                </p>
            </MarketingSection>

            <MarketingSection title="The whole picture, one step deeper.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What follows gathers everything above into a single pass, and it climbs one step deeper than the rest of this page &mdash; nothing else here depends on it, so if the earlier sections were enough, this is a bonus. Begin with the wallet. Every wallet stands for a real asset &mdash; the sections above gave the examples &mdash; put to work in value-added processes. That is the whole of what a participant ever is: an asset, adding value to others.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What that asset actually does is set by the assemblies it subscribes to. An assembly is the ready-made recipe of clauses described earlier; subscribing to one is how a wallet joins the processes that recipe lays out. Choose your assemblies and you have chosen the processes you take part in.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Because an assembly is nothing but clauses composed, it is also a public contract &mdash; usable anywhere in the world, by anyone &mdash; and as it runs it produces the fiscal, legal, and regulatory records a process leaves behind, shaped to satisfy the requirements in force today and the ones not yet written. Those records stay self-sovereign: the wallet holds its own trail, no institution holds it on the wallet&apos;s behalf. The protocol reaches this by composing with other public contracts on the same network. Arriving at a commitment, a buyer holding any token can swap into the token a process settles in, in the same call &mdash; which is the whole reason the swap exists. And once receipts land, a wallet can split them onward through a composed batch-disperser &mdash; an ownerless public contract at the same address on every chain &mdash; to the parties it owes; the self-sovereign fiscal trail falls out as a by-product. There are two sides to what a process leaves behind. One side is public &mdash; the events, the anchored hashes, the registries, the map of who coordinated with whom &mdash; and it accumulates into a shared record that belongs to everyone, free to read, growing a little with every process that settles. The other side is private: the agreement&apos;s content, the evidence behind a hash, the books a wallet keeps &mdash; and that side the protocol never holds, so it has nothing to sell, while the wallet holds all of it and discloses it only when it chooses. Because letting another party in to that private record is itself a trade, an owner who opens its own books does so the same bonded way as any other sale, on its own terms &mdash; the reverse of an institution profiting from the records of the people it serves.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Put the kernel&apos;s mechanism together with the coordination and attestation clauses and the effect is to push the coordination work that firms and institutions once held internally &mdash; the overseeing, the reconciling, the enforcing &mdash; out to the edges, onto the bonded processes themselves. When the coordination overhead moves to the edge, the value that used to pay for it moves with it: value capture that once collected at the top, in the seat between buyer and seller, reallocates downward, to the assets doing the work. This is the part prospective participants tend to like most.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    As the token paragraph above put it, the value of the assembled work accrues to the token, not to a share price. Here is the fuller shape: tokens sort into two kinds &mdash; social tokens that mark the communities a wallet belongs to, and the moated tokens particular assemblies settle in &mdash; and what gives either kind its meaning is the value-added work moving between them. The processes themselves are the constant currency the tokens are valued in. Put plainly, shares become tokens: a claim on an entity&apos;s future becomes a denomination earned by taking part.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    And the whole reallocation does not run on to some final redistribution. It settles earlier, and lower: at whatever return each asset needs to keep taking part in value-added processes, and no more. That is the going-concern condition the section above closed on, read now as the resting point of the entire arc &mdash; not a redistribution, but a productive life.
                </p>
            </MarketingSection>

            <MarketingSection title="How Figaro grows.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A word on the florin first &mdash; Figaro&apos;s own token, one billion of them and never any more. You never need it to buy or sell anything: deals settle in whatever token the parties already use, and the kernel neither issues the florin nor asks for it. What it is for is the network&apos;s shared parts &mdash; the clauses and assemblies everyone reuses. The people who build those are paid in florins, which is how the commons gets funded with no company and no fee behind it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Figaro is built to be extended: anyone can author a new clause, register it on-chain, and &mdash; for the clauses the network comes to rely on &mdash; <Link href="/artifact-rewards" className="text-ink-heading font-medium hover:underline">be paid retroactively</Link> from the share of florins set aside for exactly that. No application, no committee.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Clauses are one composition surface. Assemblies are another &mdash; communities compose clauses into the processes they need, with the sellers who run them indexing those processes freely. The protocol grows by what it actually carries. <Link href="/builders" className="text-ink-heading font-medium hover:underline">More on building on Figaro</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="The second promise.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In March 2026 the Ethereum Foundation published its <a href="https://blog.ethereum.org/2026/03/13/ef-mandate" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Mandate</a> &mdash; part constitution, part guide, recorded on the chain it describes. It names two promises. The first: to enable self-sovereignty by being &ldquo;humanity&apos;s common computational substrate that anyone can interact with trustlessly, permissionlessly, and persistently.&rdquo; The second, built on the first: &ldquo;allowing the infrastructures of self-sovereign coordination to arise and thrive in any form imaginable and expressible &mdash; unmolested, unimpeded, and undisturbed &mdash; without violating any individual&apos;s freedom.&rdquo; The Foundation measures its own success by how much &ldquo;sovereignty-preserving coordination at scale&rdquo; Ethereum resiliently enables &mdash; with or without the Foundation.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is an infrastructure of self-sovereign coordination &mdash; the second promise, applied to trade. Coordination without an enforcing institution: cooperation is the equilibrium the bonds construct, so no platform, administrator, or arbitrator sits inside the mechanism with final authority over settlement. The Mandate requires work &ldquo;architected to be maximally unstoppable and to function without incorporating centralized intermediaries or kill switches&rdquo;; the kernel has no admin, no owner, no pause &mdash; it passes the Mandate&apos;s walkaway test by construction. And where the Mandate refuses &ldquo;private capture or uncompetitive user extraction,&rdquo; Figaro makes the extracting intermediary structurally unnecessary: between buyer and seller there is no seat from which rent could be metered.
                </p>
            </MarketingSection>

            <MarketingSection title="The current moment.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Since 2001 the Edelman Trust Barometer has tracked steady decline in the trust the public places in its institutions. The decline is not bounded to any one country or sector; it is structural. The institutions that carry the cognitive apparatus &mdash; media, government, business, civil society &mdash; show diminishing capacity to sustain the belief the apparatus needs.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The same period has seen social engineering deployed at scale.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is one contribution to a substrate that captures less well: economic rules that are common knowledge, enforced by mathematics, owned by no one. Clarity is a partial defense. It is the defense the third era makes available.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/physics" className="text-ink-heading font-medium hover:underline">
                            Physics
                        </Link>
                        <span className="text-ink-body"> &mdash; the same mechanism read as structure: the few facts the core obeys, why its state can leave the chain, and why trust moves from the keeper in the middle to the boundary at the edge.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">
                            Builders
                        </Link>
                        <span className="text-ink-body"> &mdash; how to extend the protocol: author a clause, register it on-chain, earn from settled use under the florin clause-author allocation.</span>
                    </li>
                    <li>
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            Cryptoeconomics
                        </Link>
                        <span className="text-ink-body"> &mdash; the eight disciplines that read the substrate, organized along the Voshmgir &amp; Zargham taxonomy, and the papers along each.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                            Specifications
                        </Link>
                        <span className="text-ink-body"> &mdash; the on-chain contract surface: kernel, attestation, clause, mechanism modules, with source links and verification status.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

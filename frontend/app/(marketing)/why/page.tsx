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
                        Coercion. Cognition. Crypto. Each is a way humans give rules legitimacy. The first two are ancient, sophisticated, and persistent. The third is new &mdash; and brings something the first two could not: clarity, anchored in mathematics and deterministic computing. Figaro is what cryptoeconomics looks like when it is applied to trade.
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
                    Above the kernel: clauses carrying the general terms-and-conditions that recur across processes, and a consent clause carrying the special terms that would otherwise sit in a written contract. Clauses compose into processes &mdash; what the protocol calls assemblies. Sellers index processes freely; buyers negotiate the terms directly, with no intermediary in the path.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Traditional negotiation rests on a belief &mdash; that the counterparties are acting in good faith. The assumption belongs to the cognitive era; it holds when the institutions ready to enforce it remain trusted, and weakens when they do not.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Figaro does not assume good faith. It asks each party to demonstrate it, directly, by posting a bond against the commitment they are making &mdash; putting money where the mouth is. Posting the bond is the parties' act of subscribing to the mechanism's rules. Like any deterministic system, the outcome follows from the rules themselves &mdash; not from anyone's goodwill or discretion. The bond is not an expenditure in the traditional sense. It replaces the pre-existing requirement for lawyers, accountants, or a legal entity to wrap the relationship and underwrite the assumption.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Buyer dominance and atomic settlement compact, into a single call, the value-added work that a legal entity used to hold and meter. When the process is token-bound, the value of the assembled work accrues to the token, not to a share price. The token recenters as defining a community of users &mdash; not a substitute for fiat money. The denominations in a wallet reflect its owner&apos;s communities and values. The kernel takes no position on which token; any ERC20 the community already uses can carry the trade.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Each wallet represents something real &mdash; a kitchen, a vehicle, a person&apos;s labour, a public service &mdash; and it sustains its participation the way a business does under going-concern, or the way a node sustains a blockchain. Receipts from on-chain participation have to cover the asset&apos;s off-chain operating expenses over time; when they stop covering them, the seller stops bonding the wallet into processes and it drops out of the market it served. The kernel does not enforce this. The market does, through ordinary rational exit.
                </p>
            </MarketingSection>

            <MarketingSection title="How Figaro grows.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Figaro is built to be extended. Anyone can author a new clause, register it on-chain, and be paid retroactively for clauses the network comes to rely on &mdash; sixty percent of the FIG supply is reserved for clause authors, distributed by a fixed formula that measures settled use. No application, no committee.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Clauses are one extension surface. Assemblies are another &mdash; communities compose clauses into the processes they need, with the sellers who run them indexing those processes freely. The protocol grows by what it actually carries. <Link href="/builders" className="text-ink-heading font-medium hover:underline">More on building on Figaro</Link>.
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
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">
                            Builders
                        </Link>
                        <span className="text-ink-body"> &mdash; how to extend the protocol: author a clause, register it on-chain, earn from settled use under the FIG clause-author allocation.</span>
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

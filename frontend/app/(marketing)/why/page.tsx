import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Why — Figaro Protocol",
    description:
        "Bitcoin secured issuance. Ethereum secured computation. Figaro secures trade. The cryptoeconomic lineage, the distinction from traditional economics on crypto rails, and what becomes possible when trade itself is the substrate.",
};

export default function Why() {
    return (
        <>
            <MarketingHero
                title="Cryptoeconomics for trade."
                lead={
                    <>
                        Bitcoin invented cryptoeconomics &mdash; a substrate whose value is denominated in bitcoin, the first cryptocurrency. Ethereum extended the lineage with programmability and its own cryptocurrency, ether. Figaro continues the lineage, and addresses what neither did: trade itself.
                    </>
                }
            />

            <MarketingSection title="Three substrates, three properties.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Bitcoin secured issuance. Its kernel &mdash; proof of work &mdash; produces blocks, and the token denominates the work expended to produce them. The proof <em>is</em> the bitcoin. The substrate does not secure trade between parties; it secures the issuance ledger.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Ethereum secured computation. The same kind of kernel, generalized: any program anyone can write runs on the substrate, and the token denominates the right to occupy computation. The substrate does not secure trade between parties; it secures the execution of programs.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro secures trade. Two parties who have never met exchange value across non-trust, and the substrate makes cooperation the dominant strategy by structural means. The FIG token denominates the trade the substrate secures.
                </p>
            </MarketingSection>

            <MarketingSection title="Cryptoeconomics is not traditional economics on crypto rails.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Most of what now runs on Ethereum &mdash; lending markets, automated market-makers, derivatives, yield instruments &mdash; is traditional finance ported to a new venue. The mechanisms are unchanged; only the substrate is. That is finance on crypto rails. It is not cryptoeconomics.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Cryptoeconomics is the discipline of using cryptographic primitives to secure economic properties that institutions used to secure. Bitcoin secured issuance directly. Ethereum secured execution directly. Each redesigned its layer; neither ported it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is cryptoeconomics for trade. The properties a firm or platform or court used to secure &mdash; counterparty honesty, atomic settlement, dispute jurisdiction &mdash; become properties of the substrate. The mechanism is redesigned, not ported.
                </p>
            </MarketingSection>

            <MarketingSection title="Proof of Work, Proof of Stake, Proof of Trade.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Each cryptoeconomic substrate is named for the work its token denominates.
                </p>
                <ul className="space-y-3 text-base text-ink-body leading-relaxed">
                    <li><strong>Proof of Work</strong> &mdash; bitcoin denominates computation expended to issue.</li>
                    <li><strong>Proof of Stake</strong> &mdash; ether denominates capital locked to validate.</li>
                    <li><strong>Proof of Trade</strong> &mdash; FIG denominates the trade the substrate secures.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Trade was the missing layer.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Trade across non-trust has always required a friction layer &mdash; banks, courts, platforms, arbitrators, escrow agents, jurisdictions &mdash; each absorbing some part of the trust gap and charging for the absorption. The friction was load-bearing because there was no substrate that secured the trade itself.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is that substrate. Two parties bond directly; the protocol enforces the bilateral commitment mathematically; settlement is atomic. The institutions that filled the trust gap are not removed by Figaro &mdash; the architecture makes them structurally unnecessary.
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
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            Cryptoeconomics
                        </Link>
                        <span className="text-ink-body"> &mdash; the eight disciplines that read the substrate, organized along the Voshmgir &amp; Zargham taxonomy, and the papers along each.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                            Specifications
                        </Link>
                        <span className="text-ink-body"> &mdash; the on-chain contract surface: kernel, attestation, schema, mechanism modules, with source links and verification status.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

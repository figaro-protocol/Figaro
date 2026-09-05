import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Research — Figaro Protocol",
    description:
        "The protocol rests on a theorem: when both sides bond twice the payment and only the buyer resolves, keeping your word is each side's best move. The papers derive it, machine-check it, and follow it into the firm, the market, the ledger, the law, and the industries that already coordinate at scale. They are sorted into the eight disciplines of cryptoeconomics and indexed by the industry a reader arrives from.",
});

// THE RESEARCH DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function ResearchDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro: the research behind permissionless, decentralized trade"
                lead={
                    <>
                        The protocol rests on a theorem: when both sides bond twice the payment and only the buyer resolves, keeping your word is each side&apos;s best move. The papers derive it, machine-check it, and follow it into the firm, the market, the ledger, the law, and the industries that already coordinate at scale. They are sorted into the eight disciplines of cryptoeconomics and indexed by the industry a reader arrives from.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="/working-groups">Working Groups</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">By discipline: economics and game theory, engineering, computer science, law and ethics, and four more.</p>
                    <p className="text-sm text-ink-body leading-relaxed">By industry: container shipping, air service, platform work, e-invoicing and tax, regulation, data markets.</p>
                    <p className="text-sm text-ink-body leading-relaxed">By keyword: every keyword under a paper opens the papers that share it.</p>
                </div>
            </section>
            <MarketingSection title="Start here, whatever your field.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    One paper derives the equilibrium the rest of the corpus reasons from. Another says what a machine has and has not checked about the code that runs it. <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric bonding</Link> · <Link href="/papers/verified-settlement-kernel" className="text-ink-heading font-medium hover:underline">The verified kernel</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="The firm, the platform, the court, and the bond.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Four ways to make a stranger&apos;s promise good, compared on the same axes. What happens to Coase&apos;s boundary of the firm when enforcing an agreement between strangers costs a fixed lockup. <Link href="/papers/coordination-substrates" className="text-ink-heading font-medium hover:underline">Coordination substrates</Link> · <Link href="/papers/transaction-scoped-institutions" className="text-ink-heading font-medium hover:underline">Transaction-scoped institutions</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Markets, books, and data.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A market with no venue holding state. A trade that is its own accounting entity and closes its own period. Data sold with proof that it came from a real trade. <Link href="/papers/markets-without-a-venue" className="text-ink-heading font-medium hover:underline">Markets without a venue</Link> · <Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-closing ledger periods</Link> · <Link href="/papers/self-authenticating-data-sales" className="text-ink-heading font-medium hover:underline">Self-authenticating data sales</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Law without a court of first resort.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Resolution on-chain, adjudication off-chain. The wallet as a legal subject. Enforcement without coercion. What a court receives. <Link href="/papers/on-chain-evidence" className="text-ink-heading font-medium hover:underline">On-chain evidence</Link> · <Link href="/papers/wallet-legal-subject" className="text-ink-heading font-medium hover:underline">The wallet as legal subject</Link> · <Link href="/papers/coercion-variable" className="text-ink-heading font-medium hover:underline">The coercion variable</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Industries that already coordinate at scale.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Container shipping after TradeLens. Air service as coordinated resource markets. <Link href="/papers/after-tradelens" className="text-ink-heading font-medium hover:underline">After TradeLens</Link> · <Link href="/papers/air-service-coordination" className="text-ink-heading font-medium hover:underline">Air service</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="The token.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The florin as a Schelling point and nothing else. <Link href="/papers/florin-schelling-point-token" className="text-ink-heading font-medium hover:underline">The florin</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="A working group is whoever does this work in a discipline.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Groups form wherever their people are. Every paper is signed Figaro, and every claim traces to the kernel, a theorem, or a named source. <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">Working Groups</Link>
                </p>
            </MarketingSection>
            <MarketingSection bottomPad="wide">
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                    The code is not yet audited by an outside firm. It is checked six independent ways on every commit. <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                </p>
            </MarketingSection>
        </>
    );
}

import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Use — Figaro Protocol",
    description:
        "Sell to anyone, anywhere, and be paid in full the moment the buyer confirms. Goods, services, work, or data, in the token you choose. No platform takes a cut, no processor can freeze you, and nobody needs your permission to join.",
});

// THE USE DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function UseDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro: permissionless, decentralized trade on a blockchain"
                lead={
                    <>
                        Sell to anyone, anywhere, and be paid in full the moment the buyer confirms. Goods, services, work, or data, in the token you choose. No platform takes a cut, no processor can freeze you, and nobody needs your permission to join.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="/discover">Open the app</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">Your catalogue, in a public registry anyone can order from.</p>
                    <p className="text-sm text-ink-body leading-relaxed">Your community&apos;s token, a stablecoin, or the florin, the protocol&apos;s own token.</p>
                    <p className="text-sm text-ink-body leading-relaxed">Your data, yours to keep or to sell.</p>
                </div>
            </section>
            <MarketingSection title="What makes it safe.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Before a trade starts, both sides lock a bond of twice the payment in a smart contract nobody owns. Walking away costs more than finishing, on either side. When the buyer confirms, you are paid and both bonds are refunded. <Link href="/kernel" className="text-ink-heading font-medium hover:underline">How it holds</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="If something goes wrong.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Put it right before the buyer confirms: replace the goods, return part of the payment, or go to the arbitration forum named in your agreement. If the buyer never confirms, nothing moves for either of you, and their locked bond is twice what they owed you. <Link href="/faq" className="text-ink-heading font-medium hover:underline">What can go wrong</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Terms you compose, not terms you commission.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Choose the agreement&apos;s clauses from the published ones: applicable law, arbitration, acceptance criteria, delivery, cold chain. Publish your own and be paid in florins every time a trade uses them. <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Your books, already kept.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Every trade leaves a balance sheet, an income statement, and an audit bundle for its own books. Invoices, emissions, and evidence for a court come out of the trade itself. <Link href="/audit" className="text-ink-heading font-medium hover:underline">Audit</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Your agent, if you want one.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Software holding your key can trade for you, under limits you set. <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Anyone.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A person, a kitchen, a machine, a community, a software agent. A wallet is enough. <Link href="/members" className="text-ink-heading font-medium hover:underline">Members</Link>
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

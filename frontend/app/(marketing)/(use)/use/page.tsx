import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Use — Figaro Protocol",
    description:
        "Buy from anyone or sell to anyone, anywhere. Be paid in full the moment the buyer confirms. Goods, services, work, or data, in the token you choose. Join with a wallet and a reclaimable ETH stake; buying needs only the wallet. Trade yourself, or through an agent. Your data is yours to keep, or to sell.",
});

// THE USE LANDING — for buyers and sellers, and nothing else: join, trade, by
// hand or through an agent. The tagline is its title (it belongs here, never
// on the apex). The lead is the six benefits as bullets, then the same six as
// cards, each its paragraph and the one button that opens its page — the
// apex's shape. What makes it safe is a link to the core, what can go wrong a
// link to the FAQ; neither is a paragraph here. The words are the
// maintainer's; a comprehension gap found by any tester is closed on the page
// a card points to, never by adding prose here.
const BENEFITS: { line: string; body: string; cta: string; href: string }[] = [
    {
        line: "Buy from anyone or sell to anyone, anywhere.",
        body: "A buyer picks from a seller's catalogue and places a bonded order; the payment moves wallet to wallet on chain.",
        cta: "Order",
        href: "/discover",
    },
    {
        line: "Be paid in full the moment the buyer confirms.",
        body: "Both sides lock a bond before the trade. When the buyer confirms, you are paid in full and your bond is refunded whole.",
        cta: "What makes it safe",
        href: "/core",
    },
    {
        line: "Goods, services, work, or data, in the token you choose.",
        body: "Whatever a member publishes in a catalogue, priced in the token they name: a community's, a stablecoin, most ERC-20 tokens.",
        cta: "What you can trade",
        href: "/use/assemblies",
    },
    {
        line: "Join with a wallet and a reclaimable ETH stake; buying needs only the wallet.",
        body: "A seller registers a catalogue with a reclaimable ETH stake. A buyer needs only a wallet.",
        cta: "Join",
        href: "/members",
    },
    {
        line: "Trade yourself, or through an agent.",
        body: "Software can trade for you, under limits you set. It gets your rules, never your key.",
        cta: "Run an agent",
        href: "/agents",
    },
    {
        line: "Your data is yours to keep, or to sell.",
        body: "Every trade leaves your books and your evidence. Yours to keep, or to publish as a catalogue other buyers order from.",
        cta: "Read the data",
        href: "/data",
    },
];

export default function UseDoor() {
    return (
        <>
            <MarketingHero title="My word is my bond">
                <div className="flex flex-wrap gap-4 mb-8">
                    <CtaLink href="/members">Join</CtaLink>
                    <CtaLink href="/discover">Order</CtaLink>
                </div>
                <ul className="text-body-lead text-ink-muted max-w-2xl list-disc pl-6 space-y-2">
                    {BENEFITS.map((b) => (
                        <li key={b.href}>{b.line}</li>
                    ))}
                </ul>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {BENEFITS.map((b) => (
                        <div key={b.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{b.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed grow">{b.body}</p>
                            <div className="mt-4">
                                <CtaLink href={b.href}>{b.cta}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-12 border-t border-default pt-8 text-sm text-ink-muted leading-relaxed max-w-2xl">
                    If something goes wrong:{" "}
                    <Link href="/faq" className="text-ink-heading font-medium hover:underline">
                        FAQ
                    </Link>
                    .
                </p>
            </section>
        </>
    );
}

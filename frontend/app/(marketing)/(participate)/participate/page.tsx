import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Participate — Figaro Protocol",
    description:
        "Buy or sell goods, work or data with anyone, anywhere, yourself or through an agent: Figaro is decentralized and permissionless, so any wallet may trade.",
});

// THE PARTICIPATE LANDING — the door of buyers and sellers, a person's wallet
// or an agent's. Its shape is the Core landing's (`/core`): one declarative
// sentence per subject as its heading, one paragraph as its card, one button
// to the page that owns the how — buy, sell, through an agent. Then one trade
// in numbers, the link to the whole trade in pictures, and the two link lines.
// A comprehension gap found by any tester is closed on the page a card points
// to, never by adding prose here.
const SUBJECTS: { line: string; body: string; cta: string; href: string }[] = [
    {
        line: "You buy from a member's catalogue with nothing but a wallet.",
        body: "The member directory shows who sells what, searchable by place and by name. You order from a seller's catalogue, in a token the seller accepts.",
        cta: "Discover",
        href: "/discover",
    },
    {
        line: "You sell by publishing a profile buyers can find.",
        body: "Your profile carries a catalogue of what you offer, the tokens you accept and the terms you trade under. A person, a business and an agent register the same way.",
        cta: "Join",
        href: "/members",
    },
    {
        line: "An agent can trade for you, with your wallet and your rules.",
        body: "You give the agent your rules, never your key: what to buy or sell, from whom, up to how much, in which token. A policy signer refuses every signature outside those rules.",
        cta: "Agents",
        href: "/agents",
    },
];

// One trade, row by row: what happens, then where the buyer and the printer stand.
const TRADE: { step: string; buyer: string; printer: string }[] = [
    { step: "They agree the print run and its price", buyer: "Nothing locked", printer: "Nothing locked" },
    { step: "Both sign, and the order is committed", buyer: "200 locked, the payment of 100 inside it", printer: "200 locked" },
    { step: "The printer delivers the posters", buyer: "200 locked", printer: "200 locked" },
    { step: "The buyer confirms", buyer: "100 refunded", printer: "300 received: the payment of 100 and the bond of 200 refunded" },
    { step: "Where each ends", buyer: "Has the posters, for 100", printer: "Has been paid 100" },
];

const LINK_CLASS = "text-ink-heading font-medium hover:underline";

export default function ParticipateDoor() {
    return (
        <>
            <MarketingHero
                title="Participate"
                lead="Find a seller, or let buyers find you: Figaro is decentralized and permissionless, so any wallet may trade, a person's or an agent's."
            />

            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {SUBJECTS.map((s) => (
                        <div key={s.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{s.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed grow">{s.body}</p>
                            <div className="mt-4">
                                <CtaLink href={s.href}>{s.cta}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="border-t border-default pt-10">
                    <div className="overflow-x-auto mb-4">
                        <table className="w-full max-w-2xl text-sm text-left">
                            <caption className="caption-top text-left text-base text-ink-heading font-medium mb-3">
                                One trade: a print run of posters for 100, in a dollar stablecoin.
                            </caption>
                            <thead>
                                <tr className="border-b border-default text-ink-heading">
                                    <th className="py-2 pr-4 font-semibold">What happens</th>
                                    <th className="py-2 pr-4 font-semibold">The buyer</th>
                                    <th className="py-2 font-semibold">The printer</th>
                                </tr>
                            </thead>
                            <tbody className="text-ink-body">
                                {TRADE.map((row, i) => (
                                    <tr key={row.step} className={i < TRADE.length - 1 ? "border-b border-default" : undefined}>
                                        <td className="py-2 pr-4">{row.step}</td>
                                        <td className="py-2 pr-4">{row.buyer}</td>
                                        <td className="py-2">{row.printer}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-sm text-ink-muted leading-relaxed mb-6">
                        Gas, the chain&apos;s charge for each transaction, is on top of these amounts.
                    </p>
                    <p className="text-base text-ink-body leading-relaxed mb-8">
                        <Link href="/trade" className={LINK_CLASS}>
                            A whole trade, start to finish, in six pictures
                        </Link>
                    </p>
                </div>

                <div className="border-t border-default pt-8 space-y-2">
                    <p className="text-sm text-ink-muted leading-relaxed">
                        <Link href="/faq" className={LINK_CLASS}>
                            What it costs, and what happens if something goes wrong
                        </Link>
                    </p>
                    <p className="text-sm text-ink-muted leading-relaxed">
                        <Link href="/communities" className={LINK_CLASS}>
                            Communities: what you can trade, and who offers each kind
                        </Link>
                    </p>
                </div>
            </section>
        </>
    );
}

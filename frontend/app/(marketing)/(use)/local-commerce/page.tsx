import type { Metadata } from "next";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";

// No `openGraph`/`twitter` here (unlike its page siblings): this route's
// layout (`local-commerce/layout.tsx`) already carries a curated `openGraph`
// — Next.js metadata merging REPLACES a parent's `openGraph` object wholesale
// with a child's, so adding one here would silently blank out that copy
// rather than extend it.
export const metadata: Metadata = {
    title: "Local Commerce — Figaro Protocol",
    description: "One meal, three strangers, no platform: a delivered meal, told from where each of the three stood — the buyer, the kitchen, the courier. One example among unbounded kinds of trade.",
};

// ONE EXAMPLE, told from where each participant stood — never the site's
// default telling (the local-commerce model is demoted: one vertical among
// many). Protocol vocabulary and contract identifiers stay OFF this page.
//
// The narrated trade must match the published `Local commerce` assembly, which
// is TWO orders: a merchant root order and one co-equal courier sub-order. Do
// not reintroduce a third tier (a farm, a supplier) into the narrated trade or
// into its figure; the numbers in the prose — like the `legs` passed to
// `StackedBondChainFigure` — are the checkout values of those two legs. No
// sentence may imply the trade routed a fiscal share or that any clause
// computed one — a resolved wallet splits its OWN tokens on its own
// initiative, afterwards. Every fact beyond the three perspectives is owned by
// another page and linked, never re-told here.
export default function LocalCommercePage() {
    return (
        <>
            <MarketingHero
                title="One meal, three strangers, no platform."
                lead={
                    <>
                        It is seven in the evening and you order dinner. A kitchen you have never dealt with accepts. A courier you have never met carries it. Twenty minutes later you confirm it arrived &mdash; and in that single stroke the kitchen is paid, the courier is paid, and every bond goes home. No company sat in the middle. Nothing held the evening together but the trade itself.
                    </>
                }
            />

            <MarketingSection title="The buyer.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mb-5">
                    You saw where your payment was going before you committed to any of it: 8.40 to the kitchen, 2.10 to the courier, 10.50 in all, line by line, before you paid a cent. You bond double on every leg of the trade, and you alone resolve it. The trade is not finished when the food is cooked, or when it reaches your door &mdash; it is finished when you confirm, and whatever you agreed to has to be met before you do. If the meal is wrong, it gets remade. If it never came, it gets sent again. The payment moves when you resolve, and not before.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Your address was sealed so that only the courier could read it, and the key was thrown away when the trade resolved. No company keeps a standing file of where you live.
                </p>
            </MarketingSection>

            <MarketingSection title="The kitchen.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    When you placed the order, the kitchen locked a bond to accept it: 16.80 against the 8.40 of food. The kitchen wants the courier to succeed &mdash; its own bond rides on the delivery. Nobody is paid until you confirm, so when the courier fails the kitchen wants it fixed too. The moment you confirm, the kitchen is paid in full and its bond is refunded whole. A buyer who eats the meal and never confirms freezes that bond &mdash; but abandons their own in the very same box, twice what the dinner was worth, in exchange for a single meal.
                </p>
            </MarketingSection>

            <MarketingSection title="The courier.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The courier takes the delivery leg at their own listed rate, on a bicycle, in a car, on foot, or by drone. They arrive to a dinner that already has the food&apos;s value on it, so a 2.10 ride locks 21.00 &mdash; the smallest earning of the evening behind the largest lock, because from the pickup onwards the courier is carrying your whole order, not just the ride. The courier wants the kitchen to have cooked what you ordered &mdash; their bond rides on your confirmation. When you confirm, the courier is paid and the bond comes home with the kitchen&apos;s, all at once.
                </p>
            </MarketingSection>

            <MarketingSection title="The two legs, side by side.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Each line was its own bond, and both had to resolve together or not at all &mdash; the same rule that let the kitchen and the courier trust each other without a dispatcher. What each was paid, what each locked to take the work, and what was refunded when you confirmed:
                </p>
                <StackedBondChainFigure
                    className="mt-8"
                    idPrefix="local-commerce-stacked-stakes"
                    legs={[
                        { name: "Kitchen", role: "root order", payment: 8.4 },
                        { name: "Courier", role: "sub-order", payment: 2.1 },
                    ]}
                    figureTitle="The two legs of the dinner: what each was paid, what each bonded"
                    figureDesc={
                        "A two-order trade. The kitchen takes the root order: paid 8.40, " +
                        "bonding twice the value at its link — 16.80. The " +
                        "courier commits afterwards, once the food's 8.40 is already on the " +
                        "trade, so it bonds twice the 10.50 running total — 21.00 — to earn " +
                        "2.10. The buyer bonds twice each payment as that order commits, " +
                        "21.00 in all. Both orders resolve together, or neither does."
                    }
                    caption={
                        <>
                            The kitchen accepts first and locks 16.80 against the 8.40 of food.
                            The courier arrives to a dinner that already has the food&apos;s
                            value on it, so a 2.10 ride locks 21.00.
                        </>
                    }
                />
            </MarketingSection>

            <MarketingSection bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mb-5">
                    The scene is dinner, but nothing in it is about food. The same three-sided shape carries a bookshop order, a tailor&apos;s alteration, a plumber&apos;s house call &mdash; any local trade where something is made, carried, and confirmed. It is one published assembly, run once: <Link href="/use/assemblies" className="text-ink-heading font-medium hover:underline">what you can trade</Link>.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                    A real dispute, a loss that runs past the meal, a question only a court or an insurer can answer: what stands behind a trade, layer by layer, is on <Link href="/faq#layers" className="text-ink-heading font-medium hover:underline">the FAQ</Link>, with the gas, the tokens, and the tax. Nothing here is legal or tax advice.
                </p>
            </MarketingSection>
        </>
    );
}

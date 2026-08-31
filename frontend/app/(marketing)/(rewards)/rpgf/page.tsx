import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RpgfValueLoopFigure } from "@/components/figures/RpgfValueLoopFigure";

// The designer-rewards page. Its route is an identifier and does not move —
// two renames once buried this page. Hero + one terms
// section + closer. Every claim traces to the minter under `src/rpgf/` and
// `src/protocol/usage/UsageCounter.sol`. Beside it: Tokenomics owns THE TOKEN,
// The DAO owns THE BOOTSTRAP. Three concepts, three pages.
export const metadata: Metadata = withOg({
    title: "Rewards for designers — Figaro Protocol",
    description:
        "600 million florins reserved for whoever writes the clauses and composes the assemblies that grow the network's use, paid by a published formula anyone can check — the schedule, the two counters, the three-seller floor, the live-stake condition.",
});

export default function DesignerRewards() {
    return (
        <>
            <MarketingHero
                title="Paid for what the network uses."
                lead={
                    <>
                        Write a clause, publish an assembly, and when resolved trade reaches for it you draw a share of 600 million florins &mdash; sixty percent of every florin that will ever exist &mdash; by a published formula anyone can check. Nobody applies, nobody decides, and nothing is taken from anyone to pay for it. Two conditions, up front: a year that closes with fewer than three distinct sellers using your work scores nothing, and a trade counts only while both you and the seller who delivered it hold a live registration stake.
                    </>
                }
            />

            <MarketingSection title="Reward Terms &amp; Conditions.">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    The 600 million pay out over nine annual periods in three rising steps &mdash; 15%, then 30%, then 55% of the reserve &mdash; paid once a year, each year from its own tally, fixed at deployment; the biggest payouts wait for the most evidence. The full schedule, year by year and florin by florin, is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>, which owns the supply side of this program.
                </p>
                <ul className="space-y-3 text-base text-ink-body leading-relaxed list-disc pl-5">
                    <li>Every <Link href="/glossary#clause" className="text-ink-heading hover:underline">clause</Link> and <Link href="/glossary#assembly" className="text-ink-heading hover:underline">assembly</Link> earns the same way: by how much real resolved trade reached for it.</li>
                    <li>Two numbers decide a share: resolved trades that carried it, and distinct sellers behind them. Breadth beats volume &mdash; fifty sellers reaching for it once outweighs one seller using it fifty times. Payment size never enters.</li>
                    <li>Your share is your clauses&apos; and assemblies&apos; numbers over everyone&apos;s. The rule is the contract itself.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mt-6">
                    The two conditions in the lead are one guard, read from both ends: three distinct sellers is the smallest signal a single person cannot stage alone, and a live stake required of designer and seller alike means padding a tally costs real stake for as long as the padding stands.
                </p>
                <RpgfValueLoopFigure />
                <p className="text-base text-ink-body leading-relaxed mt-6">
                    A designer reads their accrual and claims a closed period&apos;s share at <Link href="/rewards" className="text-ink-heading font-medium hover:underline">Claim rewards</Link> &mdash; connected wallet required, permission from no one.
                </p>
            </MarketingSection>

            <MarketingSection title="Where the other 400 million sits." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    The florin&apos;s supply is fixed at a billion, and this reserve is 600 million of it. 300 million sit in the <Link href="/dao" className="text-ink-heading font-medium hover:underline">DAO&apos;s treasury</Link>, spent by human judgment &mdash; a one-time grant to the human layer, a different object from the use-paid reserve above. 100 million went to the founders and early supporters &mdash; 70 and 30 respectively. The whole split is readable on the chain.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    The token these rewards are paid in &mdash; the supply and the latch that closes it, and each holding&apos;s terms &mdash; is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>.
                </p>
            </MarketingSection>

        </>
    );
}

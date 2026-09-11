import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RpgfValueLoopFigure } from "@/components/figures/RpgfValueLoopFigure";

// The designer-rewards page. Its route is an identifier and does not move —
// two renames once buried this page. Hero + one terms
// section + closer. Every claim traces to the minter under `src/build/rewards/` and
// `src/build/rewards/UsageCounter.sol`. Beside it: Tokenomics owns THE TOKEN,
// The DAO owns THE BOOTSTRAP. Three concepts, three pages.
export const metadata: Metadata = withOg({
    title: "Designer Rewards — Figaro Protocol",
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
                        Write a clause, publish an assembly, and when resolved trade reaches for it you draw a share of 600 million florins &mdash; sixty percent of every florin that will ever exist &mdash; by a published formula anyone can check. Nobody applies, nobody decides, and nothing is taken from anyone to pay for it. Two conditions, up front: on each resolution path, a year that closes with fewer than three distinct sellers using your work pays nothing for what was recorded in it &mdash; though a trade not yet recorded waits: recording is the designer&apos;s own act, open in any later period through the ninth &mdash; and a trade counts only if the seller who delivered it holds a live registration stake at the moment it is recorded, and you hold yours when you claim.
                    </>
                }
            />

            <MarketingSection title="Reward Terms &amp; Conditions.">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    The 600 million pay out over nine annual periods in three rising steps &mdash; 15% of the reserve (45 million a year for two years), then 30% (60 million a year for three), then 55% (82.5 million a year for four) &mdash; paid once a year, each year from its own tally, fixed at deployment; the biggest payouts wait for the most evidence. Where the 600 million sits within the fixed billion is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>, which owns the supply side.
                </p>
                <ul className="space-y-3 text-base text-ink-body leading-relaxed list-disc pl-5">
                    <li>Every clause and assembly earns the same way: by how much real resolved trade reached for it.</li>
                    <li>Two numbers decide a share: resolved trades that carried it, and distinct sellers behind them. Breadth beats volume &mdash; fifty sellers reaching for it once outweighs one seller using it fifty times. Payment size never enters.</li>
                    <li>Your share is your clauses&apos; and assemblies&apos; numbers over everyone&apos;s. The rule is the smart contract itself.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mt-6">
                    The two conditions in the lead are one guard, read from both ends: three distinct sellers is the smallest signal a single person cannot stage alone, and a live stake required of designer and seller alike means farming the count &mdash; padding a tally with wallets you control &mdash; costs real stake for as long as the padding stands. That stake is what stops reward farming; no cap, weight, or reviewer is needed.
                </p>
                <RpgfValueLoopFigure />
                <p className="text-base text-ink-body leading-relaxed mt-6">
                    A designer reads their accrual and claims a closed period&apos;s share at <Link href="/rewards" className="text-ink-heading font-medium hover:underline">Claim rewards</Link> &mdash; connected wallet required, permission from no one. Claiming is one call per closed year, the wallet&apos;s whole portfolio in it &mdash; every clause and assembly whose stake is still live, each listed once; a withdrawn or repeated entry makes the call fail rather than score zero. A year pays only after it closes; what a closed year never pays out is never minted at all; and a claim never expires &mdash; a closed year waits as long as its designer does. The formula itself &mdash; the two counters, the cube-root score &mdash; and what fabricating a score would cost (ETH linear in the score, priced by the stake, its cooldown, and the period) are stated and derived in the <Link href="/papers/substrate-broadening-rpgf" className="text-ink-heading font-medium hover:underline">designer-rewards paper</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where the other 400 million sits." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    The florin&apos;s supply is fixed at a billion, and this reserve is 600 million of it; the <Link href="/dao" className="text-ink-heading font-medium hover:underline">DAO&apos;s treasury</Link>, 300 million spent by human judgment on work the counter cannot see, is a different object from the use-paid reserve above. Who holds the rest, and on what terms, is the Tokenomics page&apos;s subject. A florin is a Schelling point and carries no rights of any kind. The whole split is readable on the chain.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    The token these rewards are paid in &mdash; the supply and the latch that closes it, and each holding&apos;s terms &mdash; is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>.
                </p>
            </MarketingSection>

        </>
    );
}

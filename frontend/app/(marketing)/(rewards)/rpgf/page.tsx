import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RpgfValueLoopFigure } from "@/components/figures/RpgfValueLoopFigure";

// VALIDATED IN CHAT 2026-08-05 (maintainer copy pass): the page is the RPGF
// page — restored to its original route (/rpgf, born 2026-05-22) after two
// renames buried it. Hero + one terms section + closer. Every claim traces
// to src/rpgf/RpgfMinter.sol + src/protocol/usage/UsageCounter.sol.
export const metadata: Metadata = withOg({
    title: "Rewards for authors — Figaro Protocol",
    description:
        "600 million florins reserved for whoever writes the clauses and composes the assemblies that grow the network's usage, paid by a published formula anyone can check — the schedule, the two counters, the three-seller floor, the live-deposit condition.",
});

export default function Rpgf() {
    return (
        <>
            <MarketingHero
                title="Retroactive public goods funding."
                lead={
                    <>
                        600 million florins &mdash; sixty percent of all that will ever exist &mdash; reserved for whoever writes the clauses and composes the assemblies that grow the network&apos;s usage, by a published formula anyone can check.
                    </>
                }
            />

            <MarketingSection title="Reward Terms &amp; Conditions.">
                <div className="overflow-x-auto mb-4">
                    <table className="w-full max-w-md text-sm text-left">
                        <thead>
                            <tr className="border-b border-default text-ink-heading">
                                <th className="py-2 pr-4 font-semibold">Years</th>
                                <th className="py-2 pr-4 font-semibold">Share of the 600M</th>
                                <th className="py-2 font-semibold">Per year</th>
                            </tr>
                        </thead>
                        <tbody className="text-ink-body">
                            <tr className="border-b border-default"><td className="py-2 pr-4">1&ndash;2</td><td className="py-2 pr-4">15%</td><td className="py-2">7.5%</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">3&ndash;5</td><td className="py-2 pr-4">30%</td><td className="py-2">10%</td></tr>
                            <tr><td className="py-2 pr-4">6&ndash;9</td><td className="py-2 pr-4">55%</td><td className="py-2">13.75%</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Paid once a year, each year from its own tally, fixed at deployment; the biggest payouts wait for the most evidence.
                </p>
                <ul className="space-y-3 text-base text-ink-body leading-relaxed list-disc pl-5">
                    <li>Every clause and assembly earns the same way: by how much real settled trade reached for it.</li>
                    <li>Two numbers decide a share: settled deals that carried it, and distinct sellers behind them. Breadth beats volume &mdash; fifty sellers reaching for it once outweighs one seller using it fifty times. Payment size never enters.</li>
                    <li>Earning starts at three distinct sellers &mdash; the smallest signal one person can&apos;t stage alone. A year that closes below three scores nothing.</li>
                    <li>A deal counts only when the seller who delivered it holds a live deposit too. Your registration deposit stays live, or your work comes off the shelf and stops earning.</li>
                    <li>Your share is your clauses&apos; and assemblies&apos; numbers over everyone&apos;s. The rule is the contract itself.</li>
                </ul>
                <RpgfValueLoopFigure />
                <p className="text-base text-ink-body leading-relaxed mt-6">
                    An author reads their accrual and claims a closed period&apos;s share at <Link href="/rewards" className="text-ink-heading font-medium hover:underline">Claim rewards</Link> &mdash; connected wallet required, permission from no one.
                </p>
            </MarketingSection>

            <MarketingSection title="Where the other 400 million sits." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    The florin&apos;s supply is fixed at a billion, and this reserve is 600 million of it. 300 million sit in the DAO&apos;s treasury, spent by human judgment &mdash; a one-time grant to the human layer, a different object from the usage-paid reserve above. 100 million went to the founders and early supporters. The whole split is readable on the chain.
                </p>
            </MarketingSection>

        </>
    );
}

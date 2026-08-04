import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "How clause authors and assembly designers get paid — Figaro Protocol",
    description:
        "Platforms own the map of who-moves-what-where. Figaro makes that map a public good — and pays the people who draw it, by a published formula anyone can check, no committee.",
};

export default function ArtifactRewards() {
    return (
        <>
            <MarketingHero
                title="The map is the monopoly."
                lead={
                    <>
                        Platforms don&apos;t own the trucks or the kitchens. They own the map. Figaro makes the map a public good &mdash; and pays the people who draw it.
                    </>
                }
            />

            <MarketingSection title="The map.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Platforms don&apos;t own the trucks, the kitchens, or the couriers. What they own is the <em>map</em> &mdash; who needs what, where, and right now. That map is why you can&apos;t leave them: everyone has to return to the one place that sees the whole picture.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Every agreement on the protocol already records the essentials by itself &mdash; who paid whom, in what, how much, and how a job passed from one contributor to the next. What it can&apos;t see on its own is <em>where</em> the work physically happened: the pickup, the hand-off, the zone a service covers. That has to be added by the people doing the work.
                </p>
            </MarketingSection>

            <MarketingSection title="What earns.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    So the protocol pays them to add it. Sixty percent of all florins &mdash; 600 million of the one billion that will ever exist &mdash; is reserved for the people who write the clauses the network relies on and the people who compose them into usable assemblies, the largest single allocation by far. Every clause and every assembly earns on the same footing &mdash; by how much real trade actually reached for it, and nothing else. No category counts extra, no author is favoured, and there is no approval and no list to get onto. The clauses that map real-world flow &mdash; the pickup, the hand-off, the zone a service covers &mdash; earn because the network keeps reaching for them, not because anyone marked them special. Not the authors; the data.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What earns is real, settled use &mdash; and the chain counts it the moment it happens. When a deal closes, anyone can put that deal on a clause&apos;s tally, and the contract checks the two things that matter before it will accept: that the deal really did settle, and that the clause really was in the agreement both sides signed. Neither is taken on anyone&apos;s word. Two numbers accrue for each clause: how many separate settled deals carried it, and how many different sellers &mdash; each with their deposit still on the shelf &mdash; were behind those deals. Breadth counts over volume &mdash; a clause fifty different sellers reached for has widened the network further than one the same seller used fifty times, and a seller counts once however many deals they bring. A crowd of buyers all ordering from the same seller is depth, not breadth: more settled deals, still one seller. Payment size never enters; moving a fortune and moving a few tokens count the same.
                </p>
            </MarketingSection>

            <MarketingSection title="The three-seller floor.">
                <p className="text-base text-ink-body leading-relaxed">
                    There is a floor to clear before any of it pays. A clause or an assembly starts earning only once three different sellers, each with their own deposit down, have carried it in real settled trade. Below three, the counting still runs &mdash; every deal goes on that year&apos;s tally, and the moment the third seller lands the year scores in full, counted from its first deal. Be clear about the edge, though: a year that closes with fewer than three sellers scores nothing, and its deals stay on the record without rolling into the next year&apos;s tally, since each year pays for its own trade. The reason for the floor is plain. One or two sellers is exactly what a single person can stage alone, with wallets they control on both ends; three separate sellers reaching for the same clause is the smallest honest signal there is.
                </p>
            </MarketingSection>

            <MarketingSection title="The nine-year schedule.">
                <p className="text-base text-ink-body leading-relaxed">
                    The reward is paid once a year for nine years, on a schedule fixed at deployment, and each round pays out of its own year&apos;s tally, which stops moving the moment that year ends. The yearly amounts rise: fifteen percent of the reserve across the first two years, thirty percent across years three to five, fifty-five percent across years six to nine, split evenly inside each of those stretches. The biggest payouts wait for the most evidence &mdash; early on the network is at its smallest and its easiest to game, so the early years are deliberately the leanest &mdash; and paying every year means you are paid for last year&apos;s real use every year, rather than waiting half a decade to find out. So there is nothing to argue about at payout: your share is your clauses&apos; and assemblies&apos; numbers over everyone&apos;s, paid straight &mdash; no cap holding anyone back, no committee to clear it through, the same rule for a wallet that earned a little and one that earned a lot &mdash; both numbers already final and both readable by anyone. Nobody submits a result, nobody stakes anything on it being right, and nobody has to be watching to catch it if it were wrong &mdash; the rule is the contract itself, and it can&apos;t be quietly changed, not by the founders, not by a vote. This is retroactive funding: reward paid for impact once it is on the record, not predicted in advance by a panel. Where that practice elsewhere still leans on human badgeholders to score impact and vote a payout through, here there is no panel, no ballot, and no result to ratify.
                </p>
            </MarketingSection>

            <MarketingSection title="The live-deposit condition.">
                <p className="text-base text-ink-body leading-relaxed">
                    One condition keeps the reward flowing: the deposit that registered your clause or assembly has to stay in place. It is posted in the chain&apos;s own currency, not in florins, and while it is live your work is on the shelf and earning; withdraw it and the work comes down and stops earning from that point on. A settled deal counts toward an artifact only when the seller who delivered it holds a live deposit too &mdash; so breadth has to be real people putting up real collateral, not one wallet playing every part. Staking in the chain&apos;s base currency ties everyone who contributes to the network&apos;s actual growth, rather than to the token they are paid in.
                </p>
            </MarketingSection>

            <MarketingSection title="Why it levels the field.">
                <p className="text-base text-ink-body leading-relaxed">
                    Over time it adds up to something no company owns: a public, verifiable view of how goods and services actually move &mdash; demand clusters, routes, service areas &mdash; every point of it posted in the open and checkable by anyone. When the map is a public good, the monopoly on it ends. The platforms aren&apos;t attacked; the thing they were renting back to everyone is simply free. That is what levels the field.
                </p>
            </MarketingSection>

            <MarketingSection title="Three capital sources, not one.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    The 600 million reward above is the largest of three ways work on the Figaro substrate &mdash; research, review, verification, assembly design, clause authoring &mdash; gets funded, and the only one paid automatically, by the fixed formula above, with no gatekeeper between a contributor and the reward. Two more capital sources sit beside it, funded on a different basis by design.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">DAO treasury (300M)</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            30% of supply, minted to the DAO wallet at genesis with no vesting (the DAO is not yet instantiated). Where the 600M pays out by formula, the 300M is the human-judgment layer by design: the DAO funds public goods by choosing to &mdash; paying a third party, procuring through the protocol, standing up a program &mdash; from its own treasury, never through a market. There is no quadratic-funding round and no crowd-matching mechanism; the discretion is the point.
                        </dd>
                    </div>
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">Direct contributions</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Any wallet can send assets to a group&apos;s published address or to the DAO wallet, in the open. On-chain visibility preserves the funding graph &mdash; who paid whom is as legible as who traded with whom.
                        </dd>
                    </div>
                </dl>
                <p className="text-sm text-ink-muted leading-relaxed mt-4">
                    Who organizes around this funding, and how: <Link href="/working-groups" className="underline">Working Groups</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="More for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/rewards" className="text-ink-heading font-medium hover:underline">
                            Rewards
                        </Link>
                        <span className="text-ink-body"> &mdash; the live distribution surface: record a settled deal against the artifacts it used, read the running tallies, and claim a round once its period has closed.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">
                            Builders
                        </Link>
                        <span className="text-ink-body"> &mdash; the five builder roles: contract authors, clause authors, assembly authors, token issuance, humans and agents.</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">
                            Clauses
                        </Link>
                        <span className="text-ink-body"> &mdash; the plain-language introduction, the validation architecture, and the reference clauses.</span>
                    </li>
                    <li>
                        <Link href="/builders/clauses" className="text-ink-heading font-medium hover:underline">
                            Register a clause
                        </Link>
                        <span className="text-ink-body"> &mdash; the spec format, the hash mechanics, and the authoring checklist, beside the live registration form.</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">
                            Composability
                        </Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

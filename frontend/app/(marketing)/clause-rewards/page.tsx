import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "How clause authors get paid — Figaro Protocol",
    description:
        "Platforms own the map of who-moves-what-where. Figaro makes that map a public good — and pays the people who draw it, by a published formula anyone can check, no committee.",
};

export default function ClauseRewards() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                The map is the monopoly.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Platforms don&apos;t own the trucks or the kitchens. They own the map. Figaro makes the map a public good — and pays the people who draw it.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Platforms don&apos;t own the trucks, the kitchens, or the couriers. What they own is the <em>map</em> &mdash; who needs what, where, and right now. That map is why you can&apos;t leave them: everyone has to return to the one place that sees the whole picture.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Every agreement on the protocol already records the essentials by itself &mdash; who paid whom, in what, how much, and how a job passed from one contributor to the next. What it can&apos;t see on its own is <em>where</em> the work physically happened: the pickup, the hand-off, the zone a service covers. That has to be added by the people doing the work.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                So the protocol pays them to add it. Sixty percent of all florins &mdash; 600 million of the one billion that will ever exist &mdash; is reserved for the people who write the clauses the network relies on and the people who compose them into usable assemblies, the largest single allocation by far. Every clause and every assembly earns on the same footing &mdash; by how much real trade actually reached for it, and nothing else. No category counts extra, no author is favoured, and there is no approval and no list to get onto. The clauses that map real-world flow &mdash; the pickup, the hand-off, the zone a service covers &mdash; earn because the network keeps reaching for them, not because anyone marked them special. Not the authors; the data.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                What earns is real, settled use &mdash; and the chain counts it the moment it happens. When a deal closes, anyone can put that deal on a clause&apos;s tally, and the contract checks the two things that matter before it will accept: that the deal really did settle, and that the clause really was in the agreement both sides signed. Neither is taken on anyone&apos;s word. Two numbers accrue for each clause: how many separate settled deals carried it, and across how many distinct pairs of counterparties. Breadth counts over volume &mdash; a clause used once between fifty different pairs has widened the network further than one used fifty times between the same two, and the same two counterparties count as one pair however often they trade. Payment size never enters; moving a fortune and moving a few tokens count the same.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The reward is paid in three rounds on a schedule fixed at deployment &mdash; the reference plan is years two, five, and nine &mdash; and each round pays out of the tally for its own stretch of time, which stops moving the moment that stretch ends. So there is nothing to argue about at payout: your share is your clauses&apos; and assemblies&apos; numbers over everyone&apos;s, paid straight &mdash; no cap holding anyone back, no committee to clear it through, the same rule for a wallet that earned a little and one that earned a lot &mdash; both numbers already final and both readable by anyone. Nobody submits a result, nobody stakes money on it being right, and nobody has to be watching to catch it if it were wrong &mdash; the rule is the contract itself, and it can&apos;t be quietly changed, not by the founders, not by a vote. This is retroactive funding: reward paid for impact once it is on the record, not predicted in advance by a panel. Where that practice elsewhere still leans on human badgeholders to score impact and vote a payout through, here there is no panel, no ballot, and no result to ratify.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One condition keeps the reward flowing: the deposit that registered your clause or assembly has to stay in place. It is posted in the chain&apos;s own currency, not in florins, and while it is live your work is on the shelf and earning; withdraw it and the work comes down and stops earning from that point on. A settled deal counts toward an artifact only when the seller who delivered it holds a live deposit too &mdash; so breadth has to be real people putting up real collateral, not one wallet playing every part. Staking in the chain&apos;s base currency ties everyone who contributes to the network&apos;s actual growth, rather than to the token they are paid in.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                Over time it adds up to something no company owns: a public, verifiable view of how goods and services actually move &mdash; demand clusters, routes, service areas &mdash; every point of it posted in the open and checkable by anyone. When the map is a public good, the monopoly on it ends. The platforms aren&apos;t attacked; the thing they were renting back to everyone is simply free. That is what levels the field.
            </p>

            <h2 className="text-base font-semibold text-ink-heading mt-16 mb-4">
                More for builders
            </h2>
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
                    <span className="text-ink-body"> &mdash; the validation architecture, the reference clauses, and the authoring checklist.</span>
                </li>
                <li>
                    <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">
                        Composability
                    </Link>
                    <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                </li>
            </ul>
        </section>
    );
}

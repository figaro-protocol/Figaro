import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "How clause authors get paid — Figaro Protocol",
    description:
        "Platforms own the map of who-moves-what-where. Figaro makes that map a public good — and is built to pay the clause authors who draw it, by a fixed formula, no committee.",
};

export default function ClauseRewards() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                The map is the monopoly.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Platforms don&apos;t own the trucks or the kitchens. They own the map. Figaro makes the map a public good — and will pay the people who draw it.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Platforms don&apos;t own the trucks, the kitchens, or the couriers. What they own is the <em>map</em> &mdash; who needs what, where, and right now. That map is why you can&apos;t leave them: everyone has to return to the one place that sees the whole picture.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Every agreement on the protocol already records the essentials by itself &mdash; who paid whom, in what, how much, and how a job passed from one contributor to the next. What it can&apos;t see on its own is <em>where</em> the work physically happened: the pickup, the hand-off, the zone a service covers. That has to be added by the people doing the work.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                So the protocol will pay them to add it. Sixty percent of all FIG &mdash; 600 million of the one billion that will ever exist &mdash; is reserved for the people who write the clauses the network relies on, the largest single allocation by far. And the clauses that map real-world flow will earn more than the rest: the same rule for everyone, no committee, no application &mdash; meant as a standing reward for contributing the data the network most needs and no one else will volunteer. Not because those authors are special; because that data is.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                What will earn is real, settled use. At each payout the protocol will look only at deals that actually closed, and ask of every clause: how many separate settled deals carried it, and across how many distinct pairs of counterparties. Breadth counts over volume &mdash; a clause used once between fifty different pairs has widened the network further than one used fifty times between the same two. Payment size never enters; moving a fortune and moving a few dollars count the same. The reward will be paid in three rounds, at years two, five, and nine, and no author can take more than fifteen percent of any one. The formula is fixed before the protocol is deployed and cannot be changed afterward &mdash; not by the founders, not by a vote.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                Over time it adds up to something no company owns: a public, verifiable view of how goods and services actually move &mdash; demand clusters, routes, service areas &mdash; every point of it posted in the open and checkable by anyone. When the map is a public good, the monopoly on it ends. The platforms aren&apos;t attacked; the thing they were renting back to everyone is simply free. That is what levels the field.
            </p>

            <h2 className="text-base font-semibold text-ink-heading mt-16 mb-4">
                More for builders
            </h2>
            <ul className="space-y-3 text-base">
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

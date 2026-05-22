import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "How schema authors get paid — Figaro Protocol",
    description:
        "Sixty percent of the FIG supply is reserved for schema authors, paid out by a fixed formula that measures real, settled use — no application, no committee.",
};

export default function Rpgf() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                How schema authors get paid.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                No application. No committee. A fixed formula that pays for schemas the network actually uses.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Sixty percent of all FIG &mdash; 600 million of the one billion tokens that will ever exist &mdash; is reserved for one group: the people who write the schemas the network comes to rely on. It is the largest single allocation by far, more than the founders&apos; and the DAO&apos;s combined. Figaro is built so that the people who extend it are its largest stakeholders.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The recipient is the schema&apos;s author &mdash; precisely, the wallet that first registered it on-chain. One schema, one author, one address. There is no committee to apply to and no proposal to write: if you author a schema and register it, you are in. Nothing else is asked.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                What earns is use &mdash; real, settled use. At each payout the protocol looks only at deals that actually closed, and asks of every schema: how many separate settled deals carried it, and across how many distinct pairs of counterparties. A schema written into a hundred agreements that never settle earns nothing. Only completed deals count.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                And it counts breadth over volume. A schema used once between each of fifty different counterparty pairs has widened the network further than the same schema used fifty times between the same two parties &mdash; so the formula weights the spread of counterparties above the raw count. Payment size never enters at all: moving a fortune and moving a few dollars count exactly the same.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Be clear-eyed about the timing. The reward is paid in three rounds &mdash; at years two, five, and nine after launch. The schedule is long on purpose: it rewards schemas that prove durable rather than a fast land-grab, and it is meant to outlast the people who started the protocol. Figaro is not yet on a public network; the first round is years away. This is a reason to build something real, not a quick payout.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                One last thing, and it is the whole point: the formula is fixed. It was set when the protocol was deployed and cannot be changed &mdash; not by the founders, not by a vote. Each round it is computed once, the same way for every author, and checked by a proof before any FIG can be claimed. No single author can take more than fifteen percent of one round. No one decides who deserves what &mdash; the arithmetic does.
            </p>
        </section>
    );
}

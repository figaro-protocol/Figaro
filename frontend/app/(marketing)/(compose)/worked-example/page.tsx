import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

// A PROCESS STORY, not a capital table (maintainer ruling, 2026-08-24). Every
// figure here is stated PER PARTY in the deterrent register — "twice the value
// the chain carries at its link, returned at settlement". Never introduce an
// aggregate total-locked figure, a bond-to-fee multiple, or the word "capital":
// a stake is a deterrent its owner posts against itself, and summing deterrents
// across parties produces a number that means nothing and reads as a cost.
//
// The numbers are the arithmetic of FigaroCore.commit (src/kernel/FigaroCore.sol
// :208-209): the buyer is pulled payment×2 at EVERY commit; each seller is
// pulled expectedCumulativeValue×2. 300 + 120 gives seller stakes 600 and 840
// and a buyer stake of 840. They are the values of THIS narrated deal, not a
// published price — the shipped assembly stores no amounts (price is a
// checkout input).
//
// The shipped `Freelance value chain` assembly (assemblies/freelancer-value-chain.json)
// carries THREE sellers — a lead and two contributors. The story follows two so
// the arithmetic stays on one line, and says so.
export const metadata: Metadata = withOg({
    title: "Worked example — Figaro Protocol",
    description:
        "A buyer commissions a deliverable; the agent that takes it draws a second agent into the same process as a co-equal bonded seller. What each party stakes, how the work moves, and what one resolution settles.",
});

export default function WorkedExample() {
    return (
        <>
            <div className="container mx-auto px-6 pt-8">
                <Breadcrumb
                    items={[
                        { label: "Build", href: "/spec" },
                        { label: "Worked example" },
                    ]}
                />
            </div>
            <MarketingHero
                title="Two agents, one process."
                lead={
                    <>
                        A buyer commissions a piece of work. The agent that takes it needs a
                        second pair of hands, so it draws another agent into the same process as
                        an equal partner &mdash; not a subcontractor paid out of its own pocket,
                        not a hire, not a company either of them had to form. Both are wallets.
                        When the buyer confirms, both are paid in the same transaction.
                    </>
                }
            />

            <MarketingSection title="How the process forms.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The buyer opens the process by committing the first order: the lead agent&apos;s
                    deliverable, at 300 in whichever token the two of them chose to settle in. The
                    lead agent needs a contributor &mdash; a translator, an illustrator, a session
                    musician, another model &mdash; and rather than paying for one privately, it
                    publishes a second order at 120 that the contributor signs into the same
                    process. Two orders, one buyer, one settlement.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The shape is the published <em>Freelance value chain</em> assembly, which
                    carries three sellers &mdash; a lead and two contributors. This telling follows
                    two so the arithmetic stays on one line; the shape holds for as many
                    contributors as the work needs, and the reading below does not change when a
                    third joins. It sits among the registered shapes on{" "}
                    <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>,
                    where anyone can open it or fork it.
                </p>
            </MarketingSection>

            <MarketingSection title="What each party stakes.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Every party stakes twice the value the chain carries at its own link, and every
                    unit of it comes back at settlement. Stated per party, for this deal:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">The lead agent stakes 600.</strong> Twice the 300 the chain carries when it commits.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The contributor stakes 840.</strong> Twice the 420 the chain carries when <em>it</em> commits &mdash; because by then the chain carries the lead&apos;s work as well as its own.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The buyer stakes 840.</strong> Twice each payment, posted as each order joins the process.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    None of that is a fee and none of it is spent. A stake is a deterrent its owner
                    posts against itself: it never moves to the other side, and it is returned in
                    the same transaction that pays everyone. Which is why the contributor &mdash;
                    the party earning the smallest share &mdash; posts the largest seller&apos;s
                    stake, and that is the point rather than a quirk: whoever commits last is
                    carrying everyone&apos;s work forward, and stands behind all of it.
                </p>
            </MarketingSection>

            <MarketingSection title="How it runs, and how it ends.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Work moves over the encrypted hand-off channel the assembly composes, one per
                    order: the contributor delivers to the lead, the lead delivers to the buyer,
                    each hand-off attested against its own order. Nobody supervises anybody. The
                    lead has its own stake riding on the contributor&apos;s delivery and the
                    contributor has its own riding on the lead&apos;s &mdash; and nobody is paid
                    until the buyer resolves, so a leg that falls short is one the other party
                    wants put right before that happens. Remedies are negotiated while everyone
                    still has something at stake; the{" "}
                    <Link href="/faq#counterparty" className="text-ink-heading font-medium hover:underline">FAQ</Link>{" "}
                    has the long version, including what it costs when a party simply disappears.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    When the buyer confirms, one call settles the whole process: 300 to the lead,
                    120 to the contributor, and 600, 840 and 840 back to the parties that posted
                    them &mdash; together, in the same transaction, or not at all. Then the process
                    is over, and there is nothing left standing: no company, no account, no
                    standing relationship either agent has to maintain in order to work with the
                    other again tomorrow.
                </p>
            </MarketingSection>

            <MarketingSection title="Nothing here is about freelancing." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The same shape carries any digital value chain &mdash; a data pipeline whose
                    stages each add something, a research task split across models, a render queue,
                    a translation passed down a line of hands. The participants can be people,
                    software, or a mix of both, because the kernel reads a signature and never asks
                    what produced it; the whole of that argument is on{" "}
                    <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    And this assembly is one shape, published early, by one author. What the
                    protocol is built to reward is the next one: whoever composes the shape a
                    market ends up trading through draws from the reserve set aside for exactly
                    that (<Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards for authors</Link>).
                    The worked example is a start, not a catalogue.
                </p>
            </MarketingSection>
        </>
    );
}

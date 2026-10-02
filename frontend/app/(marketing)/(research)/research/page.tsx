import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Research — Figaro Protocol",
    description:
        "The arguments, proofs and checks behind Figaro, read as a cryptoeconomic system: the papers by discipline and by industry, the mechanism, the six invariants, security, and the data a trade leaves.",
});

// THE RESEARCH LANDING — the door of whoever examines the protocol before
// trusting it. Its shape is the Core landing's (`/core`): one declarative
// sentence per subject as its heading, one paragraph as its card, one button
// to the page that owns the how — the working groups, the mechanism, the
// invariants, security, the evidence, the index by industry. The papers are
// reached through Working Groups, the corpus's one doorway. A comprehension
// gap found by any tester is closed on the page a card points to, never by
// adding prose here.
const SUBJECTS: { line: string; body: string; cta: string; href: string }[] = [
    {
        line: "The papers are sorted into the eight disciplines of cryptoeconomics.",
        body: "Three come first whatever the reader's discipline: the whole system, the equilibrium, and what the verification of the contracts covers. After them, the group nearest the reader's own field.",
        cta: "Working Groups",
        href: "/working-groups",
    },
    {
        line: "Cooperation is the equilibrium on every order.",
        body: "Each party bonds before the trade, only the buyer resolves, and resolution pays every seller and refunds every bond at once. After performance the buyer strictly prefers resolving, and given that, performing is each seller's best response.",
        cta: "Mechanism",
        href: "/kernel",
    },
    {
        line: "Six invariants state what the Core enforces on every process.",
        body: "They are asymmetric bonding, cumulative bonding, buyer dominance, atomic resolution, immutable evidence and no escape hatches. The page states each with what it means for a party to a trade.",
        cta: "Invariants",
        href: "/invariants",
    },
    {
        line: "What is proved and what is checked is stated bench by bench.",
        body: "The page sets out seven independent verification benches, what each covers and what it cannot reach, and the status of the external audit. It also points to the two checks anyone can run, outside this site, on what they are asked to sign.",
        cta: "Security",
        href: "/security",
    },
    {
        line: "Every trade leaves data for regulatory, legal, fiscal and market-making use first.",
        body: "On-chain, each trade's fingerprint is public: who moved what, to whom, in which token, and whether it resolved. The page shows which rows the chain enforced and which a member only declared, and how the parties keep their own detail sealed, disclose it or sell it.",
        cta: "Evidence",
        href: "/data",
    },
    {
        line: "A reader arriving from an industry starts at the papers that name it.",
        body: "The index runs from container shipping and air service to e-invoicing and tax, data markets and AI agents. Each entry opens the papers that treat it.",
        cta: "By industry",
        href: "/working-groups#index",
    },
];

export default function ResearchDoor() {
    return (
        <>
            <MarketingHero
                title="Research"
                lead={
                    <>
                        The arguments, proofs and checks behind Figaro, a decentralized, permissionless protocol, are set out here to be examined before anything is trusted. Read through the field&apos;s own definitions, Figaro is a cryptoeconomic system, and{" "}
                        <Link href="/papers/figaro-as-a-cryptoeconomic-system" className="text-ink-heading font-medium hover:underline">
                            Figaro as a Cryptoeconomic System
                        </Link>
                        , the paper that makes that reading, is the first to read.
                    </>
                }
            />

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
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
        </>
    );
}

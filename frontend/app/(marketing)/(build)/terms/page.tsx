import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Build — Figaro Protocol",
    description:
        "Publish clauses and assemblies for anyone to compose, and be rewarded for the use real trades make of them; the Core is deployed once, decentralized and permissionless, and anyone builds above it.",
});

// THE BUILD LANDING — the door of whoever writes and publishes what trades are
// made on. Its shape is the Core landing's (`/core`): one declarative sentence
// per subject as its heading, one paragraph as its card, one button to the
// page that owns the how — the builder documentation, clauses, assemblies,
// the code, agents, designer rewards — then one line on what is proved and
// checked. The builder documentation is the docs-site, a separate build under
// `/docs` on the same host, so its button is a plain anchor. A comprehension
// gap found by any tester is closed on the page a card points to, never by
// adding prose here.
const SUBJECTS: { line: string; body: string; cta: string; href: string; external?: boolean }[] = [
    {
        line: "The builder documentation holds the how.",
        body: "It covers the contracts, clauses, composition, scaling, the SDK, agents and verification. Each page is rendered from its source in the repository.",
        cta: "Builder documentation",
        href: "/docs/",
        external: true,
    },
    {
        line: "A clause is one term of an agreement, written once for anyone to compose.",
        body: "A clause defines one relationship, between a buyer and a seller or between two sellers, such as carriage, applicable law or the terms on which data is licensed. Its spec is public and its hash is registered on-chain.",
        cta: "Clauses",
        href: "/clauses",
    },
    {
        line: "An assembly composes agreements into one reusable design of a process.",
        body: "It states who takes part, in what order and under which terms, and it composes with the chain's other contracts, such as a swap or a payment splitter. Sellers bind the assemblies they trade under, and buyers choose among them.",
        cta: "Assemblies",
        href: "/assemblies",
    },
    {
        line: "Four smart contracts, decentralized and permissionless, carry every trade.",
        body: "A process built on them makes a stranger's promise good before the trade, where the firm, the platform and the court of first resort make it good after. It displaces them, but does not completely substitute them.",
        cta: "Code",
        href: "/core",
    },
    {
        line: "An agent builds and trades on the same footing as a person.",
        body: "Software holding a key buys, sells, designs clauses and assemblies, and operates a wallet under its holder's policy. Four open prompts and a policy signer are published for it.",
        cta: "Agents",
        href: "/agents",
    },
    {
        line: "A designer is rewarded for the use real trades make of its clauses and assemblies.",
        body: "Each resolved process counts once toward every clause and assembly its signed agreement committed, and a published formula turns those processes and the distinct sellers behind them into a share of a fixed reserve of florins. No vote allocates the reward.",
        cta: "Designer Rewards",
        href: "/rpgf",
    },
];

export default function BuildDoor() {
    return (
        <>
            <MarketingHero
                title="Build"
                lead="You publish clauses, reusable terms of an agreement, and assemblies, reusable designs of a process, for anyone to compose, and you are rewarded for the use real trades make of them. The Core is deployed once, decentralized and permissionless, and anyone builds above it."
            />

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {SUBJECTS.map((s) => (
                        <div key={s.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{s.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed grow">{s.body}</p>
                            <div className="mt-4">
                                <CtaLink href={s.href} external={s.external}>{s.cta}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-12 border-t border-default pt-8">
                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                        The equilibrium is proved, and its best-response inequalities are checked again in a proof assistant, separately from the code; six further benches check the contracts. What each covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                </div>
            </section>
        </>
    );
}

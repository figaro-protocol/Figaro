import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Build — Figaro Protocol",
    description:
        "Build a process, be rewarded each time it is used. A clause is one term of an agreement. An assembly composes agreements into a process anyone can run. Every resolved process is counted, and the count rewards its designers in florins.",
});

// THE BUILD LANDING — for designers, and nothing else: write a clause, compose
// an assembly, read the data a process leaves, and be rewarded for use. Its
// shape is the home page's: the tagline, the two buttons, the three bullets that
// climb the ladder — clause, agreement, assembly, process — then one card per
// surface, each its paragraph and the one button that opens its page. The
// registries are not a card: a clause is anchored in the clause registry and an
// assembly in the assembly registry, and each card says so. A comprehension
// gap found by any tester is closed on the page a card points to, never by
// adding prose here.
const LADDER: string[] = [
    "A clause is one term of an agreement.",
    "An assembly composes agreements into a process anyone can run.",
    "Every resolved process is counted, and the count rewards its designers.",
];

const SURFACES: { title: string; body: string; cta: string; href: string }[] = [
    {
        title: "Clauses.",
        body: "A clause is one term. Write it as a JSON spec, pin it, and anchor its hash in the on-chain clause registry with a small reclaimable ETH stake. A clause the network has never seen resolves through the proof path with zero code.",
        cta: "Clauses",
        href: "/clauses",
    },
    {
        title: "Assemblies.",
        body: "An assembly composes clauses into agreements, and agreements into one process. Pin it and anchor its hash in the on-chain assembly registry with a small reclaimable ETH stake. It composes further with any other smart contract on the network. A published assembly is a process anyone, anywhere, can coordinate around, and anyone can fork.",
        cta: "Assemblies",
        href: "/assemblies",
    },
    {
        title: "Data.",
        body: "A process is transparent and verifiable at both ends. At commit, the chain holds the merkle root, or hash, of the signed agreement. What the parties attest in between is signed evidence they hold, tied to the process by its hash. The aggregate map is public; the detail is the parties' own, to keep sealed or to sell on their own terms.",
        cta: "Read the data",
        href: "/data",
    },
    {
        title: "The SDK.",
        body: "TypeScript, published on npm. It reads the chain, reconstructs any process from its events, plans a checkout, validates a clause against its spec, and signs through a policy daemon that holds the rules and never the key.",
        cta: "API reference",
        href: "/sdk-api",
    },
    {
        title: "Rewards.",
        body: "The florin is the protocol's own ERC-20 token: a Schelling point that carries no rights of any kind. Every resolved process is counted once against each clause and assembly it carried to reward designers pro rata over nine annual periods. One rule scores every clause and assembly: the resolved processes that carried it, and the distinct sellers behind them.",
        cta: "Rewards",
        href: "/rpgf",
    },
];

export default function BuildDoor() {
    return (
        <>
            <MarketingHero title="Figaro: build a process, be rewarded each time it is used">
                <div className="flex flex-wrap gap-4 mb-8">
                    <CtaLink href="/clauses/register">Register a clause</CtaLink>
                    <CtaLink href="/assemblies/designer">Design an assembly</CtaLink>
                </div>
                <ul className="text-body-lead text-ink-muted max-w-2xl list-disc pl-6 space-y-2">
                    {LADDER.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {SURFACES.map((s) => (
                        <div key={s.href} className="flex flex-col">
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{s.title}</h2>
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

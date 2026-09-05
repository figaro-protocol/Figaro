import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol — My word is my bond",
    description:
        "Figaro is permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade. The bond is twice the payment. Breaking the trade costs more than keeping it.",
});

// HOME IS A ROUTER, NEVER A DOCUMENT: the summary line, one sentence of the
// mechanism, the proposition in blocks, the six doors — one per landing page,
// one door per destination — and the six checks the code passes on every
// commit. Each door's line is in its reader's words; the landing page it
// opens carries the pillar. A comprehension gap found by any probe is closed
// on the landing page or its owner page, never by adding prose here.
//
// THE PROPOSITION is the maintainer's, sentence for sentence, in the lexicon's
// nouns; the hero carries its first half, the blocks the rest.
const PROPOSITION: string[] = [
    "No bank, platform, court, lawyer, boss, or company is needed to enforce the trade. The only charge is gas; the bonds are refunded when the buyer resolves.",
    "The seller receives the whole payment. Nobody takes a cut.",
    "The buyer and the seller keep their own data, the trail of every trade they made, and their own agreements.",
    "Anyone with a wallet can trade.",
    "Anyone can publish the terms of an agreement and be rewarded based on its use. Trades are in any ERC-20 token. The reward is in florins, the protocol's native token.",
];

// THE SIX CHECKS, each with the count the tree derives — the security-counts
// guard recomputes the four counted benches and fails the commit when a
// number here drifts; TLA+ names models and Lean 4 names the result proved.
const CHECKS: { name: string; count: string }[] = [
    { name: "Foundry", count: "302 test functions" },
    { name: "Halmos", count: "32 symbolic-execution properties" },
    { name: "Certora", count: "37 formal rules across six CVL specs" },
    { name: "TLA+", count: "four protocol state machines, model-checked" },
    { name: "Echidna", count: "15 property-based fuzzing targets" },
    { name: "Lean 4", count: "the bonded chain\u2019s equilibrium, proved" },
];
const DOORS: { href: string; name: string; line: string }[] = [
    { href: "/use", name: "Use it", line: "Sell or buy anything and be paid in full when the buyer resolves, in the token you choose." },
    { href: "/build", name: "Build on it", line: "Publish the terms of trade, compose them into assemblies, and be paid in florins when they are used." },
    { href: "/core", name: "Check the core", line: "Two functions and no owner: the kernel, the attestations, and the batch verifier, with the proofs behind them." },
    { href: "/research", name: "Read the research", line: "The papers: the equilibrium, the firm, the market, the ledger, the law, and the industries that coordinate at scale." },
    { href: "/data", name: "Read the data", line: "What every trade leaves: the public map, your books, and your evidence, on your terms." },
    { href: "/agents", name: "Run an agent", line: "Software trades, publishes, and resolves on the same terms as a person: the same bond, the same registries." },
];

export default function Home() {
    return (
        <>
            <MarketingHero
                title="My word is my bond"
                lead={
                    <>
                        Figaro is permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade. The bond is twice the payment. Breaking the trade costs more than keeping it.
                    </>
                }
            />

            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 border-t border-default pt-8">
                    {PROPOSITION.map((line) => (
                        <p key={line} className="text-sm text-ink-body leading-relaxed">{line}</p>
                    ))}
                </div>
            </section>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    {DOORS.map((d) => (
                        <div key={d.href}>
                            <h2 className="text-heading-h3 text-ink-heading mb-2">
                                <Link href={d.href} className="hover:underline">
                                    {d.name}
                                </Link>
                            </h2>
                            <p className="text-base text-ink-body leading-relaxed">{d.line}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-12 border-t border-default pt-8">
                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mb-4">
                        The code is not yet audited by an outside firm. It is checked six independent ways on every commit:
                    </p>
                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3 text-sm">
                        {CHECKS.map((c) => (
                            <div key={c.name}>
                                <dt className="text-ink-heading font-medium">{c.name}</dt>
                                <dd className="text-ink-muted">{c.count}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-sm text-ink-muted leading-relaxed mt-4">
                        What each check covers and what it cannot reach:{" "}
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

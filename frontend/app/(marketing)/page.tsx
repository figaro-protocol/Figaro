import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol — My word is my bond",
    description:
        "Figaro is permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade. The bond is twice the payment. Walking away costs more than finishing. The only cost is gas.",
});

// HOME IS A ROUTER, NEVER A DOCUMENT: the summary line, one sentence of the
// mechanism, and the six doors — one per landing page, one door per
// destination. Each door's line is in its reader's words; the landing page it
// opens carries the pillar. A comprehension gap found by any probe is closed
// on the landing page or its owner page, never by adding prose here.
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
                        Figaro is permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade. The bond is twice the payment. Walking away costs more than finishing. The only cost is gas.
                    </>
                }
            />

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
                <p className="text-sm text-ink-muted leading-relaxed mt-12 max-w-2xl">
                    Not yet audited by an outside firm. The code is checked six independent ways on every commit:{" "}
                    <Link href="/security" className="text-ink-heading font-medium hover:underline">
                        Security
                    </Link>
                    .
                </p>
            </section>
        </>
    );
}

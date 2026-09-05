import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Who is behind Figaro — Figaro Protocol",
    description:
        "Nothing is hidden, and it does not matter: Figaro is a pseudonym, the way the creator of Bitcoin used one. What counts is what anyone can verify — the code, the proofs, the chain — and the objective: permissionless, decentralized trade on a blockchain.",
});

// FOOTER CHROME, never a door: the answer to "who is behind this", which every
// reader asks and the design answers without a name. Pseudonymous by design —
// no person, entity, or team is named on any surface; every paper is signed
// Figaro. The purpose statement lives here, where the site says what changes.
export default function About() {
    return (
        <>
            <MarketingHero
                title="Who is behind Figaro."
                lead={
                    <>
                        Nothing is hidden, and it does not matter. Figaro is a pseudonym, the way the creator of Bitcoin used one. Whoever wants to find out can; nothing about the protocol depends on the answer. What counts is what anyone can verify without asking: the code, the proofs, and the chain.
                    </>
                }
            />

            <MarketingSection title="What the name signs.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Every paper is signed Figaro. The code is published under the MIT license, on <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">GitHub</a>, for anyone to read, run, and fork. Figaro&reg; is a registered trademark, so that the name means this protocol and no other. The contracts have no owner, no admin, and no pause: nobody, named or not, can reach into a trade.
                </p>
            </MarketingSection>

            <MarketingSection title="The objective.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade; the bond is twice the payment, so breaking the trade costs more than keeping it, and no bank, platform, court, lawyer, or company is needed to enforce it. The seller receives the whole payment. The buyer and the seller keep their own data and their own agreements. Anyone with a wallet can trade, and anyone can publish the terms of an agreement and be paid in florins each time those terms are used.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mt-5">
                    What matters is that it is safe to build on, and that nobody has to be a software engineer to use it. With the barrier to a clause, an agreement, or an assembly this low, just about anyone can change an industry, a process, or a market with very little investment, and keep doing so. Figaro is built for the young generations to rebuild the Internet in a self-sovereign manner.
                </p>
            </MarketingSection>

            <MarketingSection title="What to check instead of a name." bottomPad="wide">
                <ul className="space-y-3 text-base text-ink-body leading-relaxed max-w-2xl">
                    <li>&mdash; The code and the six checks it passes on every commit, on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>.</li>
                    <li>&mdash; The kernel, two functions and no owner, on <Link href="/core" className="text-ink-heading font-medium hover:underline">Core</Link>.</li>
                    <li>&mdash; The public registries every clause, assembly, and member is published to, on <Link href="/registries" className="text-ink-heading font-medium hover:underline">Registries</Link>.</li>
                    <li>&mdash; The florin&apos;s supply and who holds what, on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>.</li>
                </ul>
            </MarketingSection>
        </>
    );
}

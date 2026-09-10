import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Who is behind Figaro — Figaro Protocol",
    description:
        "Figaro is a pseudonym, the way the creator of Bitcoin used one. What stands behind the protocol is what anyone can verify — the code, the proofs, the chain — and the objective: permissionless, decentralized trade on a blockchain.",
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
                        Figaro is a pseudonym, the way the creator of Bitcoin used one. Who holds it changes nothing a participant relies on: the contracts are decentralized and permissionless, and no holder of the name can reach into a trade. What stands behind the protocol is what anyone can verify without asking: the code, the proofs, and the chain.
                    </>
                }
            />

            <MarketingSection title="What the name signs.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Every paper carries the same byline, Figaro, with the model that drafted it named beside it, Claude (Anthropic); no person signs. The code is published under the MIT license, on <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">GitHub</a>, for anyone to read, run, and fork. Figaro&reg; is a registered trademark, so that the name means this protocol and no other. The contracts are decentralized and permissionless: nobody, named or not, can reach into a trade. The registries are on-chain and this site is one interface to them; anyone can build another against the same registries. Every participant holds their own data, their own agreements, and the trail of their own trades.
                </p>
            </MarketingSection>

            <MarketingSection title="The objective.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Permissionless, decentralized trade on a blockchain. Two strangers can trade safely because each locks a bond in a smart contract before the trade; the bond is twice the payment, and for each seller in a chain twice the value the trade has accumulated through its link, so breaking the trade costs more than keeping it, and no bank, platform, court, lawyer, boss, or company is needed to enforce it. A court, if it comes to that, rules afterwards on the same data; nothing reaches into the trade. The seller receives the whole payment. The buyer and the seller keep their own data and their own agreements. Anyone with a wallet can trade, in any ERC-20 token. Anyone can publish the terms of an agreement and be rewarded based on its use; the reward is in florins, the protocol&apos;s native token.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mt-5">
                    The design is measured by two things: safe to build on, and usable without being a software engineer. A clause, an agreement, or an assembly takes a wallet, a spec, and a reclaimable stake &mdash; a barrier low enough that one designer can change how an industry, a process, or a market coordinates, and keep doing so. Figaro is built for the generations that will rebuild the Internet self-sovereign: every wallet its own, every agreement its parties&apos;, every record verifiable by anyone.
                </p>
            </MarketingSection>

            <MarketingSection title="What to check instead of a name." bottomPad="wide">
                <ul className="space-y-3 text-base text-ink-body leading-relaxed max-w-2xl">
                    <li>&mdash; The code and the seven checks it passes on every commit, on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>.</li>
                    <li>&mdash; The kernel, two functions, decentralized and permissionless, on <Link href="/core" className="text-ink-heading font-medium hover:underline">Core</Link>.</li>
                    <li>&mdash; The public registries every clause, assembly, and member is published to, on <Link href="/registries" className="text-ink-heading font-medium hover:underline">Registries</Link>.</li>
                    <li>&mdash; The florin&apos;s supply and who holds what, on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>.</li>
                </ul>
            </MarketingSection>
        </>
    );
}

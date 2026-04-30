import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "Composability — Figaro Protocol",
    description:
        "Composability is a derived property of the kernel's narrowness. The kernel takes no position on currency, jurisdiction, identity, or role structure, so a wide range of economic arrangements can be expressed on top. Extensions preserve the bonding equilibrium under the coordinator pattern.",
};

export default function Composability() {
    return (
        <>
            <MarketingHero
                eyebrow="Composability"
                title="The kernel is narrow so the graph can be anything."
                lead={
                    <>
                        Composability is a derived property of <code>FigaroCore</code>&apos;s deliberate narrowness. The kernel takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Every other question lives above &mdash; permissionless to add, permissionless to fork, equally bound by the same Nash equilibrium.
                    </>
                }
            />

            <MarketingSection eyebrow="The property" title="Anyone can express anything; the equilibrium does not care.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Because the kernel only enforces bonded-commitment settlement, the graph above it is unconstrained. A market-liberal graph where every role is priced at auction; a cooperative graph where surplus routes back to contributors via programmatic shares; an Islamic-finance graph that forbids riba and structures returns through bonded profit-sharing; a mutual-aid graph where bonds are reciprocal rather than monetary, denominated in a community currency &mdash; all use the same kernel.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The ideological commitments live in the assembly &mdash; in which roles it defines, which mechanisms it invokes, which clauses it requires. The kernel is ideologically agnostic; the graph is the politics. The mechanism derivation lives at <Link href="/protocol" className="underline">/protocol</Link>; the academic frame at <Link href="/cryptoeconomics" className="underline">/cryptoeconomics</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="How extensions preserve the equilibrium" title="The coordinator pattern.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Any internal exit path weakens the Nash equilibrium (Paper A, Theorem 4.7). So extensions live <em>outside</em> the kernel and compose via the coordinator pattern: the external reads kernel state and emits its own evidence, but never writes to kernel state, never reverses a resolution, and never controls a bond. Three sufficient conditions; the kernel still enforces its invariants while the new contract proves its own.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The doctrine is laid out in three tiers &mdash; compose against existing primitives, add a typed clause, add a mechanism &mdash; with progressively wider blast radius and progressively heavier responsibility. The full breakdown lives at{" "}
                    <Link href="/builders" className="underline">Builders</Link>{" "}
                    alongside the tools that operate at each tier. The doctrine itself is at{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        PROTOCOL_EXTENSION_DOCTRINE.md
                    </a>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="The security boundary" title="What the kernel guarantees stays guaranteed.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Across every assembly that composes against the kernel, the same invariants hold: asymmetric bonding (2&times; payment / 2&times; cumulative value), progressive collateralization across sub-orders, buyer-dominant atomic resolution, merkle-bound attestation receipts against the signed agreement, validator-gated attestation dispatch, token conservation. These are kernel-enforced and apply uniformly &mdash; a market-liberal assembly and a mutual-aid assembly both inherit them.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    What sits outside the kernel is the builder&apos;s responsibility: assembly correctness, custom mechanism contracts, custom schema content, role filling and identity, and the claims an assembly&apos;s UI makes. The full layered enforcement model is on{" "}
                    <Link href="/protocol#enforcement" className="underline">Protocol &mdash; Enforcement</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Where the work happens" bottomPad="extra">
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li>
                        <Link href="/builders" className="text-black font-medium hover:underline">Builders</Link>
                        {" — "}
                        the tools surface: composition canvas, authoring studio, registered assemblies, prototype shells, and the contract / schema / SDK / console entries.
                    </li>
                    <li>
                        <Link href="/spec" className="text-black font-medium hover:underline">Specifications</Link>
                        {" — "}
                        the canonical on-chain surface: kernel, attestation coordinator, schema registry, validators in force, token, batch verifier, optional protocol contracts.
                    </li>
                    <li>
                        <Link href="/schemas" className="text-black font-medium hover:underline">Schemas</Link>
                        {" — "}
                        the three-layer validation architecture (TypeScript + on-chain Solidity, with an SP1 Rust mirror pending) and the eighteen reference schemas in force.
                    </li>
                    <li>
                        <Link href="/integrate" className="text-black font-medium hover:underline">Integrate</Link>
                        {" — "}
                        <code>@figaro/core</code> SDK: ABIs, event parsers, deterministic state reconstruction, action queue, schema encoders, and the compositional surfaces external systems can plug into.
                    </li>
                    <li>
                        <Link href="/local-commerce" className="text-black font-medium hover:underline">Local Commerce</Link>
                        {" — "}
                        a worked reference assembly composing the kernel + Dutch auction + attestation coordinator + operator registry into a three-role bonded process. Generic across food, retail, and on-demand service flows.
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

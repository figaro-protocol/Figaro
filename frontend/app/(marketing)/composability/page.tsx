import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "Composability — Figaro Protocol",
    description:
        "Composability is what the kernel's narrowness produces. Anyone can express any economic arrangement above the kernel; the equilibrium does not care. The builder-tier architecture (coordinator pattern, three tiers of extension, security boundary) lives at /builders/composability.",
};

export default function Composability() {
    return (
        <>
            <MarketingHero
                eyebrow="Composability"
                title="What the kernel's narrowness produces."
                lead={
                    <>
                        <code>FigaroCore</code> takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Every other question lives above &mdash; permissionless to add, permissionless to fork, equally bound by the same Nash equilibrium. The mechanism derivation is on <Link href="/protocol" className="underline hover:text-black">Protocol</Link>; the academic frame on <Link href="/cryptoeconomics" className="underline hover:text-black">Cryptoeconomics</Link>; identity / lineage / posture on <Link href="/about" className="underline hover:text-black">About</Link>.
                    </>
                }
            />

            <MarketingSection eyebrow="The property" title="Anyone can express anything; the equilibrium does not care.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Because the kernel only enforces bonded-commitment settlement, the graph above it is unconstrained. A market-liberal graph where every role is priced at auction, a cooperative graph where surplus routes back to contributors via programmatic shares, a mutual-aid graph where bonds are reciprocal rather than monetary &mdash; all use the same kernel. The ideological commitments live in the assembly, not in <code>FigaroCore</code>.
                </p>
                <p className="text-sm text-gray-600">
                    Full multi-graph treatment, including the political-posture frame, on{" "}
                    <Link href="/about" className="underline hover:text-black">About &mdash; Ideological agnosticism</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Builder architecture" title="The pattern that preserves the equilibrium.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The property above is what the kernel produces. The architecture that preserves it &mdash; the coordinator pattern&apos;s three sufficient conditions, the three tiers of extension, the security boundary that holds across them &mdash; is builder-tier reading and lives on its own page.
                </p>
                <p className="text-sm">
                    <Link href="/builders/composability" className="text-black font-semibold underline hover:text-gray-700">
                        Builder architecture &rarr;
                    </Link>
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Read next" bottomPad="wide">
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li>
                        <Link href="/protocol" className="text-black font-medium hover:underline">Protocol</Link>
                        {" — "}
                        the two mechanisms in plain language; the contract-law mapping; the three layers of enforcement.
                    </li>
                    <li>
                        <Link href="/cryptoeconomics" className="text-black font-medium hover:underline">Cryptoeconomics</Link>
                        {" — "}
                        the Voshmgir &amp; Zargham eight-discipline taxonomy and the paper portfolio organized along it.
                    </li>
                    <li>
                        <Link href="/local-commerce" className="text-black font-medium hover:underline">Local Commerce</Link>
                        {" — "}
                        a worked reference assembly. Three roles, one root commitment, two sub-orders, atomic settlement.
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

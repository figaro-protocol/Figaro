import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Core — Figaro Protocol",
    description:
        "Three smart contracts, no owner. Two strangers bond, trade, and are paid without anyone enforcing the agreement. Goods, services, work, or data, in any ERC-20 token. The only cost is gas.",
});

// THE CORE DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function CoreDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro Core: a self-enforcing trade kernel"
                lead={
                    <>
                        Three smart contracts, no owner. Two strangers bond, trade, and are paid without anyone enforcing the agreement. Goods, services, work, or data, in any ERC-20 token. The only cost is gas.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="/spec">Read the spec</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">commit: two signatures, two bonds, each twice the payment.</p>
                    <p className="text-sm text-ink-body leading-relaxed">resolveProcess: the buyer&apos;s one call pays every seller and refunds every bond.</p>
                    <p className="text-sm text-ink-body leading-relaxed">No owner, no cut, no upgrade, no pause, no oracle.</p>
                </div>
            </section>
            <MarketingSection title="One trade, end to end.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A bowl for 50. The buyer locks 100, the cook locks 100. The bowl arrives. The buyer calls resolve: the cook holds 150, the buyer holds 50 again. A process carries one buyer and any number of sellers, each bonded on the value through its own order, all paid by the same call.
                </p>
            </MarketingSection>
            <MarketingSection title="If something goes wrong.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Only the buyer resolves, and nobody can resolve for them. Remedies happen before that call: replace the goods, return part of the payment, or go to the arbitration forum named in the agreement. If the buyer never resolves, nothing moves: both bonds stay locked, the buyer&apos;s at twice what they owed. <Link href="/faq" className="text-ink-heading font-medium hover:underline">What can go wrong</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="FigaroCore.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Two functions. Nine signed fields. One ERC-20 per process. Resolving costs about 38,000 gas plus 23,000 per order. <Link href="/kernel" className="text-ink-heading font-medium hover:underline">The kernel</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="AttestationCoordinator.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A party attests to a fact about an open order, and must prove the clause it attests under is a leaf of the agreement it signed. The chain holds hashes; the content stays with the parties. <Link href="/attestations" className="text-ink-heading font-medium hover:underline">Attestations</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="FigaroBatchVerifier.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A validity proof carries a batch of commits, resolutions, and attestations in one transaction. A never-seen clause resolves with zero code changes. <Link href="/spec" className="text-ink-heading font-medium hover:underline">Spec</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Proven.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Cooperating is each side&apos;s best move, machine-checked in Lean 4. The contracts are checked by Foundry, Halmos, Certora, TLA+, and Echidna on every commit. Not yet audited by an outside firm. <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Build on it.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    MIT. Any EVM chain. Registries, tokens, marketplaces, agents, and data markets are built above this layer by anyone, under their own name. <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">Papers</Link>
                </p>
            </MarketingSection>
        </>
    );
}

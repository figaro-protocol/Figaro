import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Build — Figaro Protocol",
    description:
        "The core is a proven, ownerless kernel: two functions, commit and resolve. Everything a trade needs above it is published by anyone, to public registries, and the protocol pays the designer in florins each time a trade uses it. No permission, no platform, no revenue share to anyone.",
});

// THE BUILD DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function BuildDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro: build the market, get paid when it is used"
                lead={
                    <>
                        The core is a proven, ownerless kernel: two functions, commit and resolve. Everything a trade needs above it is published by anyone, to public registries, and the protocol pays the designer in florins each time a trade uses it. No permission, no platform, no revenue share to anyone.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="/clauses/register">Register a clause</CtaLink>
                    <CtaLink href="/assemblies/designer">Design an assembly</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">A clause is one term of an agreement.</p>
                    <p className="text-sm text-ink-body leading-relaxed">An assembly composes clauses into a whole trade anyone can run.</p>
                    <p className="text-sm text-ink-body leading-relaxed">Every trade that uses them is counted, and the count pays the designer.</p>
                </div>
            </section>
            <MarketingSection title="Clauses.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Applicable law, arbitration, acceptance criteria, incoterms, cold chain, hazmat, emissions, data licence, delivery, schedule. Write one as a JSON spec, pin it, anchor its hash with a small ETH stake. A never-seen clause resolves through the proof path with zero code. <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Assemblies.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Compose clauses into the shape of a trade: a kitchen and a courier, a lead freelancer and contributors, a six-party import chain, a data subscription. Fix the token, the law, the forum. Fork any published one. <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Registries.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Clauses, assemblies, and members each have their own on-chain registry: a hash, a URI, a stake, no owner. Everything else is derived from events by anyone. <Link href="/registries" className="text-ink-heading font-medium hover:underline">Registries</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="The SDK.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    TypeScript. Read the chain, reconstruct any process from its events, plan a checkout, validate a clause, sign through a policy daemon. <Link href="/spec" className="text-ink-heading font-medium hover:underline">SDK</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Get paid.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The florin is the protocol&apos;s own ERC-20 token: a unit strangers with no token in common can meet in, with no yield, no vote over trades, and no fee. Every resolved trade is counted once against each clause and assembly it carried, and 600 million florins of a fixed 1 billion pay designers pro rata over nine annual periods. No tag, no weighting, no cap. A DAO holds 300 million more for work the counter cannot see, and 100 million went at genesis to the founders and supporters as retroactive financing for the work already done &mdash; no ownership interest, no influence. <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards</Link>
                </p>
            </MarketingSection>
            <MarketingSection bottomPad="wide">
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                    Built on Figaro Core: two functions, no owner, cooperation proven in Lean 4, not yet audited by an outside firm. <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                </p>
            </MarketingSection>
        </>
    );
}

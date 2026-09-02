import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol — My word is my bond",
    description:
        "Every trade is a contract, and between strangers one part of it fails. Figaro makes a stranger's promise hold on its own — each side backs its word with a bond, and the game theory makes honoring the agreement the best strategy. Above that floor the whole contract rebuilds, self-sovereign: your terms, your data, your market's own token.",
});

// HOME IS THE WHOLE, TOLD ONCE, IN HOME-PAGE FORM — the repo's one arc as
// blocks, never prose: the problem and the mechanism get one full-width
// stroke each (a line or two, one button); the rebuild, sovereignty, the
// commons, and liveness tile a grid (one line, one text link each); the
// three audience doors close. Scan the headings alone and the story reads.
// POSITIVE form throughout. ONE DOOR PER DESTINATION across the page. A
// comprehension gap found by any probe is closed on the OWNER page its
// block points to, never by adding prose here.
export default function Home() {
    return (
        <>
            <MarketingHero
                title="My word is my bond"
                lead={
                    <>
                        One thin, ownerless layer that makes any trade between strangers safe &mdash; and everything above it buildable by anyone.
                    </>
                }
            />

            <MarketingSection title="Every trade is a contract">
                <p className="text-base text-ink-body leading-relaxed mb-6 max-w-2xl">
                    Between strangers one part fails: a promise is easy, and delivering it is what needs to be made credible. History&apos;s fix &mdash; a firm, a platform, a court in the middle &mdash; became the cost.
                </p>
                <CtaLink href="/why">Why this exists</CtaLink>
            </MarketingSection>

            <MarketingSection title="Figaro makes the promise hold on its own">
                <p className="text-base text-ink-body leading-relaxed mb-6 max-w-2xl">
                    Each side backs its word with a bond worth more than the trade, held by a contract nobody controls. The buyer closes when satisfied &mdash; everyone is paid and every bond refunded, at once. The game theory makes honoring the agreement the best strategy.
                </p>
                <CtaLink href="/kernel">See the mechanism</CtaLink>
            </MarketingSection>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10 border-t border-default pt-10">
                    <div>
                        <h2 className="text-heading-h3 text-ink-heading mb-2">The whole contract rebuilds above it</h2>
                        <p className="text-base text-ink-body leading-relaxed">
                            Terms are clauses anyone writes. Markets are assemblies anyone composes and reuses. A wallet is all it takes &mdash;{" "}
                            <Link href="/assemblies" className="text-ink-heading hover:underline">compose a market</Link>.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-heading-h3 text-ink-heading mb-2">Its users are self-sovereign</h2>
                        <p className="text-base text-ink-body leading-relaxed">
                            Your keys, censorship-resistant tokens, and your data: the aggregate map public, the detail yours to seal, show, or sell &mdash;{" "}
                            <Link href="/data" className="text-ink-heading hover:underline">your data, your terms</Link>.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-heading-h3 text-ink-heading mb-2">The commons pays its builders</h2>
                        <p className="text-base text-ink-body leading-relaxed">
                            One billion tokens, fixed. Six hundred million reserved for whoever writes what the world uses, paid by real use &mdash;{" "}
                            <Link href="/rpgf" className="text-ink-heading hover:underline">the rewards</Link>.
                        </p>
                    </div>
                </div>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-default pt-10">
                    <Link href="/local-commerce" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Use it</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            One trade, lived end to end &mdash; from first offer to the moment everyone is paid.
                        </p>
                    </Link>
                    <Link href="/spec" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Build on it</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            Write the terms of a market, publish them, and be paid whenever the world uses what you wrote.
                        </p>
                    </Link>
                    <Link href="/papers/asymmetric-bonding" className="group block">
                        <h2 className="text-heading-h3 text-ink-heading group-hover:underline">Check it</h2>
                        <p className="text-sm text-ink-muted mt-2 leading-relaxed">
                            The claims are theorems. Start with the asymmetric-bonding paper and read the proofs.
                        </p>
                    </Link>
                </div>
            </section>
        </>
    );
}

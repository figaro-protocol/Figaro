import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Data — Figaro Protocol",
    description:
        "A resolved trade leaves two traces. On the chain, a fingerprint: who moved what, to whom, in which token, and whether it resolved. With the parties, the detail: the agreement, the evidence, the books. The protocol holds only the first. The second is yours, pinned where you choose, disclosed when you choose, and sold on your terms if you choose.",
});

// THE DATA DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function DataDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro: the data every trade leaves"
                lead={
                    <>
                        A resolved trade leaves two traces. On the chain, a fingerprint: who moved what, to whom, in which token, and whether it resolved. With the parties, the detail: the agreement, the evidence, the books. The protocol holds only the first. The second is yours, pinned where you choose, disclosed when you choose, and sold on your terms if you choose.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="/data/explore">Open the data explorer</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">The map: every resolved trade, readable by anyone, no wallet, no account.</p>
                    <p className="text-sm text-ink-body leading-relaxed">Your books: each trade closes its own period; the balance sheet and the audit bundle come out of the trade itself.</p>
                    <p className="text-sm text-ink-body leading-relaxed">Your evidence: signed attestations any forum or court reads, with the fingerprint that ties them to the trade.</p>
                </div>
            </section>
            <MarketingSection title="For a regulator.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    What the chain holds is public by construction: every bond locked, every payment transferred, every resolution, timestamped and permanent. The explorer names what is protocol-enforced, what a member declared, and what a disclosure only fingerprints. Nothing here makes anyone compliant; it makes the data checkable. <Link href="/data/yours" className="text-ink-heading font-medium hover:underline">The map</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="For a court or a forum.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The chain keeps the fingerprint of the agreement and of each attestation, never the content. The parties hold the content and can prove any piece of it matches the fingerprint. A ruling reads the same data both sides hold. <Link href="/attestations" className="text-ink-heading font-medium hover:underline">Evidence</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="For your books and your taxes.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A trade is its own accounting entity: nothing is accrued, nothing is estimated, and the buyer&apos;s resolution is the closing entry. The fields an e-invoice needs, parties, date, lines, net amount, read off the data; the protocol files nothing and emits no invoice for you. <Link href="/audit" className="text-ink-heading font-medium hover:underline">Audit</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="For a market.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The public map is what a platform used to keep to itself: a neighbourhood&apos;s demand, a seller&apos;s resolution history, a route&apos;s reliability. It is open, and the network&apos;s own token pays the designers whose clauses and assemblies the mapped trades keep using. <Link href="/registries" className="text-ink-heading font-medium hover:underline">Registries</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="For sale, on your terms.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Letting a buyer into your detail is an ordinary bonded sale. A delivery that names its source trades carries a proof tying it to the exact resolved trades that produced it, so the buyer checks it is genuine without trusting you. <Link href="/data/yours" className="text-ink-heading font-medium hover:underline">Your data</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="For an agent.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Everything above is readable from the chain and the pinned documents with no account: an agent operating a wallet reconstructs any process from its events and verifies any document against its fingerprint before it signs. <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>
                </p>
            </MarketingSection>
            <MarketingSection bottomPad="wide">
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                    Analysis comes last. The data exist for regulation, law, tax, and market-making first.
                </p>
            </MarketingSection>
        </>
    );
}

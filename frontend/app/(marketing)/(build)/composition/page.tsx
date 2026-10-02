import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// One-screen marketing door: the hero states the two ways to compose; the
// technical detail (the four placements, the wired list, the one-token cost
// model) lives once in the builder documentation at /docs/protocol/composition.
// Do not restore that detail here — the door points to it, never forks it.
export const metadata: Metadata = withOg({
    title: "Composition — Figaro Protocol",
    description:
        "What composes with Figaro — an open category, not a catalogue.",
});

export default function Composes() {
    return (
        <>
            <MarketingHero
                title="What composes with Figaro."
                lead={
                    <>
                        Composition happens two ways: <strong>internally</strong>, where <Link href="/clauses" className="underline">clauses</Link> compose into agreements and agreements into <Link href="/assemblies" className="underline">assemblies</Link> &mdash; reusable designs of a trade, built over the core without touching it; and <strong>externally</strong>: on-chain, where a process plugs into the chain&apos;s other contracts, and off-chain, where the data a process leaves meets a legal or regulatory norm &mdash; an EU electronic invoice, ESG reporting, GDPR, taxation.
                    </>
                }
            />

            <MarketingSection title="An open category, not a catalogue.">
                <p className="text-sm text-ink-body leading-relaxed">
                    A process composes any on-chain contract that fits, all at once &mdash; a swap to fund a bond in a token you do not hold, storage and messaging while an order is live, a payout splitter after resolution, a dispute-resolution forum on the same record. The four places a contract can stand relative to the two signatures, the wired examples, and the one-token-per-process cost model are in the <a href="/docs/protocol/composition/" className="text-ink-heading font-medium hover:underline">builder documentation</a>.
                </p>
            </MarketingSection>
        </>
    );
}

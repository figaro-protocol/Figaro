import type { Metadata } from "next";
import Link from "next/link";
import { DraftsList } from "./_components/DraftsList";
import { PublishedList } from "./_components/PublishedList";
import { ClausesList } from "./_components/ClausesList";

export const metadata: Metadata = {
    title: "Designer — Figaro Protocol",
    description: "Compose a Figaro assembly on the DAG canvas. Drafts persist locally; publish to the on-chain AssemblyRegistry when ready.",
};

export default function DesignerLanding() {
    return (
        <div className="min-h-screen bg-canvas">
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    Compose an assembly.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl mb-4">
                    An assembly is a composition of roles, coordination mechanisms, and display views that use the Figaro kernel to coordinate a multi-party process.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Every assembly inherits the seven baseline graphs — capital flow (committed at buy time), geolocation, GHG, handoff, proximity, jurisdiction, and DAG topology — automatically. On top of the baseline, you extend the assembly DAG by spawning sub-orders from any node and choosing a fulfilment method per edge. Today the supported methods are consume-onsite, pickup, and three delivery variants — including Dutch-auction dispatch.
                </p>
                <div className="mt-8">
                    <Link
                        href="/builders/designer/new?fresh=1"
                        className="inline-flex rounded-tile border border-ink-heading bg-ink-heading text-paper px-5 py-2.5 text-sm font-semibold hover:bg-ink-primary"
                    >
                        Start a blank assembly
                    </Link>
                </div>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Your drafts
                </h2>
                <p className="text-sm text-ink-muted mb-6 max-w-2xl">
                    Designs you&apos;ve saved from the DAG editor. Drafts are kept in this browser&apos;s local storage; they don&apos;t leave your machine.
                </p>
                <DraftsList />
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Your published assemblies
                </h2>
                <p className="text-sm text-ink-muted mb-6 max-w-2xl">
                    Designs you&apos;ve published to the on-chain <code>AssemblyRegistry</code>. Reconstructed from <code>AssemblyRegistered</code> events filtered by your connected wallet.
                </p>
                <PublishedList />
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Your clauses
                </h2>
                <p className="text-sm text-ink-muted mb-6 max-w-2xl">
                    Clauses you&apos;ve registered on the on-chain <code>ClauseRegistry</code>. Reconstructed from <code>ClauseRegistered</code> events filtered by your connected wallet. Clauses are first-write-wins and immutable once bound to an <code>IClauseValidator</code>.
                </p>
                <ClausesList />
            </section>

        </div>
    );
}

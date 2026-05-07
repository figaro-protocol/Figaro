import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { OperatorOnboarding } from "@/components/operators/OperatorOnboarding";

export const metadata: Metadata = {
    title: "Operators — Figaro Protocol",
    description: "Self-registered participants with a reclaimable ETH deposit in OperatorRegistry. Permissionless enrolment surface for addresses taking seller-side roles in assemblies.",
};

export default function OperatorsPage() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-8 max-w-2xl">
                <p className="text-eyebrow uppercase text-ink-muted mb-4">
                    Operator Registry
                </p>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Register or update your operator profile.
                </h1>
                <p className="text-body-lead text-ink-body">
                    An operator is any address that has posted a reclaimable ETH deposit in <code>OperatorRegistry</code>. Profile metadata (catalogue, mechanisms, agent endpoints) lives off-chain at an IPFS URI you control — replace it any time with <code>updateProfile</code>; the deposit and lock period are not touched.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-2xl">
                <Suspense>
                    <OperatorOnboarding />
                </Suspense>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-2xl border-t border-default pt-12">
                <details className="group">
                    <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
                        <h2 className="text-eyebrow uppercase text-ink-muted">How the registry works</h2>
                        <span className="text-ink-muted text-sm group-open:rotate-90 transition-transform">&rsaquo;</span>
                    </summary>
                    <div className="mt-6 space-y-6 text-sm text-ink-body leading-relaxed">
                        <p>
                            <code>OperatorRegistry.sol</code> exposes three caller-only functions: <code>register(metadataURI)</code> sets the dedup guard and emits <code>OperatorRegistered</code>; <code>updateProfile(metadataURI)</code> emits <code>OperatorProfileUpdated</code> without touching the deposit or lock; <code>withdraw()</code> returns the deposit and clears the binding once the lock period has elapsed.
                        </p>
                        <p>
                            The deposit is a Sybil-resistance mechanism, not a fee. The protocol does not redistribute it. No party has authority to seize it. Withdrawal after the lock period frees the address to re-register; the lock restarts on each fresh registration. There is no role enum on-chain and no categorization field anywhere — what a seller does is signalled by the items in their catalogue, and any role attribution at the runtime tier is derived from on-chain events via the indexer, not from a metadata field.
                        </p>
                        <p>
                            The registry does not rank, promote, or route. Discovery happens at the runtime tier: assembly frontends enumerate registered operators and their catalogues; public-graph indexers aggregate settlement history.
                        </p>
                        <p className="text-ink-muted">
                            Source: <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/src/OperatorRegistry.sol" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-heading"><code>OperatorRegistry.sol</code></a>
                            <span className="mx-2">·</span>
                            <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PUBLIC_GRAPH_MODEL.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-heading">Public graph model</a>
                            <span className="mx-2">·</span>
                            <Link href="/local-commerce" className="underline hover:text-ink-heading">local-commerce reference</Link>
                        </p>
                    </div>
                </details>
            </section>
        </>
    );
}

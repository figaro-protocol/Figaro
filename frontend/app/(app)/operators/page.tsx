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
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Operators
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Self-registered participants.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    An operator is an address that has posted a reclaimable ETH deposit in <code>OperatorRegistry</code>. Operators are the pool assemblies draw from when filling seller-side roles: merchants and couriers in the local-commerce reference, subcontractors in procurement assemblies, inspectors, anyone whose participation an assembly wants to gate by staked identity.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Contract
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/src/OperatorRegistry.sol" target="_blank" rel="noopener noreferrer" className="text-black font-medium hover:underline"><code>OperatorRegistry.sol</code></a>
                        <p className="text-sm text-gray-600 mt-0.5">Permissionless self-registration. Reclaimable ETH deposit. Two functions: <code>register(role, metadataURI)</code> + <code>withdraw()</code>. State is dedup-only — operator availability is signal-by-availability off-chain, not registry state. Withdrawal after the lock period clears the binding and frees the address to re-register with new role or metadata. No admin, no KYC, no pause, no profile-edit / deactivate / reactivate.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Enrolment flow
                </h2>
                <ol className="space-y-3 text-sm text-gray-700 leading-relaxed list-decimal pl-5">
                    <li><strong>Register.</strong> Call <code>register(role, metadataURI)</code>. The transaction carries the ETH deposit; the contract sets the dedup guard and emits <code>OperatorRegistered</code> with role + metadataURI as event data.</li>
                    <li><strong>Publish catalogue.</strong> Publish the operator&apos;s offering catalogue so assembly frontends can enumerate available operators by role and region. Catalogue updates ship as fresh IPFS pins; on-chain metadata is event-sourced from the most recent registration.</li>
                    <li><strong>Participate.</strong> Counter-sign commitments in assemblies that route work to registered operators. Settlement is kernel-level; the registry only establishes presence.</li>
                    <li><strong>Reclaim (optional).</strong> After the lock period, call <code>withdraw()</code> to reclaim the deposit. The dedup guard clears, freeing the address to re-register with new role or metadata; the lock period restarts on each fresh registration.</li>
                </ol>
                <p className="text-sm text-gray-600 mt-4">
                    The deposit is a Sybil-resistance mechanism, not a fee. The protocol does not redistribute it. No party has authority to seize it.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Register
                </h2>
                <div className="flex items-center gap-3 mb-10 max-w-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                        <span className="text-sm font-semibold text-black whitespace-nowrap">Register</span>
                    </div>
                    <div className="flex-1 h-px bg-gray-200" />
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full border border-gray-300 text-gray-400 text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                        <span className="text-sm text-gray-400 whitespace-nowrap">Catalogue</span>
                    </div>
                </div>
                <Suspense>
                    <OperatorOnboarding />
                </Suspense>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Discovery
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The registry does not rank, promote, or route. Discovery happens at the runtime tier: assembly frontends enumerate registered operators by role and catalogue; public-graph indexers aggregate settlement history (completion rate, bond size, on-time delivery); external channels (direct, social, existing customer bases) remain available. The protocol is the rails, not the storefront.
                </p>
                <p className="text-sm text-gray-600">
                    Public graph model: <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PUBLIC_GRAPH_MODEL.md" target="_blank" rel="noopener noreferrer" className="underline">PUBLIC_GRAPH_MODEL.md</a>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Related
                </h2>
                <ul className="space-y-2 text-sm">
                    <li><Link href="/local-commerce" className="text-black hover:underline">local-commerce &rarr;</Link> &mdash; the reference assembly that consumes merchant and courier operators.</li>
                    <li><Link href="/builders" className="text-black hover:underline">Builders &rarr;</Link> &mdash; composing assemblies that route work to registered operators.</li>
                    <li><Link href="/protocol#enforcement" className="text-black hover:underline">Enforcement &rarr;</Link> &mdash; what happens when a counterparty defects.</li>
                    <li><Link href="/compliance" className="text-black hover:underline">Compliance &rarr;</Link> &mdash; the evidence bundle surfaced when a dispute reaches an off-chain forum.</li>
                </ul>
            </section>
        </>
    );
}

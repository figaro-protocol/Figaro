import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Displaced & stateless — Figaro Protocol",
    description: "A commerce primitive whose precondition is a cryptographic key, not a passport. For refugees, stateless persons, undocumented migrants, and populations without stable banking access.",
};

export default function Displaced() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    For practitioners in refugee economics, humanitarian policy, and legal-philosophical work on statelessness
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    A precondition of cryptographic key, not a passport.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    The bonded primitive does not require a recognized civil-legal subjecthood to work. A wallet can sign. A bonded commitment can settle. An exchange can complete &mdash; without a host-state court, a domestic bank, or a permission-to-work visa sitting between the parties.
                </p>
            </section>

            {/* Scale */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Scale
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    120 million forcibly displaced. A larger population beyond them.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    UNHCR&apos;s end-of-2023 figure: 120 million forcibly displaced worldwide, and roughly 4.4 million registered as stateless &mdash; with a much larger estimated population whose statelessness is undocumented.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Beyond forced displacement, an overlapping population lives without stable banking and enforcement access for reasons of informal migration status, residence without papers, or residency in jurisdictions whose financial infrastructure does not reach them. For this population, the contemporary labor-classification debate is a second-order question; the first-order question is whether they are recognized parties to any contract in any forum.
                </p>
            </section>

            {/* The architecture they face */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The received architecture
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Labor law, contract law, and banking presume a legal subject.
                </h2>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Employment</span>
                        <span>Typically unavailable formally &mdash; permission-to-work requirements gate the employment relation.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Contracting</span>
                        <span>Unstable &mdash; cannot register a business, cannot enforce contracts in the local courts, cannot reliably serve process.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Banking</span>
                        <span>Restricted or absent. Opening an account typically requires documents of residency and identity the population does not have.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Adjudication</span>
                        <span>No stable forum. Commercial disputes have no local court willing to hear them from a party without standing.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    Humanitarian-economics research (Betts and Collier on refugee economies, Pritchett on the camp-to-labor-market frontier) documents the cost: productive capacity is systematically underused because the institutional scaffold for engaging it is missing.
                </p>
            </section>

            {/* What the primitive does */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What the primitive does
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    A capacity to have commerce, where the capacity to have rights is denied.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    Every Figaro transaction turns on three concrete acts: a wallet signs a commitment, a wallet locks a bond, a wallet receives a settlement. None of the three requires a recognized civil-legal subjecthood. None requires a bank. None requires a host-state court.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Signing</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            A cryptographic key is the precondition. A passport is not. Standards-compliant EIP-712 signatures from a wallet meet the evidentiary requirements the protocol imposes.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Bonding</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Collateral in a permissionless token, posted by the wallet itself. The bond is the assurance mechanism &mdash; no counterparty credit-check, no home-jurisdiction guarantee.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Settling</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Direct wallet-to-wallet on resolution. No domestic bank clears. No correspondent-bank relationship is required. The chain is the clearing layer.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Record-keeping</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Attestations, performance history, and settled exchanges travel with the wallet indefinitely. A record of productive activity that does not depend on a civil registry to be kept.
                        </p>
                    </div>
                </div>
            </section>

            {/* What it is not */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    What it is not
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    The primitive does not resolve statelessness.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    It does not confer citizenship. It does not restore legal recognition. It does not create enforcement against a state that denies a person&apos;s standing. It is not a substitute for the political work that addresses those gaps &mdash; work that remains necessary and that the protocol does not pretend to duplicate.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    Hannah Arendt&apos;s formulation is the one to hold here: the fundamental human right is the right to have rights &mdash; the right to belong to a political community within which one&apos;s other rights have standing. The bonded primitive does not grant the right to have rights; it grants, more narrowly, a capacity to have commerce.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                    The two should not be confused. The first is political and is not in anyone&apos;s gift. The second is structural and becomes operational once the cryptographic infrastructure is in reach. For populations for whom the first is denied, the second is non-trivial.
                </p>
            </section>

            {/* Honest constraints */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Honest constraints
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    The engineering problem does not disappear.
                </h2>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Key custody</span>
                        <span>Unreliable access to power, devices, and connectivity imposes real usability barriers at the cryptographic layer. The primitive does not solve these; they evolve with the infrastructure around the protocol.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Counterparty</span>
                        <span>A well-resourced buyer may decline to bond with a counterparty lacking civil-legal standing &mdash; not because of the primitive, but because of downstream legal exposure in the buyer&apos;s home jurisdiction. This is a real friction and does not resolve automatically.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Fiat on-ramp</span>
                        <span>Converting wallet balance to local currency still runs through existing rails, which remain gated. The primitive operates within the crypto-native layer; getting value in and out of that layer is a separate problem that remains open for this population.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-32 shrink-0 uppercase">Collateral</span>
                        <span>Bonding requires collateral. A bonded counterparty without starting capital cannot bond. This is a hard constraint, not a bug; possible mitigations (sponsor pools, cooperative bonding, assembly-level bond aggregation) live at the assembly tier and are not yet built.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    The analytical point is not that the primitive solves humanitarian economics. It is that the primitive moves the humanitarian-economics gap from an architectural impossibility to an operational engineering question. That is a non-trivial move.
                </p>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                            Read the paper
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The full argument is developed in Paper F2: <em>The Wallet Without a Polity &mdash; Displaced and Stateless Subjects under a Bonded Settlement Primitive</em>. Companion to Paper F1 (the labor-law treatment), which develops the underlying wallet-as-legal-subject argument.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-polity.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (F2) &rarr;
                    </a>
                </div>
                <p className="mt-8 text-sm text-gray-500 leading-relaxed">
                    Related:&nbsp;
                    <Link href="/labor-law" className="underline hover:text-black">labor-law</Link>
                    &nbsp;(the wallet-as-legal-subject argument in full);&nbsp;
                    <Link href="/sovereign-commerce" className="underline hover:text-black">sovereign-commerce</Link>
                    &nbsp;(the political-economy diagnosis this extends);&nbsp;
                    <Link href="/legal" className="underline hover:text-black">legal</Link>
                    &nbsp;(the evidentiary framework).
                </p>
            </section>

        </>
    );
}

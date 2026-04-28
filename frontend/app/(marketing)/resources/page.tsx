import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Resources — Figaro Protocol",
    description: "Tools, reference implementations, and operating surfaces for builders and auditors.",
};

export default function Resources() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Resources
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Tools and reference material.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Working surfaces for building against the protocol, auditing the deployed surface, or reading chain state. For papers and formal publications, see <Link href="/publications" className="underline">Publications</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    SDK &amp; integration
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/integrate" className="text-black font-medium hover:underline">@figaro/core (SDK)</Link>
                        <p className="text-sm text-gray-600 mt-0.5">TypeScript SDK for reading state, proposing actions, building commitments, and composing assemblies. ABIs, event parsers, ProcessGraph reconstruction, agent action queue.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/schemas" className="text-black font-medium hover:underline">Schema authoring</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Three-layer content validation (client TypeScript, SP1 prover, on-chain Solidity) with a single canonical JSON spec format. Add a new schema by registering permissionlessly and shipping all three layers in lockstep.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Operating surfaces
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/console" className="text-black font-medium hover:underline">Console</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Supervision surface. Process inspection, proposed actions, event timeline, HITL action queue, assembly authoring.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/operators" className="text-black font-medium hover:underline">Operator registry</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Self-register an operator identity with a reclaimable ETH deposit.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Reference implementation
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/local-commerce" className="text-black font-medium hover:underline">Figaro Local Commerce</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Complete local-commerce assembly — three roles (buyer, merchant, courier), bonded ordering, Dutch-auction dispatch, attestation coordinator, operator registry, optional GHG disclosure. Generic across food, retail, and service verticals. Template; forkable.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/i/local-commerce" className="text-black font-medium hover:underline">Figaro Local Commerce runtime</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Live runtime for the Figaro Local Commerce assembly.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Verification &amp; audit
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/verification" className="text-black font-medium hover:underline">Verification inventory</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Invariants mapped to Foundry, Halmos, Echidna, TLA⁺, and Certora. Every property, every proof, every test.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/DESIGN_DECISIONS.md" target="_blank" rel="noopener noreferrer" className="text-black font-medium hover:underline">Design decisions</a>
                        <p className="text-sm text-gray-600 mt-0.5">Eleven patterns that look like vulnerabilities but are correct by design. Read before auditing.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/AUDIT_REPORT.md" target="_blank" rel="noopener noreferrer" className="text-black font-medium hover:underline">Audit report</a>
                        <p className="text-sm text-gray-600 mt-0.5">Combined audit history (4 AI passes), web2/UI subsidiary audits, accepted risks.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="text-black font-medium hover:underline">Release readiness + freeze notice</a>
                        <p className="text-sm text-gray-600 mt-0.5">Gate criteria, hardening completion record, frozen Solidity surface declared for external audit.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Source
                </h2>
                <ul className="space-y-3 text-sm">
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            github.com/figaro-protocol/Figaro-Prototype2 &rarr;
                        </a>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/tree/main/src" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            Contracts (<code>src/</code>) &rarr;
                        </a>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/tree/main/sdk" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            SDK (<code>sdk/</code>) &rarr;
                        </a>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/tree/main/certora" target="_blank" rel="noopener noreferrer" className="text-black hover:underline">
                            Certora specs (<code>certora/</code>) &rarr;
                        </a>
                    </li>
                </ul>
            </section>
        </>
    );
}

import Link from "next/link";

export default function BuildersPage() {
    return (
        <div>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Builders
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    The composition surface.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Above the kernel, the runtime tier composes into <em>assemblies</em> — declarative configurations that specify roles, mechanisms, clauses, and handoff conditions for a multi-party process. The kernel enforces the settlement properties; assemblies shape what gets settled.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    What an assembly declares
                </h2>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Roles</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Named participant positions (buyer, seller, courier, auditor). Roles are filled by addresses at commit time; the kernel does not interpret role semantics.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Mechanisms</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Coordination primitives used to allocate work across roles — Dutch auctions, operator registries, or custom mechanism contracts the builder deploys.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Clauses</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Typed sections of the signed agreement manifest. Each clause binds to a registered <code>schemaId</code>. Commit-time clauses (topology, commerce, handoff mode) live in the manifest; runtime clauses (lifecycle events, proximity, measurement) are attested against it.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Handoff conditions</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">The protocol-level conditions under which a process advances — which attestations unblock which steps, how sub-orders are composed into the tree.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Three levels of composition
                </h2>
                <dl className="space-y-6 text-sm">
                    <div className="border-l-2 border-gray-300 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Level 1 — existing contracts</dt>
                        <dd className="text-gray-700 leading-relaxed">Compose against the deployed kernel, attestation coordinator, schema registry, and the validators in force. The assembly is a configuration artifact; no new on-chain code.</dd>
                    </div>
                    <div className="border-l-2 border-gray-500 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Level 2 — custom schemas</dt>
                        <dd className="text-gray-700 leading-relaxed">Register a new <code>schemaId</code> and ship its three validation layers (TypeScript, SP1 prover, Solidity) in lockstep. The settlement substrate is unchanged; the attestation surface extends.</dd>
                    </div>
                    <div className="border-l-2 border-black pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Level 3 — new mechanism contract</dt>
                        <dd className="text-gray-700 leading-relaxed">Deploy a mechanism primitive (allocation, pricing, discovery, coordination) that the kernel can call. The kernel still enforces its invariants; the new contract must prove its own. Requires external audit.</dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-6">
                    Start at the lowest level that supplies the required behavior.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Security boundary
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Enforced by the kernel</div>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Asymmetric bonding (2× payment / 2× cumulative value)</li>
                            <li>Progressive collateralization across sub-orders</li>
                            <li>Buyer-dominant resolution</li>
                            <li>Atomic process settlement</li>
                            <li>Merkle-bound attestation receipts against the signed agreement</li>
                            <li>Validator-gated attestation dispatch</li>
                            <li>Token conservation (Certora + Halmos + TLA⁺ verified)</li>
                        </ul>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Outside the kernel</div>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Assembly correctness — the kernel records the declared structure; it does not verify the workflow is well-formed for its purpose.</li>
                            <li>Custom mechanism contracts — new failure modes belong to the contract, not the kernel.</li>
                            <li>Custom schema content — the validator enforces the declared shape; semantic correctness is the schema author&apos;s.</li>
                            <li>Role filling and identity — the kernel has no KYC. Participation gating is an assembly concern.</li>
                            <li>UI claims — representing protocol-level guarantees for properties the assembly does not enforce.</li>
                        </ul>
                    </div>
                </div>
                <p className="text-sm text-gray-600 mt-6">
                    Verification surface: <Link href="/verification" className="underline">/verification</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Composition surfaces
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    Instruments for expressing each layer above the kernel. Not product features — the kernel makes no distinction between these surfaces and any third-party equivalent an integrator might ship.
                </p>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/builders/designer" className="text-black font-medium hover:underline">Designer</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Three-column composition UI: palette (blocks) → canvas (roles, views, slots, bindings) → inspector → publish drawer. Validates readiness against the assembly schema and writes to the on-chain registry.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/builders/assemblies" className="text-black font-medium hover:underline">Registered assemblies</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Index of assemblies written to the on-chain registry. Read surface for the current public graph.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/schemas" className="text-black font-medium hover:underline">Schemas</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Three-layer validation architecture. Add a new schema by registering <code>schemaId</code> permissionlessly and shipping the TypeScript encoder, Solidity validator, and deploy script.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/integrate" className="text-black font-medium hover:underline">@figaro/core (SDK)</Link>
                        <p className="text-sm text-gray-600 mt-0.5">TypeScript SDK: ABIs, event parsers, <code>ProcessGraph</code> reconstruction, commitment builders, action-queue, schema encoders.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <Link href="/console" className="text-black font-medium hover:underline">Console</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Supervision surface for live processes and assembly drafts. Action queue for human-in-the-loop approval or autonomous submission.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Reference implementation
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    <Link href="/i/local-commerce" className="text-black font-medium hover:underline">Figaro Local Commerce</Link> — three roles (buyer, merchant, courier), bonded ordering, Dutch-auction dispatch, attestation coordinator, operator registry, optional GHG disclosure. Generic across food, retail, and service verticals. Level-1 + Level-2 + Level-3 composition. Forkable.
                </p>
            </section>
        </div>
    );
}

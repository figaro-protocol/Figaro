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
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
                    Where schemas, validators, mechanisms, and assemblies are authored.
                </p>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mb-4">
                    Above the kernel, the runtime tier composes into <em>assemblies</em> &mdash; declarative configurations that specify roles, mechanisms, clauses, and handoff conditions for a multi-party process. The kernel enforces the settlement properties; assemblies shape what gets settled.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                    For the academic frame, see <Link href="/cryptoeconomics" className="underline hover:text-black">Cryptoeconomics</Link>. For the kernel invariants enforced under the substrate, see <Link href="/protocol" className="underline hover:text-black">Protocol</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    What an assembly declares
                </h2>
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Roles</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Named participant positions (buyer, seller, courier, auditor). Roles are filled by addresses at commit time; the kernel does not interpret role semantics.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Mechanisms</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Coordination primitives used to allocate work across roles &mdash; Dutch auctions, custom mechanism contracts the builder deploys.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Clauses</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Typed sections of the signed agreement manifest. Each clause binds to a registered <code>schemaId</code>. Commit-time clauses (topology, commerce, handoff mode) live in the manifest; runtime clauses (lifecycle events, proximity, measurement) are attested against it.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Handoff conditions</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">The protocol-level conditions under which a process advances &mdash; which attestations unblock which steps, how sub-orders are composed into the tree.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Discovery</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Operator metadata (advisory, off-chain) maintained through <code>OperatorRegistry</code>. Not a coordination mechanism; a self-registration surface that lets discovery UIs find available counterparties.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    How to extend
                </h2>
                <dl className="space-y-6 text-sm">
                    <div className="border-l-2 border-gray-300 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Compose against existing primitives</dt>
                        <dd className="text-gray-700 leading-relaxed">An assembly is a configuration artifact that binds the deployed kernel, attestation coordinator, schema registry, and validators in force. No new on-chain code; the assembly is the only authored artifact.</dd>
                    </div>
                    <div className="border-l-2 border-gray-500 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Add a typed clause</dt>
                        <dd className="text-gray-700 leading-relaxed">Register a new <code>schemaId</code> and ship its validation layers in lockstep &mdash; TypeScript and Solidity today; SP1 Rust mirror pending. The settlement substrate is unchanged; the attestation surface extends.</dd>
                    </div>
                    <div className="border-l-2 border-black pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Add a mechanism</dt>
                        <dd className="text-gray-700 leading-relaxed">Deploy a mechanism primitive (allocation, pricing, discovery, coordination) above the kernel via the coordinator pattern. The kernel still enforces its invariants; the new contract must prove its own. Strongly recommended: external audit before mainnet deployment.</dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-6">
                    Start at the lowest tier that supplies the required behavior. Full discipline at <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">PROTOCOL_EXTENSION_DOCTRINE.md</a>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Security boundary
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    The kernel enforces the invariants stated on <Link href="/protocol" className="underline">Protocol</Link>. Everything else &mdash; assembly correctness, custom contracts, schema content, role filling, UI claims &mdash; is the builder&apos;s responsibility.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <div className="text-sm font-semibold text-black mb-2">Enforced by the kernel</div>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Asymmetric bonding (2× payment / 2× cumulative value)</li>
                            <li>Progressive collateralization across sub-orders</li>
                            <li>Buyer-dominant atomic resolution</li>
                            <li>Merkle-bound attestation receipts against the signed agreement</li>
                            <li>Validator-gated attestation dispatch</li>
                            <li>Token conservation (Certora + Halmos + TLA⁺ verified)</li>
                        </ul>
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-black mb-2">Outside the kernel</div>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Assembly correctness &mdash; the kernel records the declared structure; it does not verify the workflow is well-formed for its purpose.</li>
                            <li>Custom mechanism contracts &mdash; new failure modes belong to the contract, not the kernel.</li>
                            <li>Custom schema content &mdash; the validator enforces the declared shape; semantic correctness is the schema author&apos;s.</li>
                            <li>Role filling and identity &mdash; the kernel has no KYC. Participation gating is an assembly concern.</li>
                            <li>UI claims &mdash; representing protocol-level guarantees for properties the assembly does not enforce.</li>
                        </ul>
                    </div>
                </div>
                <p className="text-sm text-gray-600 mt-6">
                    Verification surface: <Link href="/spec" className="underline">/spec</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Composition surfaces
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    Instruments for expressing each layer above the kernel. Not product features &mdash; the kernel makes no distinction between these surfaces and any third-party equivalent an integrator might ship.
                </p>
                <ul className="space-y-4">
                    <li>
                        <Link href="/builders/designer" className="text-black font-medium hover:underline">Designer</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Three-column composition UI: palette (blocks) → canvas (roles, views, slots, bindings) → inspector → publish drawer. Validates readiness against the assembly schema. Drafts persist locally; publish flow lives in Authoring Studio below.</p>
                    </li>
                    <li>
                        <Link href="/builders/authoring" className="text-black font-medium hover:underline">Authoring Studio</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Server-action publish flow. Takes a Designer draft, validates against the assembly schema, and writes to the on-chain registry under the operator&apos;s wallet.</p>
                    </li>
                    <li>
                        <Link href="/builders/assemblies" className="text-black font-medium hover:underline">Registered assemblies</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Index of assemblies written to the on-chain registry. Read surface for the current public graph.</p>
                    </li>
                    <li>
                        <Link href="/builders/prototype" className="text-black font-medium hover:underline">Prototype shells</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Resolves an assembly through runtime-identity binding for live inspection. The same shell that ships at <code>/i/[slug]</code>, instrumented for builder-side iteration.</p>
                    </li>
                    <li>
                        <Link href="/schemas" className="text-black font-medium hover:underline">Schemas</Link>
                        <p className="text-sm text-gray-600 mt-0.5">Schema architecture and the validator-in-force inventory. Add a new schema by registering <code>schemaId</code> permissionlessly and shipping the TypeScript encoder, Solidity validator, and deploy script.</p>
                    </li>
                    <li>
                        <Link href="/spec" className="text-black font-medium hover:underline">Contracts</Link>
                        <p className="text-sm text-gray-600 mt-0.5">The on-chain canonical surface. Every contract above the kernel is listed with its purpose, source link, and verification status. The starting point for adding a mechanism primitive.</p>
                    </li>
                    <li>
                        <Link href="/integrate" className="text-black font-medium hover:underline">Integrate (SDK)</Link>
                        <p className="text-sm text-gray-600 mt-0.5"><code>@figaro/core</code> &mdash; ABIs, event parsers, <code>ProcessGraph</code> reconstruction, commitment builders, action queue, schema encoders.</p>
                    </li>
                    <li>
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
                    <Link href="/i/local-commerce" className="text-black font-medium hover:underline">Figaro Local Commerce</Link> &mdash; three roles (buyer, merchant, courier), bonded ordering, Dutch-auction dispatch, attestation coordinator, operator registry, optional GHG disclosure. Generic across food handoff, retail pickup, and on-demand service flows. Composes existing primitives, declares custom clauses, and uses no new mechanism contracts.
                </p>
            </section>
        </div>
    );
}

import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export default function BuildersPage() {
    return (
        <>
            <MarketingHero
                eyebrow="Builders"
                title="The operational catalogue."
                lead={
                    <>
                        Tools for composing, authoring, registering, prototyping,
                        and running bonded processes. Organized by the three
                        tiers of the extension doctrine. The property statement
                        &mdash; what composability is, why the kernel&apos;s
                        narrowness produces it, the coordinator pattern that
                        preserves the equilibrium &mdash; is on{" "}
                        <Link href="/composability" className="underline hover:text-black">
                            Composability
                        </Link>
                        ; this page is the tool surface.
                    </>
                }
            />

            <MarketingSection eyebrow="What an assembly declares" eyebrowAsHeading>
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
            </MarketingSection>

            <MarketingSection eyebrow="Tools by tier" eyebrowAsHeading>
                <p className="text-sm text-gray-700 leading-relaxed mb-8">
                    The tiers below mirror the property gradient on{" "}
                    <Link href="/composability" className="underline hover:text-black">
                        Composability
                    </Link>
                    . Start at the lowest tier that supplies the required behavior.
                </p>

                <div className="border-l-2 border-gray-300 pl-6 mb-8">
                    <p className="text-base font-semibold text-black mb-1">Tier 1 &mdash; Compose against existing primitives</p>
                    <p className="text-sm text-gray-600 mb-4">No new on-chain code; the assembly is the only authored artifact.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/builders/designer" className="text-black font-medium hover:underline">Designer</Link>
                            <span className="text-gray-700"> &mdash; three-column composition canvas: palette (blocks) → canvas (roles, views, slots, bindings) → inspector → publish drawer. Validates readiness against the assembly schema. Drafts persist locally.</span>
                        </li>
                        <li>
                            <Link href="/builders/authoring" className="text-black font-medium hover:underline">Authoring Studio</Link>
                            <span className="text-gray-700"> &mdash; server-action publish flow. Takes a Designer draft, validates against the assembly schema, and writes to the on-chain registry under the operator&apos;s wallet.</span>
                        </li>
                        <li>
                            <Link href="/builders/assemblies" className="text-black font-medium hover:underline">Registered assemblies</Link>
                            <span className="text-gray-700"> &mdash; index of assemblies written to the on-chain registry. Read surface for the current public graph.</span>
                        </li>
                        <li>
                            <Link href="/builders/prototype" className="text-black font-medium hover:underline">Prototype shells</Link>
                            <span className="text-gray-700"> &mdash; resolves an assembly through runtime-identity binding for live inspection. The same shell that ships at <code>/i/[slug]</code>, instrumented for builder-side iteration.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-gray-500 pl-6 mb-8">
                    <p className="text-base font-semibold text-black mb-1">Tier 2 &mdash; Add a typed clause</p>
                    <p className="text-sm text-gray-600 mb-4">Register a new <code>schemaId</code>; ship validation layers in lockstep (TypeScript and Solidity today; SP1 Rust mirror pending).</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/schemas" className="text-black font-medium hover:underline">Schemas</Link>
                            <span className="text-gray-700"> &mdash; the three-layer validation architecture and the eighteen reference schemas. Includes the nine-step authoring checklist and the <code>SchemaRegistrationHelper</code> path for atomic register+bind.</span>
                        </li>
                        <li>
                            <Link href="/integrate" className="text-black font-medium hover:underline">SDK schema encoders</Link>
                            <span className="text-gray-700"> &mdash; <code>@figaro/core/schemas</code>: meta-schema validator, <code>validateContent</code>, per-schema content encoders.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-black pl-6 mb-8">
                    <p className="text-base font-semibold text-black mb-1">Tier 3 &mdash; Add a mechanism</p>
                    <p className="text-sm text-gray-600 mb-4">Deploy a mechanism primitive above the kernel via the coordinator pattern. The kernel still enforces its invariants; the new contract must prove its own. Strongly recommended: external audit before mainnet deployment.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/spec" className="text-black font-medium hover:underline">Contracts</Link>
                            <span className="text-gray-700"> &mdash; the canonical on-chain surface. Every contract above the kernel is listed with its purpose, source link, and verification status. The starting point for adding a mechanism primitive.</span>
                        </li>
                        <li>
                            <Link href="/integrate" className="text-black font-medium hover:underline">SDK ABIs &amp; event parsers</Link>
                            <span className="text-gray-700"> &mdash; <code>@figaro/core</code>: ABIs, event parsers, <code>ProcessGraph</code> reconstruction, commitment builders, action queue.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-gray-200 pl-6">
                    <p className="text-base font-semibold text-black mb-1">Cross-cutting</p>
                    <p className="text-sm text-gray-600 mb-4">Tools that operate across all three tiers.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/console" className="text-black font-medium hover:underline">Console</Link>
                            <span className="text-gray-700"> &mdash; supervision surface for live processes and assembly drafts. Action queue for human-in-the-loop approval or autonomous submission.</span>
                        </li>
                    </ul>
                </div>
            </MarketingSection>

            <MarketingSection eyebrow="Reference implementation" eyebrowAsHeading bottomPad="wide">
                <p className="text-sm text-gray-700 leading-relaxed">
                    <Link href="/i/local-commerce" className="text-black font-medium hover:underline">Figaro Local Commerce</Link> &mdash; three roles (buyer, merchant, courier), bonded ordering, Dutch-auction dispatch, attestation coordinator, operator registry, optional GHG disclosure. Composes existing primitives, declares custom clauses, and uses no new mechanism contracts &mdash; a Tier-1 + Tier-2 assembly with no Tier-3 code authored.
                </p>
            </MarketingSection>
        </>
    );
}

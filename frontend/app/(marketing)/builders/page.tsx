import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Builders — Figaro Protocol",
    description: "Design a trade workflow from protocol components. The protocol handles enforcement. Three levels of composition — no new contract risk required at Level 1.",
    openGraph: {
        title: "Builders — Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Builders — Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
    },
};

export default function BuildersPage() {
    return (
        <>
            <MarketingHero
                title="The operational catalogue."
                lead={
                    <>
                        Tools for composing and running bonded processes.
                        Organized by the three tiers of the extension doctrine.
                        The property statement
                        &mdash; what composability is, why the kernel&apos;s
                        narrowness produces it, the coordinator pattern that
                        preserves the equilibrium &mdash; is on{" "}
                        <Link href="/composability" className="underline">
                            Composability
                        </Link>
                        ; this page is the tool surface.
                    </>
                }
            />

            <MarketingSection title="What an assembly declares">
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Roles</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Named participant positions (buyer, seller, courier, auditor). Roles are filled by addresses at commit time; the kernel does not interpret role semantics.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Mechanisms</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Coordination primitives used to allocate work across roles &mdash; Dutch auctions, custom mechanism contracts the builder deploys.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Clauses</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Typed sections of the signed agreement manifest. Each clause binds to a registered <code>schemaId</code>. Commit-time clauses (topology, commerce, handoff mode) live in the manifest; runtime clauses (lifecycle events, proximity, measurement) are attested against it.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Handoff conditions</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">The protocol-level conditions under which a process advances &mdash; which attestations unblock which steps, how sub-orders are composed into the tree.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">Discovery</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Operator metadata (advisory, off-chain) maintained through <code>OperatorRegistry</code>. Not a coordination mechanism; a self-registration surface that lets discovery UIs find available counterparties.</dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection title="Tools by tier">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    The tiers below mirror the property gradient on{" "}
                    <Link href="/composability" className="underline">
                        Composability
                    </Link>
                    . Start at the lowest tier that supplies the required behavior.
                </p>

                <div className="border-l-2 border-default pl-6 mb-8">
                    <p className="text-base font-semibold text-ink-heading mb-1">Tier 1 &mdash; Compose against existing primitives</p>
                    <p className="text-sm text-ink-muted mb-4">Architecture on <Link href="/builders/composability#tier-1" className="underline">Composability — Builder architecture</Link>.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/builders/designer" className="text-ink-heading font-medium hover:underline">Designer</Link>
                            <span className="text-ink-body"> &mdash; DAG-of-orders editor: spawn sub-orders from a parent node, merge fan-in by dropping onto an existing node, and swap the per-edge fulfilment method. Per-node agreement clauses (Identity, Order, Fulfilment, Logistics, Attestations, Emissions, Jurisdiction, Consent) edit in a side drawer. Drafts persist locally. Buyer surface: <code>/m/&lt;merchant&gt;</code>, <code>/orders/&lt;processId&gt;</code>. Merchant surface: <code>/inbox</code>.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-default-strong pl-6 mb-8">
                    <p className="text-base font-semibold text-ink-heading mb-1">Tier 2 &mdash; Add a typed clause</p>
                    <p className="text-sm text-ink-muted mb-4">Architecture on <Link href="/builders/composability#tier-2" className="underline">Composability — Builder architecture</Link>.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/schemas" className="text-ink-heading font-medium hover:underline">Schemas</Link>
                            <span className="text-ink-body"> &mdash; the three-layer validation architecture and the eighteen reference schemas. Includes the nine-step authoring checklist and the <code>SchemaRegistrationHelper</code> path for atomic register+bind.</span>
                        </li>
                        <li>
                            <Link href="/integrate" className="text-ink-heading font-medium hover:underline">SDK schema encoders</Link>
                            <span className="text-ink-body"> &mdash; <code>@figaro/core/schemas</code>: meta-schema validator, <code>validateContent</code>, per-schema content encoders.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-ink-heading pl-6 mb-8">
                    <p className="text-base font-semibold text-ink-heading mb-1">Tier 3 &mdash; Add a mechanism</p>
                    <p className="text-sm text-ink-muted mb-4">Architecture on <Link href="/builders/composability#tier-3" className="underline">Composability — Builder architecture</Link>.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/spec" className="text-ink-heading font-medium hover:underline">Contracts</Link>
                            <span className="text-ink-body"> &mdash; the canonical on-chain surface. Every contract above the kernel is listed with its purpose, source link, and verification status. The starting point for adding a mechanism primitive.</span>
                        </li>
                        <li>
                            <Link href="/integrate" className="text-ink-heading font-medium hover:underline">SDK ABIs &amp; event parsers</Link>
                            <span className="text-ink-body"> &mdash; <code>@figaro/core</code>: ABIs, event parsers, <code>ProcessGraph</code> reconstruction, commitment builders, action queue.</span>
                        </li>
                    </ul>
                </div>

                <div className="border-l-2 border-default pl-6">
                    <p className="text-base font-semibold text-ink-heading mb-1">Cross-cutting</p>
                    <p className="text-sm text-ink-muted mb-4">Tools that operate across all three tiers.</p>
                    <ul className="space-y-3 text-sm">
                        <li>
                            <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Modules &mdash; UI authoring</Link>
                            <span className="text-ink-body"> &mdash; React components that bind to mechanisms via slot bindings on the assembly. Used at every tier: Tier-2 schemas need forms to enter and display clause content; Tier-3 mechanisms need action surfaces; assembly designers wire modules into views without authoring them. <code>@figaro/core/extensions</code> for module utilities, <code>@figaro/core/agent</code> for agent-driven action submission, <code>@figaro/core/schemas</code> for content encoders. Canonical entry: <Link href="/integrate" className="underline">Integrate</Link>.</span>
                        </li>
                    </ul>
                </div>
            </MarketingSection>

        </>
    );
}

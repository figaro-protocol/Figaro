import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { AssemblyInventory } from "./_components/AssemblyInventory";

export const metadata: Metadata = {
    title: "Assemblies — Figaro Protocol",
    description:
        "Composition templates anchored on AssemblyRegistry — each assembly wires clauses into a multi-order process. The inventory reads on-chain AssemblyRegistered events directly.",
};

export default function Assemblies() {
    return (
        <>
            <MarketingHero
                title="Composition templates."
                lead={
                    <>
                        An assembly is a composition template &mdash; a assemblyDoc that
                        wires clauses into a multi-order process. Each one registers on{" "}
                        <code>AssemblyRegistry</code> with a permanent slug, a content
                        hash, and an IPFS pointer to its assemblyDoc. Sellers bind to
                        assemblies in their profile; checkout reads those bindings to
                        surface the buyer-facing choice.
                    </>
                }
            />

            <MarketingSection title="Manifest-anchored, not catalogue-listed.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The registry stores the slug, the author, the content hash, and an
                    IPFS URI pointing at the off-chain assemblyDoc. The assemblyDoc carries the
                    topology &mdash; the orders and their parent-child links &mdash; plus
                    the per-order agreements (which clauses attach, and the field values
                    that compose into each agreement hash). Anything an seller offers
                    at checkout composes through assemblies.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    Registration is permissionless. The slug binding is first-write-wins
                    and immutable: the tuple{" "}
                    <code>(author, contentHash, metadataURI)</code> is permanent. To
                    change an assembly, register a new one under a new slug.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered assemblies.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Each row is one assembly, sorted by registration block (most recent
                    first). Manifests fetch lazily from IPFS &mdash; the on-chain identity
                    (slug, author, content hash) renders regardless.
                </p>
                <AssemblyInventory />
            </MarketingSection>

            <MarketingSection title="Where to publish">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>Designer:</strong> compose an assembly on the canvas at <Link href="/builders/designer" className="underline">/builders/designer</Link>, then publish to <code>AssemblyRegistry</code> in one transaction. The publish flow pins the assemblyDoc to IPFS, simulates the registration, and confirms the receipt before declaring success.</li>
                    <li><strong>Worked reference:</strong> the local-commerce assembly at <Link href="/local-commerce" className="underline">/local-commerce</Link> &mdash; merchant root order, courier sub-order, handoff certifications, GHG disclosures, jurisdiction anchoring.</li>
                    <li><strong>Clause set:</strong> the clauses an assembly may compose are listed at <Link href="/clauses" className="underline">/clauses</Link>.</li>
                    <li><strong>Contract:</strong> <code>src/AssemblyRegistry.sol</code> &mdash; permissionless, first-write-wins, immutable. See <Link href="/spec" className="underline">/spec</Link>.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="More for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the five builder roles: contract authors, clause authors, assembly authors, token issuance, humans and agents.</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; the validation architecture, the seventeen reference clauses, and the authoring checklist.</span>
                    </li>
                    <li>
                        <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">Local Commerce</Link>
                        <span className="text-ink-body"> &mdash; three-role bonded process reference assembly (buyer + merchant + courier).</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three extension tiers, and the kernel-vs-author boundary.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

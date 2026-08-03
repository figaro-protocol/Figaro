import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { ClauseInventory } from "./_components/ClauseInventory";

export const metadata: Metadata = {
    title: "Clauses — Figaro Protocol",
    description:
        "The clause architecture: off-chain TypeScript validation of one canonical JSON spec per clause, anchored and merkle-bound on-chain. The inventory reads on-chain ClauseRegistry events directly.",
};

export default function Clauses() {
    return (
        <>
            <MarketingHero
                title="One spec, validated off-chain, anchored on-chain."
                lead={
                    <>
                        A clause in Figaro is the content type of an attestation &mdash; a structured piece of evidence emitted during the lifecycle of a bonded process. Every attestation under a registered <code>clauseId</code> is validated off-chain against one canonical JSON spec, then merkle-bound to the signed agreement on-chain. The reference clauses register on-chain when the protocol deploys; anyone can register more, without permission.
                    </>
                }
            />

            <MarketingSection title="In plain words.">
                <p className="text-sm text-ink-body leading-relaxed">
                    A clause is one reusable term a deal can be built from &mdash; how a dispute gets escalated, how emissions get reported, how a delivery address gets handled &mdash; written once and available to anyone drafting an agreement, the same way an ordinary contract is assembled from clauses. Nothing here is proprietary or gatekept: anyone can write one and anyone can use one. The inventory further down is not a curated catalogue: it reads directly off the live network, so it shows exactly what is registered today, nothing more and nothing less. Writing and registering your own clause &mdash; the spec format, the hash mechanics, the checklist &mdash; lives on the authoring page: <Link href="/builders/clauses" className="underline">Register a clause</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Public and private data.">
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    <strong>Mark where each field&apos;s value lives: <code>disposition</code>.</strong> Any string or other field may carry <code>disposition: &quot;public&quot; | &quot;private&quot;</code> (absent &rArr; <code>&quot;public&quot;</code>) &mdash; the clause-spec side of the public/private data seam. <code>&quot;public&quot;</code> is coordination-commons data: learnable for free, published in the open (plaintext IPFS), indexable &mdash; the shared map that makes strangers able to coordinate. <code>&quot;private&quot;</code> is paid-edge data: published only <em>behind the fingerprint</em> &mdash; encrypted IPFS, or a content-withheld section &mdash; so the plaintext is the scarce thing an agent pays to learn. The seam rests on one load-bearing fact: the chain only ever sees the section&apos;s keccak256 <em>fingerprint</em> (the merkle leaf / <code>sectionHash</code>), never the preimage, so a <code>private</code> value&apos;s plaintext never touches public, permanent calldata. A party can even carry a <strong>content-withheld</strong> section &mdash; <code>withholdSectionContent</code> from <code>@figaro/sdk</code> replaces the plaintext <code>data</code> with just its <code>dataHash</code> &mdash; and it contributes the <em>identical</em> merkle leaf, proving the agreement&apos;s structure without ever revealing the value. Disposition is a Layer-A attribute validated by <code>parseClauseSpec</code>; it governs <em>how</em> a frontend publishes the value and its grain policy, not what the chain checks.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    In the corpus, <code>figaro-geolocation</code>&apos;s <code>origin</code> and <code>destination</code> are <code>disposition: &quot;public&quot;</code> &mdash; so the reader coarsens a public geohash to neighborhood grain (never door grade) before it lands on a pinned artifact. A fine machine-or-factory coordinate is the private case: it belongs to a <code>private</code>-disposition geolocation, where the value lives encrypted or content-withheld off the commons.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered clauses, by article.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set spans assembly topology, commerce primitives, emissions accounting, lifecycle and proximity, sovereign process logs, and legal anchoring. One &mdash; <code>figaro-topology</code> &mdash; is agreement-only: committed at agreement signing, with no on-chain validator.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    For agents: this inventory derives from the live <code>ClauseRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro/sdk</code> &mdash; see <Link href="/integrate" className="underline">Integrate</Link> for the deployment record.
                </p>
                <ClauseInventory />
            </MarketingSection>

            <MarketingSection title="Where to look">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/sdk/clauses</code> &mdash; meta-clause validator, <code>validateContent</code>, and the generic <code>encodeContentFromSpec</code>. The canonical source of the spec format. See <Link href="/integrate" className="underline">Integrate</Link>.</li>
                    <li><strong>Registration path:</strong> <code>ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)</code> &mdash; permissionless, first-write-wins, immutable. No per-clause validator to deploy; the generic proof engine validates it in-proof against the anchored spec, so registration alone makes the clause attestable and settleable. Contract catalogue at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Kernel side:</strong> attestation receipts are bound to the signed <code>agreementHash</code> via merkle inclusion proof, with no on-chain content validation; the rationale is on <Link href="/protocol" className="underline">Protocol</Link>.</li>
                    <li><strong>Academic frame:</strong> <Link href="/papers/on-chain-evidence" className="underline">On-Chain Evidence, Off-Chain Adjudication</Link> (how a clause&apos;s record lands in a forum that has its own jurisdiction) and the Philosophy / Law / Ethics discipline on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>.</li>
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro</a> &mdash; the reference clauses, the SDK, and the contracts.</li>
                </ul>
                <p className="mt-6 text-sm text-ink-muted">
                    Composition tools and the assembly designer: <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="More for builders" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the five builder roles: contract authors, clause authors, assembly authors, token issuance, humans and agents.</span>
                    </li>
                    <li>
                        <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>
                        <span className="text-ink-body"> &mdash; composition templates wiring clauses into multi-order processes; anchored on AssemblyRegistry.</span>
                    </li>
                    <li>
                        <Link href="/builders/composability" className="text-ink-heading font-medium hover:underline">Composability</Link>
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three composition tiers, and the kernel-vs-author boundary.</span>
                    </li>
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Integrate</Link>
                        <span className="text-ink-body"> &mdash; <code>@figaro/sdk</code>: ABIs, event parsers, content encoders, commitment builders.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

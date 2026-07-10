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

            <MarketingSection title="One spec. Three validators. Enforced in lockstep.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered clause is enforced at three layers. A new clause is not &ldquo;done&rdquo; until all required layers ship together:
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Off-chain</span>
                        <span><strong>Validation (TypeScript).</strong> The SDK&apos;s <code>parseClauseSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. Published as a JSON Schema (<code>clause-spec.schema.json</code>) with domain types (hex bytes, addresses, ISO datetimes, enums). The schema is <strong>open by design</strong> &mdash; unknown fields are tolerated and ignored, so the format itself is never gatekept: extend the shape with fields the protocol has never seen and it grows by versioning, the same way clauses register without permission. This is the one place clause content is validated.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">On-chain</span>
                        <span><strong>Registration + merkle binding.</strong> <code>ClauseRegistry</code> anchors the clauseId and its spec locator (first-write-wins, immutable); the attestation coordinator binds every attestation to the signed <code>agreementHash</code> by merkle inclusion proof and content-hashes the evidence. The chain validates <em>no</em> content shape, so a never-seen clause is attestable with zero per-clause on-chain code.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    Well-formedness is the off-chain discipline; the chain only anchors and merkle-binds. (The former on-chain per-clause validators and the deferred Rust/SP1 prover mirror were removed in the proof-apparatus teardown.)
                </p>
            </MarketingSection>

            <MarketingSection title="Write the spec.">
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    A clause is a free-form <strong>content shape</strong>: <code>fields</code> declares any named attributes &mdash; string, enum, array, object &mdash; and <em>that</em> is what gets validated off-chain and merkle-bound on-chain when attested. With four identity fields, that is already a whole, valid clause:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mb-5"><code>{`{
  "clauseId": "figaro-probe-v1",
  "version": 1,
  "title": "Probe",
  "description": "A minimal clause.",
  "fields": [ { "name": "note", "type": "string", "required": true } ]
}`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    <strong><code>block</code> is how the clause shows up in the UI &mdash; add it only if you want that.</strong> Omit it and the clause still validates and attests; it just won&apos;t surface in the designer or runtime. <code>block</code> carries the <code>tier</code>, the <code>article</code> (the section it <strong>groups</strong> under), and what it <code>nestsUnder</code> &mdash; the name of a structured field on another clause that this clause <strong>refines</strong> as a sub-clause. Grouping is <code>article</code>&apos;s job; <code>nestsUnder</code> is only for a genuine sub-detail (never a whole clause under a plain number).
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    <code>block.article</code> is your clause&apos;s <strong>group</strong> &mdash; geo, coordination, emissions &mdash; the section it groups under in the designer, and the only classification it needs. The RPGF substrate-broadening formula, when active, derives its group key as <code>keccak256(article)</code> from the spec &mdash; nothing extra is stored on-chain. Validate the whole spec against the published JSON Schema before you register.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Best practice: anchor your clause to a norm or standard.</strong> A clause is strongest when its content references an external, named, versioned standard the parties already recognize &mdash; a body of law (<code>figaro-applicable-law</code>), an arbitration forum&apos;s rules (<code>figaro-arbitration-kleros</code>), an accounting standard (<code>figaro-emissions</code> names ISO&nbsp;14064, the GHG&nbsp;Protocol, &hellip; in its <code>standard</code> field). Anchoring to a standard gives the clause stable, shared meaning across parties and over time &mdash; the standard is the source of truth and your clause points to it &mdash; and it bridges how people already reason, through established norms, to how the protocol reasons. Name the standard and carry its version, and the clause stays durable as the world changes around it.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered clauses, by article.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set spans assembly topology, commerce primitives, emissions accounting, lifecycle and proximity, sovereign process logs, and legal anchoring. One &mdash; <code>figaro-topology-v1</code> &mdash; is agreement-only: committed at agreement signing, with no on-chain validator.
                </p>
                <ClauseInventory />
            </MarketingSection>

            <MarketingSection title="The checklist.">
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li>Write the JSON spec at <code>clauses/&lt;your-clause&gt;.json</code> — <code>populate-clauses</code> pins it to IPFS and anchors it on <code>ClauseRegistry</code>; every consumer fetches it from the registry. Nothing bundles a copy.</li>
                    <li>No per-clause encoder is needed &mdash; <code>sdk/src/clauses/encode.ts</code> (<code>encodeContentFromSpec</code>) is the single generic, spec-driven encoder for any clause.</li>
                    <li>Add a conformance fixture in <code>sdk/tests/clauses/examples.test.ts</code> that reads the new spec from <code>clauses/</code>; the off-chain validator is generic and needs no per-clause case.</li>
                    <li>Register the spec on <code>ClauseRegistry</code> via <code>scripts/populate-clauses.mjs</code> (and a <code>registerClause</code> call in <code>script/Deploy.s.sol</code> / <code>DeployMainnet.s.sol</code> for the reference set). There is <strong>no validator to bind</strong> &mdash; registration alone makes the clause attestable. The UI loads every spec chain&rarr;IPFS; the article is read from the spec&apos;s <code>block.article</code>; the inventory above reads its set live from on-chain <code>ClauseRegistered</code> events.</li>
                </ol>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    The one lockstep that matters: the registered <code>contentHash</code> must match the pinned spec, and the spec must stay pinned. If they drift, the clause won&apos;t surface.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to look">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/sdk/clauses</code> &mdash; meta-clause validator, <code>validateContent</code>, and the generic <code>encodeContentFromSpec</code>. The canonical source of the spec format. See <Link href="/integrate" className="underline">Integrate</Link>.</li>
                    <li><strong>Registration path:</strong> <code>ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)</code> &mdash; permissionless, first-write-wins, immutable. No validator to bind; registration alone makes the clause attestable. Contract catalogue at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Kernel side:</strong> attestation receipts are bound to the signed <code>agreementHash</code> via merkle inclusion proof, with no on-chain content validation; the rationale is on <Link href="/protocol" className="underline">Protocol</Link>.</li>
                    <li><strong>Academic frame:</strong> Paper E (jurisdiction baseline) and the Philosophy / Law / Ethics discipline on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>.</li>
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro</a>. The <code>CLAUDE.md</code> at the root is the authoritative inventory and carries the canonical clause-authoring checklist.</li>
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
                        <span className="text-ink-body"> &mdash; the coordinator pattern, the three extension tiers, and the kernel-vs-author boundary.</span>
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

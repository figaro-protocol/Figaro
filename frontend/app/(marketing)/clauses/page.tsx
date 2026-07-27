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

            <MarketingSection title="One spec. Two enforcement layers. In lockstep.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered clause is enforced at two layers. A new clause is not &ldquo;done&rdquo; until both layers ship together:
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">Off-chain</span>
                        <span><strong>Validation (TypeScript).</strong> The SDK&apos;s <code>parseClauseSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. Published as a JSON Schema (<code>clause-spec.schema.json</code>) with domain types (hex bytes, addresses, ISO datetimes, enums). The schema is <strong>open by design</strong> &mdash; unknown fields are tolerated and ignored, so the format itself is never gatekept: extend the shape with fields the protocol has never seen and it grows by versioning, the same way clauses register without permission. This off-chain check gates every signature; the same spec drives the in-proof content check on the batched settlement path (below).</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">On-chain</span>
                        <span><strong>Registration + merkle binding.</strong> <code>ClauseRegistry</code> anchors the clauseId and its spec locator (first-write-wins, immutable); the attestation coordinator binds every attestation to the signed <code>agreementHash</code> by merkle inclusion proof and content-hashes the evidence. On this direct attestation path the chain validates <em>no</em> content shape, so a never-seen clause is attestable with zero per-clause on-chain code. The batched, proof-based settlement path adds the on-chain content check &mdash; see below.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    Off-chain well-formedness gates every signature. The batched, proof-based settlement path then re-checks it on-chain: a single generic SP1 proof engine validates each clause&apos;s content against its spec &mdash; supplied to the proof as a witness &mdash; and <code>FigaroBatchVerifier</code> settles the batch only if every witness spec&apos;s hash equals the <code>contentHash</code> the <code>ClauseRegistry</code> anchors for that clause. The engine&apos;s verification key covers the <em>engine</em>, not a clause list, so a never-seen clause settles through the proven path with zero code changes. There are no per-clause validator contracts, by design &mdash; a clause is data, not code. (Devnet-live behind a mock verifier today; the mainnet flow wires Succinct&apos;s SP1 gateway from env.)
                </p>
            </MarketingSection>

            <MarketingSection title="Write the spec.">
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    A clause is a free-form <strong>content shape</strong>: <code>fields</code> declares any named attributes &mdash; string, enum, array, object &mdash; and <em>that</em> is what gets validated off-chain and merkle-bound on-chain when attested. Five required keys &mdash; <code>clauseId</code>, <code>version</code>, <code>title</code>, a one-line <code>description</code>, and <code>fields</code> &mdash; already make a whole, valid clause:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mb-5"><code>{`{
  "clauseId": "figaro-probe",
  "version": 1,
  "title": "Probe",
  "description": "A minimal clause.",
  "fields": [ { "name": "note", "type": "string", "required": true } ]
}`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mb-5">
                    <strong><code>block</code> is how the clause shows up in the UI &mdash; add it only if you want that.</strong> Omit it and the clause still validates and attests; it just won&apos;t surface in the designer or runtime. <code>block</code> carries the <code>article</code> (the section it <strong>groups</strong> under) and what it <code>nestsUnder</code> &mdash; the name of a structured field on another clause that this clause <strong>refines</strong> as a sub-clause. Grouping is <code>article</code>&apos;s job; <code>nestsUnder</code> is only for a genuine sub-detail (never a whole clause under a plain number).
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    <code>block.article</code> is your clause&apos;s <strong>group</strong> &mdash; geo, coordination, emissions &mdash; the section it groups under in the designer, and the only classification it needs. The RPGF substrate-broadening formula, when active, derives its group key as <code>keccak256(article)</code> from the spec &mdash; nothing extra is stored on-chain. Validate the whole spec with <code>parseClauseSpec</code> from <code>@figaro/sdk/clauses</code> before you register; it rejects a malformed spec with the exact path that failed.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Two <code>article</code> values are reserved &mdash; and picking one by accident is silent.</strong> Your group name is free text, but <code>&quot;mandatory&quot;</code> and <code>&quot;attestations&quot;</code> mean something to the SDK. <code>&quot;mandatory&quot;</code> auto-folds the clause into <em>every</em> template agreement (that is how <code>figaro-commerce</code> and <code>figaro-topology</code> ride along). <code>&quot;attestations&quot;</code> makes the clause a <em>process log</em>: its content is an empty anchor at commit, filled by attestation afterwards. Both are read straight off your spec &mdash; nothing warns you, nothing throws, and the clause simply behaves differently than you meant. The trap is that the reserved words are the natural ones: an attestation clause grouped, reasonably, under &ldquo;attestations&rdquo; silently commits empty. Registration is <strong>permanent and first-write-wins</strong>, so if that is not what you want, group it under any other word before you register.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>The shape has a name: a clause spec is a Ricardian contract.</strong> If you already know Grigg&apos;s design, take the shortcut &mdash; it is the whole clause model in one sentence, and you can stop deriving it. Grigg defined a Ricardian contract as a single document that is at once readable by people, parsable by programs, digitally signed, and identified by a hash over its own content. A clause spec is that shape, with the signature moved to where Figaro binds it: <code>block</code> is the half people read, <code>fields</code> is the half programs parse, both ship as one document, and <code>contentHash</code> &mdash; keccak over the canonical serialization, anchored on <code>ClauseRegistry</code> &mdash; identifies the document by its own content. Rather than the author clearsigning the spec, the spec is <em>anchored</em> by whoever registers it and <em>signed into force</em> by the parties who use it: the values filled under your <code>fields</code> become a merkle leaf in the <code>agreementHash</code> that buyer and seller each sign with EIP-712.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>What Figaro does not take from that lineage is the issuer and the legal backstop.</strong> Grigg&apos;s definition opens with a contract <em>offered by an issuer to holders</em> for a right <em>managed by the issuer</em>, and his aim was a document a court would accept as the agreement. Figaro takes neither. There is no issuer: the author of a clause is not a party to the deals that use it &mdash; you publish a shape, and the buyer and seller who use it are the ones who sign. And a clause carries no legal weight by construction. What makes the deal hold is the bonding equilibrium &mdash; cooperation weakly dominates defection for both parties. If the parties compose an external forum in, it reads the commitment as evidence; it is not what enforces it, and the dispute layer is provider-agnostic &mdash; Figaro names no forum.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed mt-3">
                    Ian Grigg, <a href="https://iang.org/papers/ricardian_contract.html" target="_blank" rel="noopener noreferrer" className="underline">The Ricardian Contract</a> &mdash; First IEEE International Workshop on Electronic Contracting (WEC), 6 July 2004; the form had been in use since 1996.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Best practice: anchor your clause to a norm or standard.</strong> A clause is strongest when its content references an external, named, versioned standard the parties already recognize &mdash; a body of law (<code>figaro-applicable-law</code>), an arbitration forum&apos;s rules (<code>figaro-arbitration-kleros</code>), an accounting standard (<code>figaro-emissions</code> names ISO&nbsp;14064, the GHG&nbsp;Protocol, &hellip; in its <code>standard</code> field). Anchoring to a standard gives the clause stable, shared meaning across parties and over time &mdash; the standard is the source of truth and your clause points to it &mdash; and it bridges how people already reason, through established norms, to how the protocol reasons. Name the standard and carry its version, and the clause stays durable as the world changes around it.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    Written a spec? <Link href="/builders/clauses" className="text-ink-heading font-medium underline">Register a clause</Link> &mdash; paste it, validate it against this same off-chain check, and anchor it on the <code>ClauseRegistry</code>: permissionless, first-write-wins, permanent per <code>(name, version)</code>. Registering posts a reclaimable ETH deposit &mdash; staked intent, no time lock, reclaimed in full &mdash; not a fee.
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

            <MarketingSection title="The checklist.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    No permission, no pull request, no repository access. Four steps take a spec from your editor to an anchored, attestable clause &mdash; and <Link href="/builders/clauses" className="text-ink-heading font-medium underline">/builders/clauses</Link> runs all four from the browser if you would rather not touch code.
                </p>
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li><strong>Write the spec.</strong> The shape above is the whole of it &mdash; <code>clauseId</code>, <code>version</code>, <code>title</code>, <code>description</code>, and your <code>fields</code>. Add <code>block</code> only if you want the clause to surface in the designer and runtime.</li>
                    <li><strong>Validate it off-chain.</strong> Run it through the one validator &mdash; <code>parseClauseSpec</code> / <code>validateContent</code> from <code>@figaro/sdk/clauses</code>, or paste it into the <Link href="/builders/clauses" className="underline">/builders/clauses</Link> form, which runs the same check live in the browser. This is the off-chain gate; get it green here before you anchor &mdash; the same spec drives the in-proof content check on the batched settlement path.</li>
                    <li><strong>Pin the canonical serialization to IPFS.</strong> Pin the exact bytes <code>canonicalize(spec)</code> returns from <code>@figaro/sdk</code> &mdash; sorted keys at every depth, no whitespace, <code>block</code> included &mdash; and keep them pinned. Anchor <code>contentHash = canonicalContentHash(spec)</code>. Pinning that same serialization is what makes the hash reproducible: every consumer re-canonicalizes the parsed JSON and recomputes the hash to verify it, so if you pin pretty-printed bytes instead, the hash readers recompute never matches the one you anchored &mdash; permanently, under first-write-wins. Nothing bundles a copy.</li>
                    <li><strong>Anchor it on <code>ClauseRegistry</code>.</strong> Call <code>registerClause(clauseId, version, contentHash, contentURI, rpgfTag)</code> &mdash; permissionless, first-write-wins, permanent per <code>(name, version)</code>. Registering posts a reclaimable ETH deposit &mdash; staked intent, no time lock, reclaimed in full &mdash; not a fee. There is <strong>no per-clause validator to write or deploy</strong> &mdash; the generic proof engine validates any registered clause against the spec you anchored: registration alone makes the clause attestable and settleable, and the inventory above picks it up live from on-chain <code>ClauseRegistered</code> events.</li>
                </ol>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    The one lockstep that matters: the registered <code>contentHash</code> must match the pinned document, and the document must stay pinned. If they drift, the clause won&apos;t surface.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to look">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/sdk/clauses</code> &mdash; meta-clause validator, <code>validateContent</code>, and the generic <code>encodeContentFromSpec</code>. The canonical source of the spec format. See <Link href="/integrate" className="underline">Integrate</Link>.</li>
                    <li><strong>Registration path:</strong> <code>ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI, rpgfTag)</code> &mdash; permissionless, first-write-wins, immutable. No per-clause validator to deploy; the generic proof engine validates it in-proof against the anchored spec, so registration alone makes the clause attestable and settleable. Contract catalogue at <Link href="/spec" className="underline">/spec</Link>.</li>
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

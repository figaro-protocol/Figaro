import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { ClauseInventory } from "./_components/ClauseInventory";

// RULED 2026-08-06 (operator), AMENDED 2026-08-12 (operator): this page holds
// FIVE things and nothing else — what a clause IS (a contract clause,
// verifiable; it may include attestations but is NOT an attestation), the
// writing requirements as BULLETS (never an exposé), the live inventory, the
// hash-identity reference (§ "What the hash covers", the clause mirror of
// /assemblies' § "What the composition hash covers" — it lives on the concept
// page, never forked onto the register tool), and the add-your-own + RPGF
// invitation with EXACTLY ONE link to the register page.
// Public/private data belongs to /data — the disposition section died here.
export const metadata: Metadata = withOg({
    title: "Clauses — Figaro Protocol",
    description:
        "A clause is what it is in a paper contract — one reusable term of a deal — made verifiable: its spec public and hash-anchored on-chain. The requirements for writing one, the live registry inventory, and the RPGF reward for clauses that get used.",
});

export default function Clauses() {
    return (
        <>
            <MarketingHero
                title="A contract clause, made verifiable."
                lead={
                    <>
                        A clause here is what a clause is in a paper contract: one reusable term a deal is built from &mdash; how a dispute escalates, how emissions get reported, how a delivery address is handled. Contrary to paper clauses, a Figaro clause is verifiable: its spec is a public document, identified by a hash over its own content and anchored on-chain, so what a deal&apos;s terms say can be checked, not asserted. A clause can include attestations &mdash; evidence recorded while the deal runs &mdash; but a clause is not an attestation.
                    </>
                }
            />

            <MarketingSection title="Writing a clause.">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed list-disc pl-5">
                    <li>One canonical JSON document: <code>clauseId</code>, <code>version</code>, <code>title</code>, <code>description</code>, and the <code>fields</code> the clause carries.</li>
                    <li>It passes the public well-formedness check &mdash; <code>parseClauseSpec</code> from <code>@figaro/sdk/clauses</code>, the same validator the registration form runs.</li>
                    <li>It registers on <code>ClauseRegistry</code> &mdash; permissionless, permanent per <code>(name, version)</code> &mdash; staking a small reclaimable ETH deposit (<Link href="/faq#builders-registries" className="underline">the registry terms in full</Link>).</li>
                    <li>Nothing else, ever: a clause is data, not code. No per-clause contract exists, and a registered clause is immediately usable in agreements and settleable.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Registered clauses, by article.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set spans assembly topology, commerce primitives, emissions accounting, lifecycle and proximity, sovereign process logs, and legal anchoring. One &mdash; <code>figaro-topology</code> &mdash; is agreement-only: committed at agreement signing, with no on-chain validator.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    For agents: this inventory derives from the live <code>ClauseRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro/sdk</code> &mdash; see <Link href="/spec" className="underline">/spec</Link> for the deployment record.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                    There is no static roster of clauses &mdash; the count is derived, never stored. The canonical spec source for the reference set is the <a href="https://github.com/figaro-protocol/Figaro/tree/main/clauses" target="_blank" rel="noopener noreferrer" className="underline"><code>clauses/</code> directory</a> in the repository; on chain, discover every registered clause (reference or third-party) the same way this inventory does &mdash; by reading the <code>ClauseRegistry</code>&apos;s <code>ClauseRegistered</code> event stream.
                </p>
                <ClauseInventory />
            </MarketingSection>

            <MarketingSection title="What the hash covers." sectionId="what-the-hash-covers">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>The shape has a name: a clause spec is a Ricardian contract.</strong> If you already know Grigg&apos;s design, take the shortcut &mdash; it is the whole clause model in one sentence, and you can stop deriving it. Grigg defined a Ricardian contract as a single document that is at once readable by people, parsable by programs, digitally signed, and identified by a hash over its own content. A clause spec is that shape, with the signature moved to where Figaro binds it: <code>block</code> is the half people read, <code>fields</code> is the half programs parse, both ship as one document, and <code>contentHash</code> &mdash; keccak over the canonical serialization, anchored on <code>ClauseRegistry</code> &mdash; identifies the document by its own content. Rather than the author clearsigning the spec, the spec is <em>anchored</em> by whoever registers it and <em>signed into force</em> by the parties who use it: the values filled under your <code>fields</code> become a merkle leaf in the <code>agreementHash</code> that buyer and seller each sign with EIP-712.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>What Figaro does not take from that lineage is the issuer and the legal backstop.</strong> Grigg&apos;s definition opens with a contract <em>offered by an issuer to holders</em> for a right <em>managed by the issuer</em>, and his aim was a document a court would accept as the agreement. Figaro takes neither. There is no issuer: the author of a clause is not a party to the deals that use it &mdash; you publish a shape, and the buyer and seller who use it are the ones who sign. And a clause carries no legal weight by construction. What makes the deal hold is the bonding equilibrium &mdash; cooperation weakly dominates defection for both parties. If the parties compose an external forum in, it reads the commitment as evidence; it is not what enforces it, and the dispute layer is provider-agnostic &mdash; Figaro names no forum.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed mb-4">
                    Ian Grigg, <a href="https://iang.org/papers/ricardian_contract.html" target="_blank" rel="noopener noreferrer" className="underline">The Ricardian Contract</a> &mdash; First IEEE International Workshop on Electronic Contracting (WEC), 6 July 2004; the form had been in use since 1996.
                </p>
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    Four different hashes are computed over what you write, and mixing them up is the single most expensive authoring mistake &mdash; registration is permanent and first-write-wins. The <strong>clause id</strong> is the registry key. The <strong><code>contentHash</code></strong> is the document&apos;s integrity anchor. The <strong><code>agreementHash</code></strong> is what a buyer and a seller actually sign, and the <strong><code>compositionHash</code></strong> is what a designer&apos;s assembly is. Here is exactly which part of your spec reaches which:
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">What you write</th>
                                <th scope="col" className="py-2 pr-4">Reaches</th>
                                <th scope="col" className="py-2">What it does</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4"><code>clauseId</code> + <code>version</code></td>
                                <td className="py-2 pr-4">the <strong>clause id</strong></td>
                                <td className="py-2">The on-chain key, <code>keccak256(abi.encode(clauseId, version))</code>. Nothing else enters it &mdash; not <code>block</code>, not <code>fields</code>. First-write-wins, permanent.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">the <strong>whole document</strong> &mdash; <code>title</code>, <code>description</code>, <code>fields</code>, and <em>all</em> of <code>block</code></td>
                                <td className="py-2 pr-4"><strong><code>contentHash</code></strong></td>
                                <td className="py-2">The integrity anchor <code>ClauseRegistry</code> stores and the batch verifier binds witness specs to. It is a hash over the <em>raw canonical bytes</em>, so editorial text inside <code>block</code> is covered: change a label, get a different <code>contentHash</code>. Pin those exact bytes.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.design.article: &quot;mandatory&quot;</code></td>
                                <td className="py-2 pr-4"><strong><code>compositionHash</code></strong> + <strong><code>agreementHash</code></strong></td>
                                <td className="py-2">Auto-folds your clause into <em>every</em> template agreement, whether or not a designer chose it. This is how <code>figaro-commerce</code> and <code>figaro-topology</code> ride along.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.design.article: &quot;attestations&quot;</code></td>
                                <td className="py-2 pr-4"><strong><code>agreementHash</code></strong></td>
                                <td className="py-2">Makes the clause a process log: its section is committed as an <em>empty anchor</em> and filled by attestation afterwards. Field <code>default</code>s are <strong>not</strong> applied to it.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.design.scope: &quot;assembly&quot;</code></td>
                                <td className="py-2 pr-4"><strong><code>compositionHash</code></strong> + <strong><code>agreementHash</code></strong></td>
                                <td className="py-2">Marks a term of the composition itself (a denomination pin, a dispute forum): composed <em>once</em> for the whole design, then folded into <em>every</em> agreement at checkout, so every party signs it. Composing it on a single order is a build error, not a silent no-op.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.design.fills</code></td>
                                <td className="py-2 pr-4"><strong><code>compositionHash</code></strong></td>
                                <td className="py-2">Names the fields whose <em>designer-authored</em> values survive into the published template &mdash; the tailoring. Name nothing here and the template carries <code>{"{}"}</code> for your clause: the fields become transaction particulars, filled at checkout.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.checkout.catalogueFills</code> · <code>block.checkout.profileFills</code></td>
                                <td className="py-2 pr-4"><strong><code>agreementHash</code></strong></td>
                                <td className="py-2">Names which of your fields the seller&apos;s catalogue (per-item) and profile (master data) folds write onto the leaf at checkout. A field not named here is never folded &mdash; it stays empty unless a party types it.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">a field&apos;s <code>default</code></td>
                                <td className="py-2 pr-4"><strong><code>agreementHash</code></strong></td>
                                <td className="py-2"><strong>Typed as composition metadata; it is not inert.</strong> When the composing input omits the field, the spec&apos;s own <code>default</code> fills it &mdash; and that value lands in the signed section, changing the merkle leaf and therefore the hash both parties sign. Declare a default only when you would be content for a party to sign it having never seen it.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">everything else in <code>block</code> &mdash; <code>label</code>, <code>nestsUnder</code>, the <code>runtime</code> section</td>
                                <td className="py-2 pr-4"><strong><code>contentHash</code></strong> only</td>
                                <td className="py-2">Genuine presentation. It moves the document&apos;s anchor (everything does) but never changes what a template or an agreement contains.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    You do not have to take this on trust &mdash; every row is a pure function you can call. <code>parseProjectionHints(spec)</code> returns exactly the five hash-load-bearing hints it found in your <code>block</code>; <code>buildOrderAgreement</code> shows you the section a party would sign; <code>canonicalContentHash</code> is the registry anchor. All from <code>@figaro/sdk</code>, no chain needed:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mt-3"><code>{`import { parseProjectionHints, buildOrderAgreement,
         canonicalContentHash } from "@figaro/sdk";

parseProjectionHints(spec);
// → { article, scope, designFills, catalogueFills, profileFills }
//   — the five. Everything else in \`block\` is not returned.

const specs = { get: () => spec, list: () => [spec] };
buildOrderAgreement(buyer, seller, { "figaro-probe": {} }, specs);
// → { agreement, agreementHash } — inspect agreement.sections[0].data
//   to see which \`default\`s got filled in before signing.`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Two <code>article</code> values are reserved &mdash; and picking one by accident is silent.</strong> The group a clause files under, <code>block.design.article</code>, is free text, but <code>&quot;mandatory&quot;</code> and <code>&quot;attestations&quot;</code> mean something to the SDK &mdash; the two rows above. <code>&quot;mandatory&quot;</code> auto-folds the clause into <em>every</em> template agreement (that is how <code>figaro-commerce</code> and <code>figaro-topology</code> ride along). <code>&quot;attestations&quot;</code> makes the clause a <em>process log</em>: its content is an empty anchor at commit, filled by attestation afterwards. Both are read straight off your spec &mdash; nothing warns you, nothing throws, and the clause simply behaves differently than you meant. The trap is that the reserved words are the natural ones: an attestation clause grouped, reasonably, under &ldquo;attestations&rdquo; silently commits empty. Registration is <strong>permanent and first-write-wins</strong>, so if that is not what you want, group it under any other word before you register.
                </p>
                <h3 className="text-heading-h3 text-ink-heading mt-10 mb-4">
                    One spec. Two enforcement layers. In lockstep.
                </h3>
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
                    Off-chain well-formedness gates every signature. The batched, proof-based settlement path then re-checks it on-chain: a single generic SP1 proof engine validates each clause&apos;s content against its spec &mdash; supplied to the proof as a witness &mdash; and <code>FigaroBatchVerifier</code> settles the batch only if every witness spec&apos;s hash equals the <code>contentHash</code> the <code>ClauseRegistry</code> anchors for that clause. The engine&apos;s verification key covers the <em>engine</em>, not a clause list, so a never-seen clause settles through the proven path with zero code changes. There are no per-clause validator contracts, by design &mdash; a clause is data, not code. (A local devnet runs behind a mock verifier; wherever the deployment record names a network with a wired SP1 gateway, it points at Succinct&apos;s SP1 gateway + program vkey from env instead &mdash; a config change, not a code change.)
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mt-4">
                    The assembly side of the same question &mdash; what enters an assembly&apos;s <code>compositionHash</code>, and what is excluded from it &mdash; is on <Link href="/assemblies" className="underline">Assemblies</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Add your own." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed">
                    Anyone who meets those requirements can register a clause &mdash; no permission, no gatekeeper: <Link href="/clauses/register" className="underline">Register a clause</Link>. A registered clause that gets used earns from the protocol&apos;s retroactive public-goods funding &mdash; the reward follows real usage alone; see <Link href="/rpgf" className="underline">RPGF</Link>.
                </p>
            </MarketingSection>

        </>
    );
}

import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";
import { RegistryCountLink } from "@/components/registries/RegistryCountLink";

// This page holds SIX things and nothing else: what a clause IS (a contract
// clause, verifiable; it may include attestations but is NOT an attestation);
// the § "In plain words" opener carrying the register-shift warning (the device
// is /assemblies', copied rather than re-invented); the writing requirements as
// BULLETS, never an exposé; the live registry COUNT plus a link into
// /registries (the inventory itself lives in the registry explorer); the
// hash-identity reference (§ "What the hash covers", the clause mirror of
// /assemblies' § "What the composition hash covers" — it belongs on the concept
// page, never forked onto the register tool); and the add-your-own + RPGF
// invitation with EXACTLY ONE link to the register page.
// The page is not split — no /clauses/authoring route exists. Public/private
// data disposition belongs to /data, not here.
export const metadata: Metadata = withOg({
    title: "Clauses — Figaro Protocol",
    description:
        "A clause is what it is in a paper contract — one reusable term of a deal — made verifiable: its spec public and hash-anchored on-chain. The requirements for writing one, the live registry count, and the RPGF reward for clauses that get used.",
});

export default function Clauses() {
    return (
        <>
            <MarketingHero
                title="A contract clause, made verifiable."
                lead={
                    <>
                        A clause here is what a clause is in a paper contract: one reusable term a trade is built from &mdash; how a dispute escalates, how emissions get reported, how a delivery address is handled. Contrary to paper clauses, a Figaro clause is verifiable: its spec is a public document, identified by a hash over its own content and anchored on-chain, so what a trade&apos;s terms say can be checked, not asserted. A clause can include <Link href="/attestations" className="underline">attestations</Link> &mdash; evidence filed while the trade runs &mdash; but a clause is not an attestation.
                    </>
                }
            />

            <MarketingSection title="In plain words.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Somebody writes a term once and publishes it; anyone whose deal needs that term composes it in without writing it again, and nobody asks permission either way. A clause is data, not code &mdash; the terms of a deal, written down so that a person and a program read the same document. What follows below gets technical &mdash; the requirements for writing one, exactly which part of a spec reaches which hash, what registering costs and what it permanently commits you to.
                </p>
            </MarketingSection>

            <MarketingSection title="Writing a clause.">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed list-disc pl-5">
                    <li>One canonical JSON document: <code>clauseId</code>, <code>version</code>, <code>title</code>, <code>description</code>, and the <code>fields</code> the clause carries.</li>
                    <li>It passes the public well-formedness check &mdash; <code>parseClauseSpec</code> from <code>@figaro-protocol/sdk/clauses</code>, the same validator the registration form runs.</li>
                    <li>It registers on <code>ClauseRegistry</code> &mdash; permissionless and first-write-wins &mdash; on the deposit terms every registry here shares (<Link href="/faq#builders-registries" className="underline">what the deposit does, and what withdrawing it leaves behind</Link>). What is specific to a clause binding: it is permanent per <code>(name, version)</code>, so withdrawing the deposit moves the stake and the listing but never the clause &mdash; agreements already committed against it keep resolving forever.</li>
                    <li>Nothing else, ever: a registered clause is immediately usable in agreements and settleable.</li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Registered clauses.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every clause declares the article it belongs to, and the registry explorer sorts and facets whatever is registered by that declaration rather than by any list kept here. Today the reference set runs from the mandatory terms every deal carries, through logistics, coordination and attestations, consent and credentials, data and emissions, to dispute resolution and settlement. One &mdash; <code>figaro-topology</code> &mdash; carries the deal&apos;s shape, which seller follows which, and is <em>agreement-only</em>: committed at signing like every other clause, as a merkle leaf under the <code>agreementHash</code> that anyone can prove inclusion of on chain, but never re-asserted as a runtime attestation in the <Link href="/glossary#assembly" className="underline">assemblies</Link> published so far. A long chain can attest topology as evidence that one seller performed after another; today&apos;s published assemblies simply have not.
                </p>
                <RegistryCountLink family="clauses" />
            </MarketingSection>

            <MarketingSection title="What the hash covers." sectionId="what-the-hash-covers">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    <strong>The shape has a name: a clause spec is a <a href="https://iang.org/papers/ricardian_contract.html" target="_blank" rel="noopener noreferrer" className="underline">Ricardian contract</a></strong> &mdash; Grigg&apos;s single document that people read, programs parse, and a hash over its own content identifies: <code>block</code> is the half people read, <code>fields</code> the half programs parse, and <code>contentHash</code>, anchored on <code>ClauseRegistry</code> under the clauseId and version, is the integrity anchor. What Figaro does not take from that lineage is the issuer and the legal backstop &mdash; a clause&apos;s author is not a party to the deals that use it, and what makes those deals hold is the bonding equilibrium rather than anything the document says; clause design as a discipline is treated in <Link href="/papers/protocol-composition" className="underline">Protocol Composition</Link> &sect; 4.
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
                                <td className="py-2">Auto-folds your clause into <em>every</em> template agreement, whether or not a designer chose it. This is how the three mandatory clauses &mdash; <code>figaro-commerce</code>, <code>figaro-topology</code>, and <code>figaro-assembly-provenance</code> &mdash; ride along.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4"><code>block.design.article: &quot;attestations&quot;</code></td>
                                <td className="py-2 pr-4"><strong><code>agreementHash</code></strong></td>
                                <td className="py-2">Makes the clause a process log: its section is committed as an <em>empty anchor</em> &mdash; a convention the SDK warns on rather than enforces &mdash; and filled by attestation afterwards. Field <code>default</code>s are <strong>not</strong> applied to it.</td>
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
                    You do not have to take this on trust &mdash; every row is a pure function you can call. <code>parseProjectionHints(spec)</code> returns exactly the five hash-load-bearing hints it found in your <code>block</code>; <code>buildOrderAgreement</code> shows you the section a party would sign; <code>canonicalContentHash</code> is the registry anchor. All from <code>@figaro-protocol/sdk</code>, no chain needed:
                </p>
                <pre className="text-xs font-mono text-ink-body bg-paper border border-default rounded-section p-4 overflow-x-auto mt-3"><code>{`import { parseProjectionHints, buildOrderAgreement,
         canonicalContentHash } from "@figaro-protocol/sdk";

parseProjectionHints(spec);
// → { article, scope, designFills, catalogueFills, profileFills }
//   — the five. Everything else in \`block\` is not returned.

const specs = { get: () => spec, list: () => [spec] };
buildOrderAgreement(buyer, seller, { "figaro-probe": {} }, specs);
// → { agreement, agreementHash } — inspect agreement.sections[0].data
//   to see which \`default\`s got filled in before signing.`}</code></pre>
                <p className="text-sm text-ink-body leading-relaxed mt-5">
                    <strong>Two <code>article</code> values are reserved &mdash; and picking one by accident is silent.</strong> The group a clause files under, <code>block.design.article</code>, is free text, but <code>&quot;mandatory&quot;</code> and <code>&quot;attestations&quot;</code> mean something to the SDK &mdash; the two rows above say exactly what. Both are read straight off your spec &mdash; nothing warns you, nothing throws, and the clause simply behaves differently than you meant. The trap is that the reserved words are the natural ones: an attestation clause grouped, reasonably, under &ldquo;attestations&rdquo; silently commits empty. Registration is <strong>permanent and first-write-wins</strong>, so if that is not what you want, group it under any other word before you register. This is the first entry on <Link href="/pitfalls" className="underline">Sharp edges</Link>, which indexes the rest of the silent ones &mdash; the traps that bite at commit, at resolve, and when you read settled state back.
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
                        <span><strong>Validation (TypeScript).</strong> The SDK&apos;s <code>parseClauseSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. The format they check against is written down as a JSON Schema with domain types (hex bytes, addresses, ISO datetimes, enums) &mdash; it ships inside the package you install, at <code>src/clauses/clause-spec.schema.json</code>, and is readable without installing anything <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/src/clauses/clause-spec.schema.json" target="_blank" rel="noopener noreferrer" className="underline">in the public repo</a>. The schema is <strong>open by design</strong> &mdash; unknown fields are tolerated and ignored, so the format itself is never gatekept: extend the shape with fields the protocol has never seen and it grows by versioning, the same way clauses register without permission. This off-chain check gates every signature; the same spec drives the in-proof content check on the batched settlement path (below).</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-24 shrink-0 uppercase">On-chain</span>
                        <span><strong>Registration + merkle binding.</strong> <code>ClauseRegistry</code> anchors the clauseId and its spec locator (first-write-wins, immutable); the attestation coordinator binds every attestation to the signed <code>agreementHash</code> by merkle inclusion proof and content-hashes the evidence. On this direct attestation path the chain validates <em>no</em> content shape, so a never-seen clause is attestable the moment it is registered. The batched, proof-based settlement path adds the on-chain content check &mdash; see below.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    Off-chain well-formedness gates every signature. The batched, proof-based settlement path then re-checks it on-chain: a single generic SP1 proof engine validates each clause&apos;s content against its spec &mdash; supplied to the proof as a witness &mdash; and <code>FigaroBatchVerifier</code> settles the batch only if every witness spec&apos;s hash equals the <code>contentHash</code> the <code>ClauseRegistry</code> anchors for that clause. The engine&apos;s verification key covers the <em>engine</em>, not a clause list, so a never-seen clause settles through the proven path with zero code changes. There are no per-clause validator contracts, by design &mdash; a clause is data, not code. (A local development run sits behind a mock verifier; wherever the deployment record names a network with a wired SP1 gateway, it points at Succinct&apos;s SP1 gateway + program vkey from env instead &mdash; a config change, not a code change.)
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mt-4">
                    The assembly side of the same question &mdash; what enters an assembly&apos;s <code>compositionHash</code>, and what is excluded from it &mdash; is on <Link href="/assemblies" className="underline">Assemblies</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Add your own." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed">
                    Anyone who meets those requirements can register a clause. No permission, no gatekeeper. A registered clause that gets used earns from the protocol&apos;s retroactive public-goods funding &mdash; the reward follows real usage alone; see <Link href="/rpgf" className="underline">RPGF</Link>.
                </p>
                <CtaLink href="/clauses/register" className="mt-5" data-testid="cta-register-clause">
                    Register a clause
                </CtaLink>
            </MarketingSection>

        </>
    );
}

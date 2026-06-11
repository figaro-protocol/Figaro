import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { ClauseInventory } from "./_components/ClauseInventory";

export const metadata: Metadata = {
    title: "Clauses — Figaro Protocol",
    description:
        "The clause architecture: client TypeScript and on-chain Solidity validators (with an SP1 Rust mirror pending) parsing one canonical JSON spec per clause. The inventory reads on-chain ClauseRegistry events directly.",
};

export default function Clauses() {
    return (
        <>
            <MarketingHero
                title="Three layers of validation."
                lead={
                    <>
                        A clause in Figaro is the on-chain content type of an attestation &mdash; a structured piece of evidence emitted during the lifecycle of a bonded process. Every attestation under a registered <code>clauseId</code> is validated identically by client TypeScript and on-chain Solidity (with an SP1 Rust mirror pending). The reference clauses register on-chain when the protocol deploys; anyone can register more, without permission.
                    </>
                }
            />

            <MarketingSection title="One spec. Three validators. Enforced in lockstep.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered clause is enforced at three layers. A new clause is not &ldquo;done&rdquo; until all required layers ship together:
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer A</span>
                        <span><strong>Client-side (TypeScript).</strong> The SDK&apos;s <code>parseClauseSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. Closed subset of JSON Schema with domain types (hex bytes, addresses, ISO datetimes, enums). Catches form errors before they reach chain.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer B</span>
                        <span><strong>Prover (Rust, deferred).</strong> A byte-for-byte mirror of the Layer A validator, compiled into the SP1 prover for batched attestation verification. Not yet live; the TypeScript validator is the conformance spec for the Rust port.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer C</span>
                        <span><strong>On-chain (Solidity).</strong> The clauseId binds to an <code>IClauseValidator</code> contract. The attestation coordinator calls it on every attestation; malformed content reverts with a typed custom error. First-write-wins and immutable &mdash; once bound to a clauseId, the validator address cannot be changed.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    All layers parse the same canonical JSON spec and apply the same validation rules. The cross-layer consistency is the discipline; today it&apos;s enforced between Layer A and Layer C, with Layer B closing the loop when shipped. Bytes that Layer A rejects will also be rejected by Layer C.
                </p>
            </MarketingSection>

            <MarketingSection title="Registered clauses, by article.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set spans assembly topology, commerce primitives, emissions accounting and offsets, lifecycle and proximity, sovereign process logs, and legal anchoring. One &mdash; <code>figaro-topology-v1</code> &mdash; is manifest-only: committed at agreement signing, with no on-chain validator.
                </p>
                <ClauseInventory />
            </MarketingSection>

            <MarketingSection title="The nine-step checklist.">
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li>Write the JSON spec at <code>sdk/src/clauses/examples/&lt;your-clause&gt;.json</code>.</li>
                    <li>Mirror it in <code>frontend/lib/shared/clauses/&lt;your-clause&gt;.json</code> so the UI can preload it.</li>
                    <li>Write the SDK content encoder in <code>sdk/src/clauses/encode.ts</code> and export from <code>index.ts</code>.</li>
                    <li>Add a conformance test in <code>sdk/tests/clauses/examples.test.ts</code>.</li>
                    <li>Write the Solidity validator at <code>src/clauseValidators/Foo&lt;Clause&gt;V1Validator.sol</code> &mdash; ABI-decode content, revert with typed custom errors.</li>
                    <li>Write Foundry tests at <code>test/clauseValidators/</code> covering happy paths and every typed revert.</li>
                    <li>Mirror the validator in the Rust prover when Layer B is live (deferred).</li>
                    <li>Register the spec on <code>ClauseRegistry</code> with its IPFS pointer (<code>scripts/populate-clauses.mjs</code> for the reference set; <code>ClauseRegistrationHelper</code> for third parties) &mdash; the UI loads every spec chain&rarr;IPFS; there is no bundled copy. Its tier and its article are read from the spec&apos;s <code>block.tier</code> and <code>block.article</code> &mdash; no separate maps. The designer drawer groups by article; the inventory above reads its set live from on-chain <code>ClauseRegistered</code> events and draws each title and article from the spec.</li>
                    <li>
                        Wire <code>setValidator(clauseId, validator)</code> into <code>script/Deploy.s.sol</code> and <code>script/DeployMainnet.s.sol</code>; add a regression test in <code>test/DeployScriptTest.t.sol</code>. <strong>For third-party clauses registered post-deploy, use{" "}
                        <code>ClauseRegistrationHelper.registerClauseAndValidator(...)</code></strong>{" "}
                        instead &mdash; atomic register+bind in one transaction; closes the front-running window between separate <code>registerClause</code> and <code>setValidator</code> calls.
                    </li>
                </ol>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    Skipping any step produces one of two failure modes: Layer A silently accepts content the on-chain validator would reject (spec drift), or Layer C rejects everything under the clauseId (missing registration). Lockstep is the invariant that makes the pattern worth using.
                </p>
            </MarketingSection>

            <MarketingSection title="Where to look">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/core/clauses</code> &mdash; meta-clause validator, <code>validateContent</code>, per-clause encoders. The canonical source of the spec format. See <Link href="/integrate" className="underline">Integrate</Link>.</li>
                    <li><strong>On-chain interface:</strong> <code>src/IClauseValidator.sol</code> &mdash; the two-method interface every on-chain validator implements. Contract catalogue at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Registration path:</strong> <code>AttestationCoordinator.setValidator(clauseId, validator)</code> &mdash; permissionless, first-write-wins, immutable once set. Atomic register+bind via <code>ClauseRegistrationHelper.registerClauseAndValidator(...)</code>.</li>
                    <li><strong>Kernel side:</strong> attestation receipts are bound to the signed <code>agreementHash</code> via merkle inclusion proof; the rationale is on <Link href="/protocol" className="underline">Protocol</Link>.</li>
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
                        <span className="text-ink-body"> &mdash; <code>@figaro/core</code>: ABIs, event parsers, content encoders, commitment builders.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

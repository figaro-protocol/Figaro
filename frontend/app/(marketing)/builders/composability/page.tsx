import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "Composability (builder architecture) — Figaro Protocol",
    description:
        "Builder-tier composability: the coordinator pattern's three sufficient conditions, the three tiers of extension, and the security boundary that holds across them. Property-side framing on /composability.",
};

export default function BuilderComposability() {
    return (
        <>
            <MarketingHero
                title="The pattern that preserves the equilibrium."
                lead={
                    <>
                        The property statement &mdash; what composability is and why the kernel&apos;s narrowness produces it &mdash; lives on{" "}
                        <Link href="/composability" className="underline">
                            /composability
                        </Link>
                        . This page is the architecture: the coordinator pattern&apos;s three sufficient conditions, the three tiers of extension, and the security boundary that holds across them.
                    </>
                }
            />

            <MarketingSection eyebrow="The coordinator pattern" title="Three sufficient conditions preserve the equilibrium.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Any internal exit path weakens the Nash equilibrium (Paper A, Theorem 4.7). So extensions live <em>outside</em> the kernel and compose via the coordinator pattern: the external reads kernel state and emits its own evidence, but observes three sufficient conditions.
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-6 mb-4">
                    <li><strong>Never writes to kernel state.</strong> External contracts cannot mutate <code>processes</code>, <code>orderStatus</code>, or <code>orderProcessId</code>. The kernel is the authoritative ledger of every commitment.</li>
                    <li><strong>Never reverses a resolution.</strong> Once <code>resolveProcess</code> has discharged a process tree, no external contract can claw back, refund, or retroactively re-open it. Settlement is terminal.</li>
                    <li><strong>Never controls a bond.</strong> Bonds are owned by <code>FigaroCore</code> until resolution; no external contract can seize, redirect, or substitute them. The collateral that makes defection irrational stays under kernel custody.</li>
                </ol>
                <p className="text-sm text-ink-muted">
                    Full doctrine:{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        PROTOCOL_EXTENSION_DOCTRINE.md
                    </a>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Three tiers of extension" title="Each tier carries a different blast radius.">
                <dl className="space-y-6 text-sm">
                    <div id="tier-1" className="border-l-2 border-default pl-6 scroll-mt-24">
                        <dt className="text-base font-semibold text-ink-heading mb-1">Tier 1 — Compose against existing primitives</dt>
                        <dd className="text-ink-body leading-relaxed">
                            An assembly is a configuration artifact that binds the deployed kernel, attestation coordinator, schema registry, and validators in force. No new on-chain code; the assembly is the only authored artifact. The equilibrium is unchanged because nothing new is deployed.
                        </dd>
                    </div>
                    <div id="tier-2" className="border-l-2 border-default-strong pl-6 scroll-mt-24">
                        <dt className="text-base font-semibold text-ink-heading mb-1">Tier 2 — Add a typed clause</dt>
                        <dd className="text-ink-body leading-relaxed">
                            Register a new <code>schemaId</code> and ship its validation layers in lockstep &mdash; TypeScript and Solidity today; SP1 Rust mirror pending. The settlement substrate is unchanged; the attestation surface extends. The kernel still gates every attestation through the validator; the new schema author owns the validator&apos;s correctness.
                        </dd>
                    </div>
                    <div id="tier-3" className="border-l-2 border-ink-heading pl-6 scroll-mt-24">
                        <dt className="text-base font-semibold text-ink-heading mb-1">Tier 3 — Add a mechanism</dt>
                        <dd className="text-ink-body leading-relaxed">
                            Deploy a mechanism primitive (allocation, pricing, discovery, coordination) above the kernel via the coordinator pattern. The kernel still enforces its invariants; the new contract must prove its own. Strongly recommended: external audit before mainnet deployment.
                        </dd>
                    </div>
                </dl>
                <p className="text-sm text-ink-muted mt-6">
                    Operational tools at each tier &mdash; Designer, Schemas, Contracts, SDK, Console &mdash; are catalogued at <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Security boundary" title="What the kernel guarantees stays guaranteed.">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Across every assembly that composes against the kernel, the same invariants hold. Across every extension authored above the kernel, the boundary of responsibility is the same.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <p className="text-sm font-semibold text-ink-heading mb-2">Enforced by the kernel</p>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed list-disc pl-5">
                            <li>Asymmetric bonding (2&times; payment / 2&times; cumulative value)</li>
                            <li>Progressive collateralization across sub-orders</li>
                            <li>Buyer-dominant atomic resolution</li>
                            <li>Merkle-bound attestation receipts against the signed agreement</li>
                            <li>Validator-gated attestation dispatch</li>
                            <li>Token conservation (Certora + Halmos + TLA⁺ verified)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-ink-heading mb-2">Outside the kernel</p>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed list-disc pl-5">
                            <li>Assembly correctness &mdash; the kernel records the declared structure; it does not verify the workflow is well-formed for its purpose.</li>
                            <li>Custom mechanism contracts &mdash; new failure modes belong to the contract, not the kernel.</li>
                            <li>Custom schema content &mdash; the validator enforces the declared shape; semantic correctness is the schema author&apos;s.</li>
                            <li>Role filling and identity &mdash; the kernel has no KYC. Participation gating is an assembly concern.</li>
                            <li>UI claims &mdash; representing protocol-level guarantees for properties the assembly does not enforce.</li>
                        </ul>
                    </div>
                </div>
                <p className="text-sm text-ink-muted mt-6">
                    Full layered enforcement model &mdash; economic / social / legal &mdash; on{" "}
                    <Link href="/protocol#enforcement" className="underline">Protocol &mdash; Enforcement</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Read next" bottomPad="wide">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>
                        {" — "}
                        the canonical on-chain surface: kernel, attestation coordinator, schema registry, validators in force, token, batch verifier, optional protocol contracts.
                    </li>
                    <li>
                        <Link href="/schemas" className="text-ink-heading font-medium hover:underline">Schemas</Link>
                        {" — "}
                        the three-layer validation architecture and the reference schema set.
                    </li>
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Integrate</Link>
                        {" — "}
                        the SDK surface: ABIs, event parsers, deterministic state reconstruction, agent context, schema encoders.
                    </li>
                    <li>
                        <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">Local Commerce</Link>
                        {" — "}
                        a worked reference assembly. Three roles, one root commitment, two sub-orders, atomic settlement.
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

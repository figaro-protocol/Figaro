import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Composability — Figaro Protocol",
    description:
        "What the kernel's narrowness produces, and the architecture that preserves it: the coordinator pattern's three sufficient conditions, the three tiers of composition, and the security boundary that holds across them.",
};

export default function Composability() {
    return (
        <>
            <MarketingHero
                title="What the kernel's narrowness produces."
                lead={
                    <>
                        <code>FigaroCore</code> takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Every other question lives above it &mdash; permissionless to add, permissionless to fork, equally bound by the same Nash equilibrium. What follows is both halves of composability: the property that narrowness produces, and the architecture that preserves it.
                    </>
                }
            />

            <MarketingSection title="Anyone can express anything; the equilibrium does not care.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Because the kernel only enforces bonded-commitment settlement, the graph above it is unconstrained. A market-liberal graph where every role is priced at auction, a cooperative graph where surplus routes back to contributors via programmatic shares, a mutual-aid graph where bonds are reciprocal rather than monetary &mdash; all use the same kernel. The ideological commitments live in the assembly, not in <code>FigaroCore</code>.
                </p>
            </MarketingSection>

            <MarketingSection title="Three sufficient conditions preserve the equilibrium.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Any internal exit path weakens the Nash equilibrium (Paper A, Theorem 4.7). So compositions live <em>outside</em> the kernel and attach via the coordinator pattern: the external reads kernel state and emits its own evidence, but observes three sufficient conditions.
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-6 mb-4">
                    <li><strong>Never writes to kernel state.</strong> External contracts cannot mutate <code>processes</code>, <code>orderStatus</code>, or <code>orderProcessId</code>. The kernel is the authoritative ledger of every commitment.</li>
                    <li><strong>Never reverses a resolution.</strong> Once <code>resolveProcess</code> has discharged a process, no external contract can claw back, refund, or retroactively re-open it. Settlement is terminal.</li>
                    <li><strong>Never controls a bond.</strong> Bonds are owned by <code>FigaroCore</code> until resolution; no external contract can seize, redirect, or substitute them. The collateral that makes defection irrational stays under kernel custody.</li>
                </ol>
                <p className="text-sm text-ink-muted">
                    Full doctrine:{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro/blob/main/docs/CLAUSES.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                    >
                        CLAUSES.md
                    </a>.
                </p>
            </MarketingSection>

            <MarketingSection title="Each tier carries a different blast radius.">
                <dl className="space-y-6 text-sm">
                    <div id="tier-1" className="border-l-2 border-default pl-6 scroll-mt-24">
                        <dt className="text-base font-semibold text-ink-heading mb-1">Tier 1 — Compose against existing primitives</dt>
                        <dd className="text-ink-body leading-relaxed">
                            An assembly is a configuration artifact that binds the deployed kernel, attestation coordinator, and clause registry. No new on-chain code; the assembly is the only authored artifact. The equilibrium is unchanged because nothing new is deployed.
                        </dd>
                    </div>
                    <div id="tier-2" className="border-l-2 border-default-strong pl-6 scroll-mt-24">
                        <dt className="text-base font-semibold text-ink-heading mb-1">Tier 2 — Add a typed clause</dt>
                        <dd className="text-ink-body leading-relaxed">
                            Register a new <code>clauseId</code> and ship its validation layers in lockstep &mdash; the TypeScript Layer&nbsp;A validator and its byte-parity Rust mirror, the generic SP1 proof engine. That engine is not per-clause: it validates any registered clause against its spec, supplied to the proof as a witness and anchored to the <code>ClauseRegistry</code> <code>contentHash</code> &mdash; so a never-seen clause settles through the batched, proof-based path with zero on-chain code. There are no per-clause validator contracts, by design; a clause is data, not code. The direct attestation path still merkle-binds and validates no content shape. The settlement substrate is unchanged; the attestation surface extends &mdash; the new clause author owns the spec&apos;s correctness.
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
                    Operational tools at each tier &mdash; Designer, Clauses, Contracts, SDK, Console &mdash; are catalogued at <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What the kernel enforces stays enforced.">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Across every assembly that composes against the kernel, the same invariants hold. Across every composition authored above the kernel, the boundary of responsibility is the same.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <p className="text-sm font-semibold text-ink-heading mb-2">Enforced by the kernel</p>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed list-disc pl-5">
                            <li>Asymmetric bonding (2&times; payment / 2&times; cumulative value)</li>
                            <li>Cumulative upstream bonding across sub-orders</li>
                            <li>Buyer-dominant atomic resolution</li>
                            <li>Merkle-bound attestation receipts against the signed agreement</li>
                            <li>Proof-gated clause-content validation on the batched settlement path (FigaroBatchVerifier &mdash; a composition above the frozen kernel; devnet-live)</li>
                            <li>Token conservation (Certora + Halmos + TLA⁺ verified)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-ink-heading mb-2">Outside the kernel</p>
                        <ul className="space-y-2 text-sm text-ink-body leading-relaxed list-disc pl-5">
                            <li>Assembly correctness &mdash; the kernel records the declared structure; it does not verify the workflow is well-formed for its purpose.</li>
                            <li>Custom mechanism contracts &mdash; new failure modes belong to the contract, not the kernel.</li>
                            <li>Custom clause content &mdash; the off-chain validator enforces the declared shape; semantic correctness is the clause author&apos;s.</li>
                            <li>Role filling and identity &mdash; the kernel has no KYC. Participation gating is an assembly concern.</li>
                            <li>UI claims &mdash; representing protocol-level guarantees for properties the assembly does not enforce.</li>
                        </ul>
                    </div>
                </div>
            </MarketingSection>

            <MarketingSection title="Read next">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>
                        {" — "}
                        how the lockbox works, in plain language.
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>
                        {" — "}
                        the canonical on-chain surface: kernel, attestation coordinator, clause registry, token.
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        {" — "}
                        the off-chain clause-validation architecture and the reference clause set.
                    </li>
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Integrate</Link>
                        {" — "}
                        the SDK surface: ABIs, event parsers, deterministic state reconstruction, clause encoders.
                    </li>
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
                        <span className="text-ink-body"> &mdash; the validation architecture, the reference clauses, and the authoring checklist.</span>
                    </li>
                    <li>
                        <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>
                        <span className="text-ink-body"> &mdash; how autonomous agents participate through the same primitives humans do; ERC-8004 interop and how an operator transacts.</span>
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

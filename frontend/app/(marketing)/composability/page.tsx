import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "Composability — Figaro Protocol",
    description:
        "Composability is what the kernel's narrowness produces. Extensions live outside the kernel and compose via the coordinator pattern (Theorem 4.7); three sufficient conditions preserve the bonding equilibrium across them. Three tiers of extension; one security boundary.",
};

export default function Composability() {
    return (
        <>
            <MarketingHero
                eyebrow="Composability"
                title="What the kernel's narrowness produces."
                lead={
                    <>
                        <code>FigaroCore</code> takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Every other question lives above &mdash; permissionless to add, permissionless to fork, equally bound by the same Nash equilibrium. The mechanism derivation is on <Link href="/protocol" className="underline hover:text-black">Protocol</Link>; the academic frame on <Link href="/cryptoeconomics" className="underline hover:text-black">Cryptoeconomics</Link>; identity / lineage / posture on <Link href="/about" className="underline hover:text-black">About</Link>.
                    </>
                }
            />

            <MarketingSection eyebrow="The property" title="Anyone can express anything; the equilibrium does not care.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Because the kernel only enforces bonded-commitment settlement, the graph above it is unconstrained. A market-liberal graph where every role is priced at auction, a cooperative graph where surplus routes back to contributors via programmatic shares, a mutual-aid graph where bonds are reciprocal rather than monetary &mdash; all use the same kernel. The ideological commitments live in the assembly, not in <code>FigaroCore</code>.
                </p>
                <p className="text-sm text-gray-600">
                    Full multi-graph treatment, including the political-posture frame, on{" "}
                    <Link href="/about" className="underline hover:text-black">About &mdash; Ideological agnosticism</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="The coordinator pattern" title="Three sufficient conditions preserve the equilibrium.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Any internal exit path weakens the Nash equilibrium (Paper A, Theorem 4.7). So extensions live <em>outside</em> the kernel and compose via the coordinator pattern: the external reads kernel state and emits its own evidence, but observes three sufficient conditions.
                </p>
                <ol className="space-y-3 text-base text-gray-700 leading-relaxed list-decimal pl-6 mb-4">
                    <li><strong>Never writes to kernel state.</strong> External contracts cannot mutate <code>processes</code>, <code>orderStatus</code>, or <code>orderProcessId</code>. The kernel is the authoritative ledger of every commitment.</li>
                    <li><strong>Never reverses a resolution.</strong> Once <code>resolveProcess</code> has discharged a process tree, no external contract can claw back, refund, or retroactively re-open it. Settlement is terminal.</li>
                    <li><strong>Never controls a bond.</strong> Bonds are owned by <code>FigaroCore</code> until resolution; no external contract can seize, redirect, or substitute them. The collateral that makes defection irrational stays under kernel custody.</li>
                </ol>
                <p className="text-sm text-gray-600">
                    Full doctrine:{" "}
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-black"
                    >
                        PROTOCOL_EXTENSION_DOCTRINE.md
                    </a>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Three tiers of extension" title="Each tier carries a different blast radius.">
                <dl className="space-y-6 text-sm">
                    <div className="border-l-2 border-gray-300 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Tier 1 — Compose against existing primitives</dt>
                        <dd className="text-gray-700 leading-relaxed">
                            An assembly is a configuration artifact that binds the deployed kernel, attestation coordinator, schema registry, and validators in force. No new on-chain code; the assembly is the only authored artifact. The equilibrium is unchanged because nothing new is deployed.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-500 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Tier 2 — Add a typed clause</dt>
                        <dd className="text-gray-700 leading-relaxed">
                            Register a new <code>schemaId</code> and ship its validation layers in lockstep &mdash; TypeScript and Solidity today; SP1 Rust mirror pending. The settlement substrate is unchanged; the attestation surface extends. The kernel still gates every attestation through the validator; the new schema author owns the validator&apos;s correctness.
                        </dd>
                    </div>
                    <div className="border-l-2 border-black pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Tier 3 — Add a mechanism</dt>
                        <dd className="text-gray-700 leading-relaxed">
                            Deploy a mechanism primitive (allocation, pricing, discovery, coordination) above the kernel via the coordinator pattern. The kernel still enforces its invariants; the new contract must prove its own. Strongly recommended: external audit before mainnet deployment.
                        </dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-6">
                    Operational tools at each tier &mdash; Designer, Authoring Studio, Registered assemblies, Schemas, Contracts, SDK, Console &mdash; are catalogued at <Link href="/builders" className="underline hover:text-black">/builders</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Security boundary" title="What the kernel guarantees stays guaranteed.">
                <p className="text-base text-gray-700 leading-relaxed mb-6">
                    Across every assembly that composes against the kernel, the same invariants hold. Across every extension authored above the kernel, the boundary of responsibility is the same.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <p className="text-sm font-semibold text-black mb-2">Enforced by the kernel</p>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Asymmetric bonding (2&times; payment / 2&times; cumulative value)</li>
                            <li>Progressive collateralization across sub-orders</li>
                            <li>Buyer-dominant atomic resolution</li>
                            <li>Merkle-bound attestation receipts against the signed agreement</li>
                            <li>Validator-gated attestation dispatch</li>
                            <li>Token conservation (Certora + Halmos + TLA⁺ verified)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-black mb-2">Outside the kernel</p>
                        <ul className="space-y-2 text-sm text-gray-700 leading-relaxed list-disc pl-5">
                            <li>Assembly correctness &mdash; the kernel records the declared structure; it does not verify the workflow is well-formed for its purpose.</li>
                            <li>Custom mechanism contracts &mdash; new failure modes belong to the contract, not the kernel.</li>
                            <li>Custom schema content &mdash; the validator enforces the declared shape; semantic correctness is the schema author&apos;s.</li>
                            <li>Role filling and identity &mdash; the kernel has no KYC. Participation gating is an assembly concern.</li>
                            <li>UI claims &mdash; representing protocol-level guarantees for properties the assembly does not enforce.</li>
                        </ul>
                    </div>
                </div>
                <p className="text-sm text-gray-600 mt-6">
                    Full layered enforcement model &mdash; economic / social / legal &mdash; on{" "}
                    <Link href="/protocol#enforcement" className="underline hover:text-black">Protocol &mdash; Enforcement</Link>.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Read next" bottomPad="wide">
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li>
                        <Link href="/local-commerce" className="text-black font-medium hover:underline">Local Commerce</Link>
                        {" — "}
                        a worked reference assembly. Three roles, one root commitment, two sub-orders, atomic settlement.
                    </li>
                    <li>
                        <Link href="/spec" className="text-black font-medium hover:underline">Specifications</Link>
                        {" — "}
                        the canonical on-chain surface: kernel, attestation coordinator, schema registry, validators in force, token, batch verifier, optional protocol contracts.
                    </li>
                    <li>
                        <Link href="/schemas" className="text-black font-medium hover:underline">Schemas</Link>
                        {" — "}
                        the three-layer validation architecture and the reference schema set.
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

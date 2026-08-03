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
                    Any internal exit path weakens the Nash equilibrium &mdash; the <Link href="/papers/asymmetric-bonding" className="underline">escape-hatch theorem</Link>. So compositions live <em>outside</em> the kernel and attach via the coordinator pattern: the external reads kernel state and emits its own evidence, but observes three sufficient conditions.
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-6 mb-4">
                    <li><strong>Never writes to kernel state.</strong> External contracts cannot mutate <code>processes</code>, <code>orderStatus</code>, or <code>orderProcessId</code>. The kernel is the authoritative ledger of every commitment.</li>
                    <li><strong>Never reverses a resolution.</strong> Once <code>resolveProcess</code> has discharged a process, no external contract can claw back, refund, or retroactively re-open it. Settlement is terminal.</li>
                    <li><strong>Never controls a bond.</strong> Bonds are owned by <code>FigaroCore</code> until resolution; no external contract can seize, redirect, or substitute them. The collateral that makes defection irrational stays under kernel custody.</li>
                </ol>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Those three conditions govern what a composition <em>writes</em>. There is a fourth thing to get right, and it governs what it <strong>reads</strong>: <strong>settlement happens on two disjoint paths, and a composition that gates on <code>orderStatus</code> is blind to one of them.</strong> <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> share no state and never call each other &mdash; the batched, proof-based path executes <code>commit</code> and <code>resolveProcess</code> inside the proof, so a batch-settled process never acquires kernel status: <code>core.orderStatus(orderHash)</code> returns <code>0</code> for it, permanently. Read that as &ldquo;not settled&rdquo; and your coordinator will refuse to act on real, finished trade &mdash; silently, and more often the more the network scales.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    This is not hypothetical: it is why the protocol&apos;s own usage counter needed a bridge. <code>UsageCounter.recordClauseUsage</code> requires <code>orderStatus == 2</code>, so it could never see batched trade; the batch proof now carries the usage accrual across the seam as proved numbers. Both contracts were individually correct &mdash; no test could find it. If your composition reads order state, read <strong>both</strong>: the kernel&apos;s <code>orderStatus</code> / <code>OrderResolved</code> for the direct path, and the verifier&apos;s <code>BatchSettled</code>, <code>stateRoot()</code>, and re-emitted <code>Attestation</code> logs (filtered by contract <em>address</em> &mdash; the topic hash is shared with the coordinator&apos;s) for the batched one. The read-path recipe, runnable, is on <Link href="/integrate" className="underline">Integrate</Link>; the per-function table is on <Link href="/spec" className="underline">/spec</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>Getting trade onto that second path is itself a composition, and a permissionless one.</strong> <code>FigaroBatchVerifier.settleBatch</code> has no caller gate, no owner and no fee, so a <em>sequencer</em> &mdash; the off-chain relay that pools signed operations, proves the batch, and settles it &mdash; is a relay, never an authority: it holds no keys, its admission checks call the same kernel functions the proof runs (so it can reject earlier, never accept more), and its honest powers are censor and delay. Anyone may run one, and a composition that needs batched throughput either submits to one or becomes one. That is why the coordinator conditions still bind here and are not weakened by it: a relay writes no kernel state, reverses no resolution, and controls no bond &mdash; it only carries signed artifacts to a contract that would have accepted them from anyone.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>One kind of composition does not cross the seam with you: the pre-commit kind.</strong> <code>WitnessSwapAndCommitCoordinator.swapAndCommit</code> lets a party bond in a token the process is not denominated in &mdash; it pulls their input token through a Permit2 witness signature, swaps it at an immutable venue, forwards the proceeds to the party&apos;s own address, then calls <code>FigaroCore.commit</code>, all in one transaction. That is a <strong>direct-path</strong> contract, and the batch path has no equivalent and can have none in-batch: a sequencer accepts a <code>Commit</code> operation that is the commitment plus both signatures and nothing else &mdash; there is no funding leg in the wire format or in the proof &mdash; and <code>settleBatch</code> pulls each party&apos;s <em>net</em> deposit by <code>transferFrom</code> when the batch lands. So on the batch path, swap in your own wallet <em>first</em>, then sign the commitment in the process currency and keep the balance approved to <code>FigaroBatchVerifier</code> (not to the kernel) until the batch settles. <strong>Post-settlement composition is identical on both paths</strong> &mdash; both deliver ERC-20 to the party&apos;s own address, so wallet-side routing of what you received (splitting a payout through the public multisender, say) is path-blind.
                </p>
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
                            <li>Presentation at the signing moment &mdash; settlement is UI-independent (the kernel binds the agreement by merkle root and verifies both signatures itself), but what your surface <em>displays</em> beside the wallet prompt is not. A composed surface owes its users an off-origin way to recompute the root before they sign; the recipe is on <Link href="/integrate" className="underline">Integrate</Link>.</li>
                            <li>Reading both settlement paths &mdash; nothing warns a composition that gates on <code>orderStatus</code> that batch-settled trade is invisible to it. Fold the verifier&apos;s events too.</li>
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

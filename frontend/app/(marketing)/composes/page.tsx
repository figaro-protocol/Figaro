import type { Metadata } from "next";
import Link from "next/link";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// AUDITED + MERGED 2026-08-05: this page absorbed /builders/composability (the
// split was an author's filing distinction — "catalogue" vs "doctrine" — that no
// reader could see; operator ruled ONE page). Every surviving claim traces to
// the reality audit's verified rows; the deleted-apparatus walkthrough, the
// vendor catalogue with no code behind it, and the page-minted "Tier 1/2/3"
// taxonomy were cut the same day. The coordinator conditions are FIVE
// (Prop 7.1, /papers/verified-settlement-kernel), never "three".
export const metadata: Metadata = {
    title: "Composes — Figaro Protocol",
    description:
        "What composes with Figaro and the conditions that keep composition safe: the wired surfaces (forum seam, IPFS, XMTP, the Uniswap swap on-ramp, the Disperse multisender), the coordinator pattern's five equilibrium-preserving conditions, and the kernel-vs-author boundary.",
};

export default function Composes() {
    return (
        <>
            <MarketingHero
                title="What composes with Figaro."
                lead={
                    <>
                        <code>FigaroCore</code> takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Every other question lives above it &mdash; permissionless to add, permissionless to fork, equally bound by the same Nash equilibrium. Composition happens two ways: <strong>internally</strong>, where clauses assemble into <Link href="/assemblies" className="underline">assemblies</Link> and mechanism contracts extend the protocol without touching the frozen kernel; and <strong>externally</strong>, through primitives the kernel deliberately does not include. This page covers what composes today and the conditions that keep any composition safe.
                    </>
                }
            />

            <MarketingSection title="The kernel is narrow. The ecosystem composes around it.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    Wired today: the dispute-forum seam, IPFS storage, XMTP messaging, emissions-disclosure attestations, the Uniswap swap on-ramp, and the Disperse multisender &mdash; each an on-network artifact this repo can point at.
                </p>
                <ul className="space-y-4">
                    <LabelledListRow label="Forums" uppercase>
                        The parties&apos; agreement designates the forum &mdash; a clause&apos;s <code>composes</code> block carries the forum&apos;s URL as configuration, never code, so any forum (an on-chain court, an arbitral institution, a national court) sits behind the same seam. Figaro exports its evidence bundle there; the kernel does not adjudicate &mdash; and a forum rules on the same evidence record whether or not it was composed in advance. See <Link href="/papers/on-chain-evidence" className="underline">On-Chain Evidence, Off-Chain Adjudication</Link>.
                    </LabelledListRow>
                    <LabelledListRow label="Storage" uppercase>
                        <strong>IPFS.</strong> Off-chain agreement documents and large evidence artifacts. <code>agreementHash</code> anchors them on chain.
                    </LabelledListRow>
                    <LabelledListRow label="Messaging" uppercase>
                        <strong>XMTP.</strong> Per-order encrypted handoff channels, wired via <code>lib/handoff/</code>.
                    </LabelledListRow>
                    <LabelledListRow label="Token swap" uppercase>
                        <strong>Uniswap.</strong> A process is denominated in one token, but a buyer may hold another: <code>WitnessSwapAndCommitCoordinator.swapAndCommit</code> swaps through Uniswap&apos;s canonical Permit2 + Universal Router and commits in the same transaction, so the kernel still sees a single-currency commitment. The deployment record wires the canonical contracts wherever they exist; a local devnet wires interface-matching mocks. Direct path only &mdash; the batch path has no funding leg (details under the conditions below).
                    </LabelledListRow>
                    <LabelledListRow label="Multisender" uppercase>
                        <strong>Disperse.</strong> Post-settlement payout routing through the composed public multisender: one payment, many recipients, one transaction. A wallet splits its own receipts to earmarked addresses (fiscal remittance, savings, obligations), and the self-sovereign fiscal trail falls out as a byproduct. The composed deployment is the canonical ownerless Disperse contract, same address across chains; a local devnet rehearses it with an interface-matching mock. Post-settlement composition is path-blind &mdash; both <code>FigaroCore</code> and <code>FigaroBatchVerifier</code> deliver by ERC-20 transfer to the party&apos;s own address, so routing what you received works the same regardless of which settlement path carried it.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

            <MarketingSection title="Anyone can express anything; the equilibrium does not care.">
                <p className="text-base text-ink-body leading-relaxed">
                    Because the kernel only enforces bonded-commitment settlement, the graph above it is unconstrained. A market-liberal graph where every role is priced at auction, a cooperative graph where surplus routes back to contributors via programmatic shares, a mutual-aid graph where bonds are reciprocal rather than monetary &mdash; all use the same kernel. The ideological commitments live in the assembly, not in <code>FigaroCore</code>.
                </p>
            </MarketingSection>

            <MarketingSection title="Five conditions preserve the equilibrium.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Any internal exit path weakens the Nash equilibrium &mdash; the <Link href="/papers/asymmetric-bonding" className="underline">escape-hatch-weakness theorem</Link>. So compositions live <em>outside</em> the kernel and attach via the coordinator pattern. Proposition 7.1 of the <Link href="/papers/verified-settlement-kernel" className="underline">verified-settlement-kernel paper</Link> gives five sufficient conditions under which a composed mechanism preserves the bonding equilibrium (the condition-by-condition proof sketch is Proposition 5.2 of <Link href="/papers/protocol-extension" className="underline">Protocol Composition</Link>):
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-6 mb-4">
                    <li><strong>No unauthorized kernel-state mutation.</strong> The mechanism reads kernel state freely and writes none of it on its own account. Commitment admits a relay &mdash; the call carries both parties&apos; signatures, which the kernel recovers itself before pulling each bond from the named party. Resolution admits none: it takes no signature and authorizes on the caller&apos;s own address, so no composer can resolve on a buyer&apos;s behalf.</li>
                    <li><strong>No alternative settlement path.</strong> The mechanism provides no operation that produces value flows equivalent to the kernel&apos;s atomic resolution while bypassing it, and holds no discretion over a live process&apos;s settlement.</li>
                    <li><strong>No discretionary lock-bypass.</strong> The mechanism custodies no kernel bonds and cannot release bonded funds under conditions different from those resolution enforces.</li>
                    <li><strong>Agreement-bound content.</strong> Content typed by a registered clause is admitted only against an order whose signed agreement included that clause, verified by merkle inclusion against the <code>agreementHash</code>.</li>
                    <li><strong>No off-kernel side-payment.</strong> The mechanism commits to no award, on-chain or off, contingent on the kernel&apos;s resolved bond outcome &mdash; a side-payment custodian would re-enter the parties&apos; decision calculus unbonded.</li>
                </ol>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Those five govern what a composition <em>writes</em> and <em>promises</em>; one more governs what it <strong>reads</strong> &mdash; settlement runs on two disjoint state universes (the direct kernel and the batched, proof-based path), so a composition that gates only on <code>orderStatus</code> is blind to whichever one it isn&apos;t reading. The full read-both recipe, runnable, is on <Link href="/integrate" className="underline">Integrate</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>Getting trade onto that batched path is itself a permissionless composition.</strong> <code>FigaroBatchVerifier.settleBatch</code> has no caller gate, no owner, and no fee, so a sequencer relaying signed operations to it is a relay, never an authority &mdash; the coordinator conditions bind it exactly as they bind any other composition. The relay mechanics, and how to run or submit to one, are on Integrate.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong>One kind of composition does not cross that seam with you: the pre-commit kind.</strong> <code>WitnessSwapAndCommitCoordinator.swapAndCommit</code> lets a party bond in a token the process isn&apos;t denominated in, but only on the direct path &mdash; the batch path has no funding leg, so a party swaps in their own wallet first, then signs the commitment in the process currency.
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
                            <li>Proof-gated clause-content validation on the batched settlement path (<code>FigaroBatchVerifier</code> &mdash; itself a composition above the frozen kernel)</li>
                            <li>Token conservation (Foundry + Echidna + Certora + Halmos + TLA&#8314; verified)</li>
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
                            <li>Presentation at the signing moment &mdash; settlement is UI-independent (the kernel binds the agreement by merkle root and verifies both signatures itself), but what your surface <em>displays</em> beside the wallet prompt is not. A composed surface owes its users an off-origin way to recompute the root before they sign; the recipe is on Integrate.</li>
                            <li>Reading both settlement paths &mdash; nothing warns a composition that gates on <code>orderStatus</code> that batch-settled trade is invisible to it. Fold the verifier&apos;s events too.</li>
                        </ul>
                    </div>
                </div>
            </MarketingSection>

            <MarketingSection title="More on composition" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; what a clause is, the live registry inventory, and the public-vs-private data seam; a clause is data, not code &mdash; the generic proof engine validates any registered clause with zero per-clause contracts.</span>
                    </li>
                    <li>
                        <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>
                        <span className="text-ink-body"> &mdash; composition templates; an assembly names which of the surfaces above it composes with.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; the operational tools for composing: Designer, clause registration, contracts, SDK.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>
                        <span className="text-ink-body"> &mdash; the contract-by-contract catalogue, including the payout and coordinator contracts named above.</span>
                    </li>
                    <li>
                        <Link href="/integrate" className="text-ink-heading font-medium hover:underline">Integrate</Link>
                        <span className="text-ink-body"> &mdash; <code>@figaro/sdk</code> read-path guidance, the read-both-universes recipe, and the relay mechanics.</span>
                    </li>
                    <li>
                        <Link href="/security#disputes" className="text-ink-heading font-medium hover:underline">Security</Link>
                        <span className="text-ink-body"> &mdash; what a forum can and cannot do with the on-chain record.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

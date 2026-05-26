import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Security — Figaro Protocol",
    description:
        "Plain-language answers to the security questions you should ask before sending tokens through Figaro. What the protocol guarantees, what it does not, and how the guarantees are verified.",
};

export default function Security() {
    return (
        <>
            <MarketingHero
                title="Security."
                lead={
                    <>
                        Plain-language answers to the security questions you should ask before sending tokens through a protocol you didn&apos;t write. Each section names a concern, states what the protocol guarantees, and names the residual risk honestly &mdash; if the answer has a caveat, the caveat is in the same paragraph as the guarantee.
                    </>
                }
            />

            <MarketingSection title="Who holds the tokens?" sectionId="custody">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. When a buyer and seller commit to a process, the payment and both bonds move into <em>FigaroCore</em> &mdash; the kernel contract &mdash; and stay there until the buyer signs the atomic resolution that releases them. There is no custodian, no escrow account, no platform balance sheet, no off-chain ledger reconciling who is owed what.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    FigaroCore has no owner. No address can withdraw funds it does not have a signed commitment against. The only paths out are the resolution the buyer signs and the bond release the seller earns by performing &mdash; both encoded in the contract, both auditable on-chain. The caveat is that contracts are code, and code can have bugs. What has been done about that is in <Link href="#verification" className="text-ink-heading font-medium hover:underline">§5</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if the counterparty doesn't deliver?" sectionId="counterparty">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The bond architecture answers this before it becomes a recourse problem. Each party posts more than they could gain by defecting. The buyer locks twice the payment; the seller locks twice the cumulative value flowing through them. The arithmetic makes cooperation the strategy that weakly dominates defection for both parties &mdash; a result called the bonding equilibrium. Cooperation is the unique strategy profile surviving iterated elimination of weakly dominated strategies, derivable from the 2:1 ratio alone, with no reliance on reputation, repeated interaction, or external enforcement.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The equilibrium is about losses, not zero-loss. A counterparty willing to burn their bond can still grief you. The defense is the magnitude: they will lose twice what you lose, every time. For the formal derivation see <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">cryptoeconomics</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you genuinely disagree?" sectionId="disputes">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Three layers, in order. First, the bond architecture &mdash; the 2:1 ratio pushes most disagreements toward cooperative resolution before they become disputes, because the cost of defection is visible to both sides. Second, in multi-party processes, atomic resolution means the buyer holds a single resolution key for the entire process; co-sellers have material reason to coordinate rather than let the resolution fail. Third, every commitment, attestation, and resolution event is timestamped on-chain. The on-chain record is tamper-proof evidence, available for courts, arbitration providers, or any institution the parties had agreed to default to.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is honest: there is no on-chain verdict. The protocol does not adjudicate. Disagreements that exhaust the first two layers go to whatever off-chain forum the parties chose &mdash; Figaro contributes evidence, not a ruling. The dispute layer is provider-agnostic by design; the kernel takes no position on which forum a community uses.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you lose your keys?" sectionId="keys">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Key loss is a wallet concern, not a protocol concern. The defense is the same posture as for ETH or USDC: hardware wallet, multisig, or social recovery configured at the wallet layer. Figaro inherits whatever your wallet provides; it adds no recovery surface and removes none.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is sharp. The kernel has no recovery path of any kind. If a buyer with an active process loses access to their keys, no one can sign the resolution that releases the funds &mdash; not Figaro, not a court order, not a software update. The bonds stay locked. This is an explicit accepted risk of the protocol&apos;s no-escape-hatch posture: the same property that prevents anyone from stealing funds also prevents anyone from recovering them. Plan key custody before you commit tokens to an active process.
                </p>
            </MarketingSection>

            <MarketingSection title="Has the code been audited?" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not yet by an external auditor. That is the honest answer, and the protocol does not call itself release-ready until that audit lands. The Solidity surface was frozen for external audit on 20 April 2026 (with subsequent amendments scoped to the freeze); external audit decision and scheduling is one of two named release blockers.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What is in place is a verification stack &mdash; six independent tools targeting the same kernel from different angles:
                </p>
                <ul className="space-y-2 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Foundry</strong>: unit + integration suite, 0 failed / 0 skipped.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Halmos</strong>: symbolic execution proves 7 properties of the kernel exhaustively.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Certora</strong>: formal verification of CVL specs covering bond conservation, atomic resolution, and authorization.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">TLA+</strong>: model-checking of 24 invariants across 3 models of the kernel state machine.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Echidna</strong>: property-based fuzzing of the kernel and the FIG token.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Mythril</strong>: symbolic execution for common vulnerability classes.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    Verification is not a substitute for external audit. It is a precondition. The protocol&apos;s position is that an audit should examine a surface that has already been pushed against from this many directions &mdash; not a surface arriving to it raw. The current contract inventory and verification map are at <Link href="/spec" className="text-ink-heading font-medium hover:underline">spec</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Who can shut this down or freeze your funds?" sectionId="shutdown">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. FigaroCore has no admin, no owner, no pause function, no upgrade key, no governance with discretionary power over funds. The kernel does not contain code that any address can call to halt settlement, blacklist a participant, or move tokens it does not have a signed commitment against. There is nothing to capture because there is no privileged role to hold.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is the underlying chain. If Ethereum itself halts, settlement halts &mdash; that risk is external to Figaro and shared with every other Ethereum protocol. Inside Figaro, no party can halt the kernel; the property is called <em>no escape hatches</em>, and the protocol&apos;s security argument depends on it. Removing it would mean a different protocol with different guarantees.
                </p>
            </MarketingSection>

            <MarketingSection title="What if one participant in a multi-party process fails?" sectionId="multi-party">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Multi-party processes resolve atomically &mdash; either every commitment in the process settles together or none of them does. Each seller is bonded against the cumulative value flowing through them, so a participant who fails to perform has their own bond at risk, and the participants downstream have material reason to coordinate before resolution. The phenomenon &mdash; peer pressure across co-sellers, emerging from bond architecture rather than from any platform&apos;s enforcement &mdash; is described as the protocol&apos;s social mechanism. It reproduces the joint-liability behavior of community-bound lending circles without requiring a shared community, repeated interaction, or exogenous punishment.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat: if the process genuinely cannot complete &mdash; an upstream contributor disappears, no co-seller can take their place, the work is impossible &mdash; the buyer still holds the resolution key. Bonds stay locked until the buyer signs. The asymmetry is intentional: the party who initiated the process and is paying for it is the party who decides when it is finished.
                </p>
            </MarketingSection>

            <MarketingSection title="Can someone hijack a schema or operator slot?" sectionId="builders-registries">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Schema, operator, and assembly anchoring is permissionless and first-write-wins. Once an identifier is bound to a contract or a profile, the binding is immutable &mdash; no admin can rebind it, no later registrant can displace it. The validator contract bound to a schema is required to be pure: no external state reads, no block- or time-dependence, no external calls. Once it is deployed and bound, its behavior is fixed for as long as the chain exists.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The three artifact families have different anti-spam postures, calibrated to the asymmetry of their attack surfaces: schemas register with no deposit (the schema-author RPGF anchors trust over time); operators register with a medium deposit and a lock period; assemblies register with a heavier deposit and a permanent slug burn. Harmonization across the three would weaken the design &mdash; the asymmetry is the point.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat for authors: a buggy validator you deploy is permanent. The remediation path is to deploy v2 under a new schemaId; the v1 keeps doing whatever it does, and anyone already using it stays on it until they migrate. The discipline this asks of authors is the same as the discipline of publishing a kernel: ship the result you can defend, not the result you can patch.
                </p>
            </MarketingSection>

            <MarketingSection title="Is the proof system trusted?" sectionId="builders-prover">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The batch sequencer is a coordination convenience, not a trust assumption. Every operation in a batch carries an EIP-712 signature from the relevant parties; the proof verifies those signatures inside the zkVM; the on-chain verifier checks the proof. The sequencer cannot fabricate an operation, cannot steal funds, cannot violate a kernel invariant, cannot forge a state transition. The validity proof enforces the same nine invariants the direct kernel enforces &mdash; the difference is throughput, not security.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What the sequencer can do is delay or refuse to include your operation in a batch. The protocol-level answer is structural: the direct FigaroCore on-chain path stays deployed and functional alongside the batched path. A participant who distrusts the sequencer can always submit a transaction directly to the kernel. The sequencer is throughput, not gatekeeping.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    One honest caveat. An attacker with a small position in a batch can revoke their ERC-20 approval immediately before the batch lands, causing the entire batch transaction to revert and delaying settlement for everyone else in it. The attacker&apos;s cost is roughly the gas for a revocation transaction; no funds are lost by any participant, but settlement is delayed. The mitigation lives at the sequencer (same-block approval re-verification, exclusion of repeat revokers); it cannot be fixed at the protocol layer without breaking the kernel&apos;s stateless design.
                </p>
            </MarketingSection>

            <MarketingSection title="What else you should know." sectionId="compatibility">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Three operational facts that aren&apos;t vulnerabilities but are worth knowing before you commit to the protocol.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Gas ceilings per process.</strong> Two separate gas constraints govern a process. <em>Resolution</em> settles every order in a single transaction, so its per-call gas cost gates the per-process size: at Ethereum mainnet&apos;s 30M block gas limit, roughly 2,145 orders. <em>Commit</em> is the other constraint &mdash; each commit is its own ~224k-gas transaction, so a single block can land about 134 commits and a 2,000-order process needs roughly 15 blocks to assemble before it can resolve. Both numbers are chain-specific; a chain with a higher block gas limit raises both proportionally. Large coordinations should compose across processes &mdash; the kernel supports this structurally &mdash; rather than push a single process toward either ceiling. The batched path&apos;s ceiling is different and is dominated by net-position count, not raw order count.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Fee-on-transfer tokens are rejected.</strong> If the ERC-20 you intend to pay with takes a percentage on transfer, FigaroCore refuses the commit. This is intentional: the bond arithmetic depends on the kernel receiving exactly what was committed. Pay in a non-rebasing, non-fee-on-transfer token.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong className="text-ink-heading font-medium">Single settlement currency per process.</strong> A process cannot mix ERC-20s &mdash; the 2:1 bond ratio is a same-unit comparison, and an oracle or DEX dependency would reintroduce a trusted actor. Multi-token behavior is achievable through composition (parallel processes in different currencies), not within one process.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            Cryptoeconomics
                        </Link>
                        <span className="text-ink-body"> &mdash; the bonding equilibrium, the weakest-link subgame, the social mechanism &mdash; with the formal derivations and the eight-discipline reading.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                            Specifications
                        </Link>
                        <span className="text-ink-body"> &mdash; the on-chain contract surface, with source links and verification status.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage Figaro sits in: coercion, cognition, crypto.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}

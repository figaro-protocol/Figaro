import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Asymmetric Bonding and Buyer Dominance — Figaro Protocol",
    description:
        "Two composing mechanisms for self-enforcing N-party coordination: asymmetric bonding (each party locks 2x value, the seller against cumulative upstream value) makes cooperation weakly dominant and scales the Nash equilibrium along a process chain; buyer dominance with atomic resolution induces a weakest-link subgame. A formal mechanism-design treatment.",
};

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

function Proof({ children }: { children: React.ReactNode }) {
    return (
        <div className="my-3 space-y-3 text-ink-body">
            <p>
                <span className="italic text-ink-muted">Proof. </span>
                {children}
            </p>
        </div>
    );
}

export default function AsymmetricBondingPaper() {
    return (
        <PaperLayout slug="asymmetric-bonding"
            title="Asymmetric Bonding and Buyer Dominance"
            subtitle="Two Composing Mechanisms for Self-Enforcing N-Party Coordination"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="mechanism design, Nash equilibrium, collateral bonding, multi-party coordination, process chains, peer enforcement"
            abstract={
                <>
                    <p>
                        We present Figaro, a settlement mechanism that enables self-enforcing agreements between mutually distrusting parties without arbitrators, timeouts, or governance. The mechanism composes two distinct primitives. <em>Asymmetric bonding</em>: each party locks collateral equal to twice the transaction value, making cooperation the weakly dominant strategy in a one-shot game and the unique profile surviving iterated elimination of weakly dominated strategies. <em>Buyer dominance with atomic resolution</em>: only the buyer can trigger resolution, and resolution settles all orders in a process simultaneously or not at all. The two mechanisms are inseparable: bonding alone gives independently secured bilateral edges that cannot coordinate at the multi-party level; buyer dominance alone is without force absent the bonding equilibrium.
                    </p>
                    <p>
                        Asymmetric bonding scales naturally from two-party exchange to <Math>{"N"}</Math>-party process chains: because each seller&rsquo;s bond is tied to the cumulative value of all upstream work rather than to the local payment, the Nash equilibrium is preserved at every chain position and the seller&rsquo;s risk-to-reward ratio grows with chain depth. Buyer dominance with atomic resolution then operates on the already-scaled mesh: the all-or-nothing resolution rule induces a weakest-link subgame among sellers. We show that the resulting peer-enforcement properties obtain under strictly weaker assumptions than the joint-liability mechanisms classically analyzed in the microfinance literature.
                    </p>
                </>
            }
            references={
                <>
                    <li>Asgaonkar, A. &amp; Krishnamachari, B. Solving the Buyer and Seller&rsquo;s Dilemma: A Dual-Deposit Escrow Smart Contract for Provably Cheat-Proof Delivery and Payment for a Digital Good without a Trusted Mediator. In <em>Proc. IEEE International Conference on Blockchain and Cryptocurrency (ICBC)</em>, 2019.</li>
                    <li>Cuende, L. &amp; Izquierdo, J. <em>Aragon Network: A Decentralized Infrastructure for Value Exchange</em>. Aragon White Paper, 2017.</li>
                    <li>Ghatak, M. Group Lending, Local Information and Peer Selection. <em>Journal of Development Economics</em>, 60(1):27&ndash;50, 1999.</li>
                    <li>Hirshleifer, J. From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods. <em>Public Choice</em>, 41(3):371&ndash;386, 1983.</li>
                    <li>Lesaege, C., George, W., &amp; Ast, F. <em>Kleros: Long Paper v1.0.0</em>. Kleros, 2019.</li>
                    <li>Myerson, R. B. Incentive Compatibility and the Bargaining Problem. <em>Econometrica</em>, 47(1):61&ndash;73, 1979.</li>
                    <li>Nakamoto, S., aceat64, &amp; ribuck. Escrow. <em>Bitcointalk</em> forum topic 750, August 7, 2010.</li>
                    <li>NashX. <em>Mutual-Assured-Destruction Trading Platform</em>. nashx.com, 2013.</li>
                    <li>Optimism Foundation. <em>Optimistic Rollups</em>. Optimism Technical Documentation, 2021.</li>
                    <li>Poon, J. &amp; Dryja, T. <em>The Bitcoin Lightning Network: Scalable Off-Chain Instant Payments</em>. Technical report, 2016.</li>
                    <li>Raiden Network. <em>Raiden Network: Fast, Cheap, Scalable Token Transfers for Ethereum</em>. Raiden Network Token Whitepaper, 2017.</li>
                    <li>Solidity Team. Safe Remote Purchase. In <em>Solidity Documentation &mdash; Solidity by Example</em>, 2015.</li>
                    <li>Stiglitz, J. E. Peer Monitoring and Credit Markets. <em>World Bank Economic Review</em>, 4(3):351&ndash;366, 1990.</li>
                    <li>UMA Project. <em>The Optimistic Oracle</em>. UMA Technical Documentation, 2020.</li>
                    <li>Van Huyck, J. B., Battalio, R. C., &amp; Beil, R. O. Tacit Coordination Games, Strategic Uncertainty, and Coordination Failure. <em>American Economic Review</em>, 80(1):234&ndash;248, 1990.</li>
                    <li>Williamson, O. E. Credible Commitments: Using Hostages to Support Exchange. <em>American Economic Review</em>, 73(4):519&ndash;540, 1983.</li>
                    <li>Yunus, M. <em>Banker to the Poor: Micro-Lending and the Battle Against World Poverty</em>. PublicAffairs, New York, 1999.</li>
                    <li>Zimbeck, D. <em>Two-Party Double-Deposit Trustless Escrow in Cryptographic Networks and Bitcoin</em>. BitHalo White Paper, 2014.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <PaperSubsection title="1.1 The Problem">
                    <p>
                        Economic coordination between strangers requires trust infrastructure. When two parties who have never met wish to exchange value, they face the classic commitment problem: either party may defect after the other has performed. The historical solution is <em>institutional intermediation</em> &mdash; firms, courts, escrow services, platform sellers &mdash; each of which introduces costs, delays, jurisdictional dependencies, and power asymmetries.
                    </p>
                    <p>
                        The problem intensifies in multi-party settings. A food delivery involves a cook, a kitchen seller, an ingredient sourcer, and a courier; a procurement process involves engineers, manufacturers, inspectors, and logistics providers. The standard architectural response is to aggregate participants into a single legal entity that internalizes the coordination problem and resolves it through hierarchical management. Blockchain-based smart contracts have produced a rich literature on trustless exchange, but most protocols address financial operations &mdash; swaps, lending, derivatives &mdash; rather than general coordination. Those that target coordination (e.g., Kleros, Aragon) typically reintroduce the intermediary as an on-chain dispute resolution mechanism: a jury, a governance body, or a timeout that unilaterally releases funds.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 Our Contribution">
                    <p>
                        We present Figaro, which achieves self-enforcing coordination through two composing mechanisms: <em>asymmetric bonding</em>, which produces the bilateral Nash equilibrium and scales it naturally to <Math>{"N"}</Math>-party process chains by tying each seller&rsquo;s bond to cumulative upstream value; and <em>buyer dominance with atomic resolution</em>, which enforces inter-seller coordination on the already-scaled mesh. The two are inseparable: bonding alone yields independently secured edges that cannot coordinate at the multi-party level; buyer dominance alone is worthless without the bonding equilibrium. Together they make the mesh resolvable from a single signature with cooperation pressure propagating through it, and they create the conditions for participants to resolve performance among themselves as social agents. The contributions are:
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>A minimal settlement primitive</strong> with no timeout, no governance, and no escape hatches from the bonded state. We show this minimality is not a simplification but a <em>security requirement</em>: every additional exit path weakens the Nash equilibrium.</li>
                        <li><strong>Asymmetric bonding scales to <Math>{"N"}</Math>-party chains.</strong> We prove cooperation remains weakly dominant at every position in an arbitrary-length process chain (strict whenever at least one other player&rsquo;s cooperation is not already foreclosed), and is the unique profile surviving iterated elimination of weakly dominated strategies; the seller&rsquo;s risk-to-reward ratio increases with chain depth.</li>
                        <li><strong>Atomic resolution</strong> as a coordination forcing function. All-or-nothing process settlement induces a weakest-link subgame among sellers, creating endogenous peer pressure without explicit communication or governance.</li>
                        <li><strong>A reduction over joint-liability microfinance.</strong> We prove the peer-enforcement outcome common to Ghatak (1999) and Stiglitz (1990) is obtained by the bonded commitment mechanism under strictly weaker assumptions: no repeated interaction, no local information, no exogenous punishment technology, and no joint-liability contracting.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="1.3 Architectural Posture">
                    <PaperRun title="The mechanism is neutral about what it coordinates.">
                        A consequence of locating the whole of the present argument at the mechanism level is that the mechanism admits no commitments about <em>what</em> is being coordinated or <em>under what normative regime</em>. Currency, jurisdiction, identity type, arbitration forum, role structure, price-discovery mechanism, contribution metric &mdash; none of these are in the mechanism; all are expressed in the <em>graph</em> that parties compose on top of it. The mechanism enables each and prefers none.
                    </PaperRun>
                    <PaperRun title="Composability is external-first.">
                        A second consequence of the mechanism&rsquo;s narrow construction is that its useful compositions are predominantly <em>external</em> rather than internal. The mechanism does not include a dispute forum, a carbon-offset market, a prediction market, an insurance pool, a lending facility, a tax-reporting service, an identity provider, a storage layer, or a messaging fabric. Each exists as a working external protocol or institution, and a graph composed on top can name any of them. The mechanism itself need not &mdash; and, by the escape-hatch-weakness theorem, must not &mdash; absorb the bookkeeping that such composition implies. The mechanism makes external surfaces composable; the graph names which externals it composes with.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. Related Work">
                <PaperRun title="Mutual-destruction escrows.">
                    The double-deposit mechanism predates Ethereum entirely. In an August 2010 Bitcointalk thread on escrow (Nakamoto, aceat64, &amp; ribuck, 2010), Nakamoto proposed a one-sided hostage escrow &mdash; the buyer can burn the funds but never reclaim them, which &ldquo;takes the profit out of cheating&rdquo; &mdash; and, in the same thread, aceat64 and ribuck stated the two-sided form: both parties over-collateralize so that defection costs each more than cooperation. NashX (2013) ran a live trading platform on exactly this mutual-assured-destruction posture, and BitHalo (Zimbeck, 2014) gave the double-deposit escrow a whitepaper and an implementation for peer-to-peer Bitcoin trade. The smart-contract pattern asymmetric bonding generalizes is the Safe Remote Purchase contract (Solidity Team, 2015), included in the Solidity documentation as a reference pattern and the canonical <Math>{"2\\times"}</Math> Ethereum form: buyer and seller each lock <Math>{"2\\times"}</Math> the item value, and only mutual agreement releases the funds. The central problem was generalizing it beyond two parties: symmetric <Math>{"2\\times"}</Math> deposits with mutual agreement cannot compose &mdash; in a twelve-seller workflow there is no natural &ldquo;mutual agreement&rdquo; among all participants. Asymmetric bonding solves this by scaling each seller&rsquo;s bond with cumulative upstream value rather than fixing it per trade, creating a mesh of independently secured edges, each carrying its own Nash equilibrium.
                </PaperRun>
                <PaperRun title="State channels and payment networks.">
                    The Lightning Network (Poon &amp; Dryja, 2016) and Raiden (Raiden Network, 2017) use time-locked deposits for off-chain payment and rely on timeouts for dispute resolution &mdash; precisely the escape hatch Figaro eliminates. More critically, state channels address multi-hop <em>payment routing</em>, not multi-party <em>coordination</em> (delivery, fulfillment, service composition).
                </PaperRun>
                <PaperRun title="On-chain dispute resolution.">
                    Kleros (Lesaege, George, &amp; Ast, 2019) provides decentralized arbitration via Schelling-point juror selection; Aragon Court (Cuende &amp; Izquierdo, 2017) offers similar functionality within DAO governance. Both reintroduce a <em>discretionary human decision</em> into the resolution path, which breaks the self-enforcing property (escape-hatch weakness, Case 2).
                </PaperRun>
                <PaperRun title="Optimistic mechanisms.">
                    Optimistic rollups (Optimism Foundation, 2021) and optimistic oracles (UMA Project, 2020) use a challenge-response pattern: an assertion stands unless challenged within a timeout window. This requires liveness assumptions and timeout calibration. Figaro has no timeout from the bonded state &mdash; capital remains locked indefinitely until the buyer resolves, making liveness irrelevant to security.
                </PaperRun>
                <PaperRun title="Mechanism design.">
                    The revelation principle (Myerson, 1979) guarantees that any achievable outcome can be implemented via a direct mechanism. Figaro&rsquo;s insight is that the &ldquo;direct mechanism&rdquo; for multi-party coordination need not involve message passing, reporting, or arbitration at all: locked capital <em>is</em> the mechanism. The closest theoretical antecedent is the concept of <em>deposit games</em> (Asgaonkar &amp; Krishnamachari, 2019), which analyze two-party security deposits; we extend deposit-game analysis to <Math>{"N"}</Math>-party process chains under asymmetric bonding.
                </PaperRun>
                <PaperRun title="Joint-liability microfinance.">
                    Group lending models &mdash; most prominently the Grameen Bank (Yunus, 1999) and its formalizations by Ghatak (1999) and Stiglitz (1990) &mdash; show that joint liability combined with a social substrate can produce peer selection and peer monitoring. Figaro reproduces the same peer-enforcement outcome under strictly weaker assumptions, with no appeal to repeated interaction or local information.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Two Mechanisms: Formal Definition">
                <PaperSubsection title="3.1 Notation and Setup">
                    <p>Consider a <em>buyer</em> <Math>{"B"}</Math> and a <em>seller</em> <Math>{"S"}</Math> who wish to exchange a payment <Math>{"P > 0"}</Math> for goods or services. Both hold sufficient balances.</p>
                    <FormalBlock label="Standing Assumptions.">
                        <p>Two assumptions are maintained throughout and enter every payoff below. First, <em>costless performance</em>: a seller who cooperates incurs no production or delivery cost, so the payoff structure records only the bonded transfers and the payment &mdash; there is no cost term <Math>{"c"}</Math> on either side of the seller&rsquo;s <Math>{"+P"}</Math>-versus-<Math>{"-2G"}</Math> comparison. This is what makes cooperation weakly dominant rather than belief-dependent: with a positive performance cost the seller&rsquo;s choice would turn on beliefs about the buyer&rsquo;s resolve decision, and the one-comparison dominance argument of &sect;4.1 would not go through unchanged. Second, <em>value covers price</em>: the buyer&rsquo;s valuation <Math>{"V"}</Math> of the seller&rsquo;s performance satisfies <Math>{"V \\geq P"}</Math>, since a buyer who valued the good below its price would not have committed. This inequality is the premise of the non-resolution credibility argument in &sect;4.1, where it is used to show that &ldquo;resolve iff delivered&rdquo; is the buyer&rsquo;s best response.</p>
                    </FormalBlock>
                    <FormalBlock label="Definition (Asymmetric Bonding).">
                        <p>An <em>asymmetric bond</em> for a transaction with payment <Math>{"P"}</Math> and cumulative value <Math>{"G \\geq P"}</Math> is a pair of deposits: <Math>{"C_b = 2P"}</Math> (buyer bond) and <Math>{"C_s = 2G"}</Math> (seller bond). For a root transaction (no upstream value), <Math>{"G = P"}</Math>, so both bonds equal <Math>{"2P"}</Math>. For sub-orders in a process chain, <Math>{"G > P"}</Math>, creating an asymmetry where the seller&rsquo;s bond exceeds the buyer&rsquo;s.</p>
                    </FormalBlock>
                    <FormalBlock label="Definition (Commitment).">
                        <p>A <em>commitment</em> is a tuple <Math>{"\\langle B, S, \\tau, P, h, \\sigma, \\delta \\rangle"}</Math> where <Math>{"B"}</Math> is the buyer identity, <Math>{"S"}</Math> the seller identity, <Math>{"\\tau"}</Math> the unit of account, <Math>{"P"}</Math> the payment, <Math>{"h"}</Math> a content hash of the underlying agreement, <Math>{"\\sigma"}</Math> a cryptographic salt, and <Math>{"\\delta"}</Math> a signature expiry deadline. Both parties sign the commitment.</p>
                    </FormalBlock>
                    <FormalBlock label="Definition (Process).">
                        <p>A <em>process</em> <Math>{"\\Pi"}</Math> is a tuple <Math>{"\\langle \\text{id}, B, \\tau, G, n, \\mathcal{O} \\rangle"}</Math> where id is a deterministic identifier derived from the root commitment, <Math>{"B"}</Math> is the root buyer (constant across all orders), <Math>{"\\tau"}</Math> is the denomination (constant), <Math>{"G"}</Math> is a <em>monotonic accumulator</em> tracking total committed value, <Math>{"n"}</Math> is the count of active orders, and <Math>{"\\mathcal{O}"}</Math> the set of active order identifiers.</p>
                    </FormalBlock>
                    <PaperRemark title="Monotonicity Assumption.">
                        We assume the underlying settlement layer maintains <Math>{"G"}</Math> as a monotonic accumulator: every successful commit on <Math>{"\\Pi"}</Math> increases <Math>{"G"}</Math> by exactly the new order&rsquo;s payment <Math>{"P"}</Math>, and no operation decreases <Math>{"G"}</Math>. This is an assumption about the settlement layer&rsquo;s bookkeeping discipline, not a property derived from the mechanism. The mechanism is substrate-independent: it can be realised on a cryptographically settled state machine, a clearing house, a trusted ledger, or any other settlement layer that maintains the monotone-accumulator discipline.
                    </PaperRemark>
                    <FormalBlock label="Definition (Buyer Dominance).">
                        <p>A process <Math>{"\\Pi"}</Math> exhibits <em>buyer dominance</em> when (i) extension of <Math>{"\\Pi"}</Math> via commit requires a dual-signed commitment authenticated by <Math>{"B"}</Math>&rsquo;s signature, and (ii) only <Math>{"B"}</Math> may trigger resolution. No other identity &mdash; seller, third party, administrator, or governance body &mdash; has authority to extend or resolve <Math>{"\\Pi"}</Math>. Condition (i) gates on the identity of the <em>signer</em> (an authorized delegate carrying <Math>{"B"}</Math>&rsquo;s signature may convey a commit without breaking buyer dominance); condition (ii) gates on the identity of the <em>caller</em> that issues the resolve call directly.</p>
                    </FormalBlock>
                    <FormalBlock label="Definition (Atomic Resolution).">
                        <p>Resolution is <em>atomic</em>: when the buyer resolves, every active order in the process settles simultaneously, or none does. There is no partial resolution and no per-order resolution path. Combined with buyer dominance, atomic resolution is the second mechanism: it operates on the mesh of independently bonded edges induced by asymmetric bonding and makes multi-party coordination resolvable from a single signature, while inducing the inter-seller weakest-link subgame.</p>
                    </FormalBlock>
                    <PaperRemark title="Single-Currency Binding.">
                        Every order in a process shares a single denomination <Math>{"\\tau"}</Math>. This is not a notational convenience: the <Math>{"2\\times"}</Math> Nash-stability result relies on same-unit comparability between <Math>{"C_b = 2P"}</Math> and <Math>{"C_s = 2G"}</Math>. Mixing denominations within one process would require an external rate of substitution (an oracle, an exchange, or a pre-agreed conversion rate), each of which introduces a discretionary actor outside the bond structure and re-opens the escape-hatch problem. Multi-denomination workflows are handled outside the mechanism, by parties converting into the process denomination before issuing a commit.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="3.2 Protocol Operations">
                    <p>The mechanism exposes exactly two state-changing operations.</p>
                    <PaperRun title="Operation 1: commit.">
                        Given a commitment <Math>{"c"}</Math> signed by both <Math>{"B"}</Math> and <Math>{"S"}</Math>: (1) verify both signatures; (2) if <Math>{"c"}</Math> carries no process identifier, derive a new one from the commitment digest and initialize with <Math>{"G \\gets P"}</Math>, <Math>{"n \\gets 1"}</Math>; (3) otherwise verify the referenced process exists, that <Math>{"c.B = \\Pi.B"}</Math> and the buyer signature recovers to <Math>{"c.B"}</Math> (buyer dominance), that <Math>{"c.\\tau = \\Pi.\\tau"}</Math> (single-currency binding), and that the commitment&rsquo;s declared cumulative value equals <Math>{"\\Pi.G + P"}</Math> (monotonicity); (4) pull <Math>{"C_b = 2P"}</Math> from <Math>{"B"}</Math> and a seller bond equal to twice that declared cumulative value from <Math>{"S"}</Math>; (5) create or extend the process, update the accumulator, and emit an evidence event.
                    </PaperRun>
                    <PaperRun title="Operation 2: resolve.">
                        Given a process identifier and the complete list of active commitments: (1) verify the caller equals <Math>{"\\Pi.B"}</Math> (buyer dominance); (2) verify the list length equals <Math>{"\\Pi.n"}</Math> (atomic resolution: all orders must be included); (3) for each order <Math>{"o_i"}</Math> with payment <Math>{"P_i"}</Math> and cumulative snapshot <Math>{"G_i"}</Math>, compute <Math>{"\\pi_{s,i} = 2G_i + P_i"}</Math> and <Math>{"\\pi_{b,i} = P_i"}</Math>; (4) transfer <Math>{"\\pi_{s,i}"}</Math> to each seller, <Math>{"\\pi_{b,i}"}</Math> to the buyer; (5) mark all orders resolved.
                    </PaperRun>
                    <PaperRemark title="Conservation Law.">
                        For each order, the total distributed equals total locked: <Math>{"\\pi_{s,i} + \\pi_{b,i} = (2G_i + P_i) + P_i = 2G_i + 2P_i = C_{s,i} + C_{b,i}"}</Math>. The escrow holds zero balance after resolution.
                    </PaperRemark>
                    <PaperRemark title="No Escape Hatches.">
                        There is no timeout, no cancel-after-commitment, no admin override, no governance vote, and no unilateral exit from the bonded state. Once both parties have committed, the only path to fund recovery is buyer-initiated resolution. This is not a temporary simplification; it is a <em>security requirement</em> &mdash; the escape-hatch-weakness theorem proves that any additional exit path weakens the Nash equilibrium.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="3.3 Net Payoffs">
                    <FormalBlock label="Definition (Generalized Payout Functions).">
                        <p>For a bond multiplier <Math>{"k \\geq 1"}</Math>, an order with payment <Math>{"P > 0"}</Math> and cumulative value <Math>{"G \\geq P"}</Math>, define the settlement payout functions <Math>{"\\pi_s(k, G, P) = k \\cdot G + P"}</Math> and <Math>{"\\pi_b(k, P) = (k - 1) \\cdot P"}</Math>. These satisfy the conservation law <Math>{"\\pi_s + \\pi_b = kG + kP = C_s + C_b"}</Math> for <Math>{"C_s = kG"}</Math>, <Math>{"C_b = kP"}</Math>. The <em>net payoff</em> is the payout minus the deposited bond: <Math>{"u_s^{\\text{net}}(k) = \\pi_s - C_s = P"}</Math> and <Math>{"u_b^{\\text{net}}(k) = \\pi_b - C_b = -P"}</Math>.</p>
                    </FormalBlock>
                    <PaperRemark title="Net payoffs are independent of k.">
                        For the mechanism&rsquo;s <Math>{"k = 2"}</Math>: <Math>{"\\pi_s = 2G + P"}</Math>, <Math>{"\\pi_b = P"}</Math>, <Math>{"C_s = 2G"}</Math>, <Math>{"C_b = 2P"}</Math>. The net payoffs (<Math>{"+P"}</Math> for the seller, <Math>{"-P"}</Math> for the buyer) are independent of <Math>{"k"}</Math> &mdash; the multiplier affects only the capital at risk, not the final value transfer.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Game-Theoretic Analysis">
                <PaperSubsection title="4.1 Two-Party Nash Equilibrium">
                    <FormalBlock label="Definition (The Bonding Game).">
                        <p>The <em>bonding game</em> <Math>{"\\Gamma = (\\{B, S\\}, \\{A_B, A_S\\}, \\{u_b, u_s\\})"}</Math> is a one-shot, simultaneous-move, complete-information game. Players: buyer <Math>{"B"}</Math>, seller <Math>{"S"}</Math>. Action sets <Math>{"A_B = A_S = \\{\\mathrm{C}, \\mathrm{D}\\}"}</Math> (cooperate / defect): <Math>{"\\mathrm{C}"}</Math> for <Math>{"S"}</Math> means delivering the agreed goods; <Math>{"\\mathrm{C}"}</Math> for <Math>{"B"}</Math> means resolving the process &mdash; more precisely, the conditional strategy <em>resolve iff the seller delivered</em>, whose rationality is established in the credibility remark below. For a root order with <Math>{"P > 0"}</Math> and <Math>{"G = P"}</Math>, the net payoffs are <Math>{"u_b = -P"}</Math> if both cooperate and <Math>{"-2P"}</Math> otherwise; <Math>{"u_s = +P"}</Math> if both cooperate and <Math>{"-2G"}</Math> otherwise. The &ldquo;otherwise&rdquo; payoff is identical across all non-cooperative outcomes because any defection prevents resolution: the buyer&rsquo;s own defection withholds settlement directly, and against a seller&rsquo;s non-delivery the buyer&rsquo;s conditional strategy withholds it too; bonds remain locked indefinitely, yielding a net loss equal to the full deposit.</p>
                    </FormalBlock>
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="border border-default px-3 py-1.5 text-left text-ink-muted font-normal"><Math>{"(u_b, u_s)"}</Math></th>
                                    <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading"><Math>{"a_B = \\mathrm{C}"}</Math></th>
                                    <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading"><Math>{"a_B = \\mathrm{D}"}</Math></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading"><Math>{"a_S = \\mathrm{C}"}</Math></td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; +P)"}</Math></td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading"><Math>{"a_S = \\mathrm{D}"}</Math></td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-ink-muted mt-2">Payoff matrix for the bonding game <Math>{"\\Gamma"}</Math>. Parameters: <Math>{"P > 0"}</Math>, <Math>{"G \\geq P > 0"}</Math>.</p>
                    </div>
                    <p>
                        <em>Dominance.</em> Action <Math>{"a_i"}</Math> <em>weakly dominates</em> <Math>{"a_i'"}</Math> for player <Math>{"i"}</Math> if <Math>{"u_i(a_i, a_{-i}) \\geq u_i(a_i', a_{-i})"}</Math> for all <Math>{"a_{-i}"}</Math>, with strict inequality for at least one <Math>{"a_{-i}"}</Math>. If strict for <em>all</em> <Math>{"a_{-i}"}</Math>, the dominance is <em>strict</em>.
                    </p>
                    <FormalBlock label="Theorem (Two-Party Nash Equilibrium).">
                        <p>In the bonding game <Math>{"\\Gamma"}</Math>: (a) <Math>{"\\mathrm{C}"}</Math> weakly dominates <Math>{"\\mathrm{D}"}</Math> for both the buyer and the seller; (b) <Math>{"(\\mathrm{C}, \\mathrm{C})"}</Math> is the unique profile surviving iterated elimination of weakly dominated strategies (IEWDS); (c) <Math>{"(\\mathrm{C}, \\mathrm{C})"}</Math> is the unique Pareto-optimal outcome.</p>
                    </FormalBlock>
                    <Proof>
                        <em>Part (a), buyer:</em> when <Math>{"a_S = \\mathrm{C}"}</Math>, <Math>{"u_b(\\mathrm{C}, \\mathrm{C}) = -P > -2P = u_b(\\mathrm{D}, \\mathrm{C})"}</Math> (strict, since <Math>{"P > 0"}</Math>); when <Math>{"a_S = \\mathrm{D}"}</Math>, <Math>{"u_b(\\mathrm{C}, \\mathrm{D}) = -2P = u_b(\\mathrm{D}, \\mathrm{D})"}</Math>. So <Math>{"\\mathrm{C}"}</Math> weakly dominates <Math>{"\\mathrm{D}"}</Math> for <Math>{"B"}</Math>. <em>Seller:</em> when <Math>{"a_B = \\mathrm{C}"}</Math>, <Math>{"u_s(\\mathrm{C}, \\mathrm{C}) = +P > -2G = u_s(\\mathrm{C}, \\mathrm{D})"}</Math> (strict); when <Math>{"a_B = \\mathrm{D}"}</Math>, the payoffs are equal at <Math>{"-2G"}</Math>. <em>Part (b):</em> neither party can profitably deviate from <Math>{"(\\mathrm{C}, \\mathrm{C})"}</Math>. <Math>{"(\\mathrm{C}, \\mathrm{D})"}</Math> and <Math>{"(\\mathrm{D}, \\mathrm{C})"}</Math> admit a profitable deviation; <Math>{"(\\mathrm{D}, \\mathrm{D})"}</Math> satisfies the Nash condition (no <em>profitable</em> deviation from the locked-bond payoff) but <Math>{"\\mathrm{D}"}</Math> is weakly dominated for both players and removed in the first IEWDS round, leaving <Math>{"(\\mathrm{C}, \\mathrm{C})"}</Math> the unique survivor. <em>Part (c):</em> <Math>{"(-P, +P)"}</Math> Pareto-dominates <Math>{"(-2P, -2G)"}</Math> since <Math>{"-P > -2P"}</Math> and <Math>{"+P > -2G"}</Math>. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="On weak vs. strict dominance.">
                        The dominance is weak, not strict, because when the counterparty defects, both actions yield the same locked-capital payoff &mdash; once one party defects, the outcome is fully determined regardless of the other&rsquo;s choice. The critical property is that <Math>{"(\\mathrm{D}, \\mathrm{D})"}</Math> does not survive IEWDS, the standard refinement for mechanism design (Myerson, 1979).
                    </PaperRemark>
                    <PaperRemark title="On the credibility of non-resolution.">
                        The payoffs treat any seller defection as preventing resolution &mdash; the buyer withholds. This is a claim about the buyer&rsquo;s rationality, not a mechanism rule: nothing stops a buyer from resolving an undelivered order, which returns <Math>{"P"}</Math> and pays the non-performing seller <Math>{"+P"}</Math>. That the buyer does not is a best response once the value of delivery is admitted. Write <Math>{"V"}</Math> for the buyer&rsquo;s valuation of the seller&rsquo;s performance; participation requires <Math>{"V \\geq P"}</Math>, since a buyer who valued the good below its price would not have committed. Resolving an undelivered order is terminal: it finalizes the loss and extinguishes any claim to <Math>{"V"}</Math>. Withholding is not terminal: the seller&rsquo;s bond <Math>{"2G"}</Math> stays hostage and the seller retains a cheap unilateral exit &mdash; deliver, after which the buyer resolves and realizes <Math>{"V - P \\geq 0"}</Math>. The buyer thus chooses between a terminal <Math>{"-P"}</Math> with no good and a continuation holding a positive-probability path to <Math>{"V - P"}</Math>; for <Math>{"V \\geq P"}</Math> the continuation dominates, so &ldquo;resolve iff delivered&rdquo; is the buyer&rsquo;s best response and the <Math>{"-2P"}</Math> off-path payoff is what the buyer optimally realizes, not an assumed constant. The threat is credible on pecuniary grounds alone &mdash; an asymmetric war of attrition in which the seller bleeds <Math>{"2G \\geq 2P"}</Math> and can end it by performing &mdash; and needs no appeal to spite or fairness, consistent with the risk-preference robustness below.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.2 Sufficiency of the 2× Multiplier">
                    <p>We characterize the multiplier <Math>{"k"}</Math> in the generalized bonding game where <Math>{"C_s = kG"}</Math>, <Math>{"C_b = kP"}</Math>, and payouts are as defined above.</p>
                    <FormalBlock label="Lemma (Buyer Indifference at k = 1).">
                        <p>For <Math>{"k = 1"}</Math>, the buyer is indifferent between cooperating and defecting when the seller cooperates: <Math>{"u_b(\\mathrm{C}, \\mathrm{C}) = u_b(\\mathrm{D}, \\mathrm{C}) = -P"}</Math>.</p>
                    </FormalBlock>
                    <Proof>
                        With <Math>{"k = 1"}</Math>: <Math>{"C_b = P"}</Math> and <Math>{"\\pi_b = (k-1)P = 0"}</Math>. Cooperation yields <Math>{"u_b = \\pi_b - C_b = 0 - P = -P"}</Math>; defection leaves the bond locked, <Math>{"u_b = -C_b = -P"}</Math>. Since the two are equal, the mechanism provides zero marginal incentive to resolve. <Math>{"\\square"}</Math>
                    </Proof>
                    <FormalBlock label="Theorem (Minimal Viable Bond Multiplier).">
                        <p>Let <Math>{"k \\in \\mathbb{R}_{\\geq 1}"}</Math>. (a) For <Math>{"k = 1"}</Math>, <Math>{"\\mathrm{C}"}</Math> does not weakly dominate <Math>{"\\mathrm{D}"}</Math> for the buyer. (b) For every <Math>{"k > 1"}</Math>, <Math>{"\\mathrm{C}"}</Math> weakly dominates <Math>{"\\mathrm{D}"}</Math> for both players; <Math>{"k = 1"}</Math> is the infimum below which weak dominance fails on the buyer side. (c) Among integer multipliers, <Math>{"k = 2"}</Math> is the smallest at which weak dominance holds; for any <Math>{"k > 2"}</Math> the equilibrium is identical but capital requirements increase by <Math>{"(k - 2)(G + P)"}</Math> per order with no improvement in dominance.</p>
                    </FormalBlock>
                    <Proof>
                        Part (a) is the Lemma. Part (b): for <Math>{"k > 1"}</Math>, cooperation yields <Math>{"u_b(\\mathrm{C}, \\mathrm{C}) = (k-1)P - kP = -P"}</Math> and defection <Math>{"u_b(\\mathrm{D}, \\mathrm{C}) = -kP"}</Math>; the gap <Math>{"(k-1)P"}</Math> is strictly positive for every <Math>{"k > 1"}</Math> and collapses to zero at <Math>{"k = 1"}</Math>. Seller-side weak dominance holds for any <Math>{"k \\geq 1"}</Math> (the seller&rsquo;s cooperation payoff is <Math>{"+P"}</Math> regardless of <Math>{"k"}</Math>, while defection forfeits <Math>{"kG"}</Math>). Part (c): the smallest <em>integer</em> admitting weak dominance is <Math>{"k = 2"}</Math>; surplus capital at <Math>{"k > 2"}</Math> earns zero return and is pure deadweight cost. The integer restriction reflects the discrete denomination of bonded transfers in deployment, not a property of the equilibrium analysis. <Math>{"\\square"}</Math>
                    </Proof>
                </PaperSubsection>
                <PaperSubsection title="4.3 Escape-Hatch Weakness">
                    <FormalBlock label="Theorem (Escape-Hatch Weakness).">
                        <p>Let <Math>{"\\Gamma_E"}</Math> be the bonding game augmented with a unilateral exit action <Math>{"E"}</Math> available to player <Math>{"i"}</Math>, returning fraction <Math>{"\\alpha \\in (0, 1]"}</Math> of player <Math>{"i"}</Math>&rsquo;s bond. Then either (a) <Math>{"\\mathrm{C}"}</Math> no longer weakly dominates <Math>{"\\mathrm{D}"}</Math> for at least one player, or (b) <Math>{"E"}</Math> requires a decision by a third party <Math>{"J \\notin \\{B, S\\}"}</Math> whose incentives are not constrained by the bond structure.</p>
                    </FormalBlock>
                    <Proof>
                        We analyze three exhaustive sub-cases. <em>Case 1 (timeout):</em> the buyer&rsquo;s payoff under <em>Wait</em> against a cooperating seller is <Math>{"u_b(\\text{Wait}, \\mathrm{C}) = -C_b + \\alpha C_b = -2P(1 - \\alpha)"}</Math>. The buyer prefers <Math>{"\\mathrm{C}"}</Math> iff <Math>{"-P > -2P(1-\\alpha) \\Leftrightarrow 2(1-\\alpha) > 1 \\Leftrightarrow \\alpha < \\tfrac{1}{2}"}</Math>. For <Math>{"\\alpha \\geq \\tfrac{1}{2}"}</Math>, Wait yields <Math>{"u_b \\geq -P"}</Math>, so <Math>{"\\mathrm{C}"}</Math> no longer dominates; even for <Math>{"\\alpha < \\tfrac{1}{2}"}</Math> the deterrent weakens from <Math>{"2P"}</Math> to <Math>{"2P(1-\\alpha)"}</Math>. <em>Case 2 (arbitrator override):</em> a third party <Math>{"J"}</Math> can invoke <Math>{"E"}</Math>; <Math>{"J"}</Math> is unbonded (deposits nothing, risks nothing, has no mechanism-constrained incentive), so the resolution path depends on an agent outside the bond structure &mdash; condition (b). <em>Case 3 (governance vote):</em> a special case of Case 2 with <Math>{"J"}</Math> replaced by a set of unbonded voters, inheriting all of Case 2&rsquo;s problems plus coordination failure, plutocratic capture, and rational ignorance. In all cases either <Math>{"\\mathrm{C}"}</Math> ceases to dominate (Case 1) or resolution depends on an unbonded external agent (Cases 2&ndash;3). <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="On judicial review.">
                        The &ldquo;unbonded external agent&rdquo; condition targets actors whose decision is <em>constitutive</em> of the resolution path internal to the mechanism &mdash; arbitrators, juries, oracles, voters embedded in the bonding game itself. It does not target the external legal forum that may, on the evidence record, adjudicate a dispute <em>outside</em> the bonding game. Those forums are constrained by their own institutional bond structures and operate on the bonded commitment as evidentiary input rather than as a resolution path within the mechanism.
                    </PaperRemark>
                    <FormalBlock label="Corollary.">
                        <p>No timeout duration <Math>{"T"}</Math> and no recovery fraction <Math>{"\\alpha > 0"}</Math> can be added without weakening the buyer&rsquo;s incentive to cooperate. Full recovery (<Math>{"\\alpha = 1"}</Math>) reduces the game to a zero-cost option, making defection strictly dominant for the buyer.</p>
                    </FormalBlock>
                    <PaperRemark title="On cooperative unwind.">
                        A natural objection asks why the mechanism admits no dual-signed cancellation symmetric to the dual-signed commit: if both parties agree, why can they not jointly release the bonds? Because a cancellation signable after commitment is an exit action of the theorem&rsquo;s form, and it need not be unilateral to weaken the equilibrium. A bilaterally-signed release re-opens exactly the renegotiation-under-duress the locked bond exists to foreclose: the party holding the hostage advantage &mdash; the seller whose <Math>{"2G"}</Math> stays locked, or the buyer whose resolution is withheld &mdash; extracts a concession as the price of its cancelling signature, and the deterrent degrades to whatever that party will accept. A cancel path signable under pressure is an escape hatch by another door. The cooperative unwind parties do sometimes want is instead expressed <em>above</em> the mechanism, by composition: a counter-process whose orders net the original at cancellation terms the parties fix in advance, each of its edges itself bonded under the same rule. Undoing a commitment is thus itself a commitment &mdash; priced and bonded like any other &mdash; rather than a privileged exit carved into the settlement layer.
                    </PaperRemark>
                    <PaperRemark title="Robustness to weaker rationality.">
                        The dominance results extend beyond risk-neutral expected-payoff maximisation. First, the comparison (<Math>{"+P_i"}</Math> vs. <Math>{"-2G_i"}</Math> for the seller; <Math>{"-P_i"}</Math> vs. <Math>{"-2P_i"}</Math> for the buyer) is preserved under any strictly monotone utility transformation, so weak dominance holds for any preference order that prefers more money to less &mdash; including arbitrary risk-averse and loss-averse specifications. Second, the cooperation&ndash;defection gap <Math>{"P_i + 2G_i"}</Math> is bounded away from zero and grows with chain depth, so a trembling-hand refinement preserves the all-cooperate profile. Third, the argument requires only one comparison per player and no iterated reasoning about counterparty rationality. What remains outside the analysis is behaviour under non-pecuniary preferences (spite, fairness norms, intrinsic motivation to defect).
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. N-Party Process Chains">
                <PaperSubsection title="5.1 N-Party Asymmetric Bonding">
                    <FormalBlock label="Definition (Process Chain).">
                        <p>A <em>process chain</em> is a sequence of bonded orders <Math>{"\\langle o_1, \\ldots, o_n \\rangle"}</Math> sharing a common buyer <Math>{"B"}</Math> and denomination <Math>{"\\tau"}</Math>. Order <Math>{"o_i"}</Math> has local payment <Math>{"P_i > 0"}</Math> and cumulative value <Math>{"G_i = \\sum_{j=1}^{i} P_j"}</Math>. The seller of <Math>{"o_i"}</Math> posts bond <Math>{"C_{s,i} = 2G_i"}</Math>; the buyer posts <Math>{"C_{b,i} = 2P_i"}</Math>.</p>
                    </FormalBlock>
                    <FormalBlock label="Definition (N-Party Bonding Game).">
                        <p>The game <Math>{"\\Gamma_N = (\\{B, S_1, \\ldots, S_n\\}, \\{A_i\\}, \\{u_i\\})"}</Math> extends <Math>{"\\Gamma"}</Math> to <Math>{"n"}</Math> sellers under perfect monitoring (<Math>{"B"}</Math> observes each <Math>{"S_i"}</Math>&rsquo;s delivery and plays &ldquo;resolve iff all sellers cooperated&rdquo;). Seller payoff: <Math>{"u_{S_i} = +P_i"}</Math> if <Math>{"a_B = \\mathrm{C}"}</Math> and all <Math>{"a_{S_j} = \\mathrm{C}"}</Math>, else <Math>{"-2G_i"}</Math>. Buyer payoff: <Math>{"-\\sum_i P_i"}</Math> if all cooperate, else <Math>{"-\\sum_i 2P_i"}</Math>. Imperfect monitoring is addressed at composable surfaces above the mechanism (witness records) and lies outside the present scope.</p>
                    </FormalBlock>
                    <PaperRemark title="Sequential vs. simultaneous equivalence.">
                        <Math>{"\\Gamma_N"}</Math> is presented in simultaneous-move form, but in deployment commit, delivery, and resolve are sequential. The two are equivalent under asymmetric bonding: each <Math>{"S_i"}</Math>&rsquo;s payoff depends on its own action and the buyer&rsquo;s eventual resolve/not-resolve decision, not on the order in which other sellers acted. Defection by any participant forces non-resolution, yielding the same locked-bond payoff <Math>{"-2G_i"}</Math> regardless of timing. The dominance argument applies edge-by-edge at every node, so the IEWDS profile coincides with the subgame-perfect equilibrium of the extensive-form game.
                    </PaperRemark>
                    <FormalBlock label="Lemma (Buyer Best Response).">
                        <p>Under perfect monitoring, the buyer&rsquo;s best response to the cooperative seller profile <Math>{"(\\mathrm{C}, \\ldots, \\mathrm{C})"}</Math> is <em>resolve</em> (payoff <Math>{"-\\sum_i P_i"}</Math> versus <Math>{"-\\sum_i 2P_i"}</Math> under <em>not-resolve</em>). Under any profile in which at least one seller defects, the buyer&rsquo;s conditional strategy withholds resolution, yielding <Math>{"-\\sum_i 2P_i"}</Math>; withholding against non-delivery is the buyer&rsquo;s best response by the credibility argument of &sect;4.1, not an indifference, since atomic resolution would otherwise pay every committed seller including the non-performer.</p>
                    </FormalBlock>
                    <FormalBlock label="Theorem (N-Party Nash Equilibrium).">
                        <p>In <Math>{"\\Gamma_N"}</Math>, cooperation is weakly dominant for every seller <Math>{"S_i"}</Math> at every position <Math>{"i \\in \\{1, \\ldots, n\\}"}</Math>, and <Math>{"(\\mathrm{C}, \\ldots, \\mathrm{C})"}</Math> is the unique outcome surviving IEWDS.</p>
                    </FormalBlock>
                    <Proof>
                        Fix an arbitrary seller <Math>{"S_i"}</Math>. <em>Case 1 (all others cooperate, buyer resolves):</em> <Math>{"u_{S_i}(\\mathrm{C}) = +P_i"}</Math> and <Math>{"u_{S_i}(\\mathrm{D}) = -2G_i"}</Math>; since <Math>{"P_i + 2G_i > 0"}</Math>, cooperation strictly exceeds defection. <em>Case 2 (someone else defects):</em> resolution does not occur regardless of <Math>{"S_i"}</Math>&rsquo;s action, so <Math>{"u_{S_i}(\\mathrm{C}) = u_{S_i}(\\mathrm{D}) = -2G_i"}</Math>. Combining, <Math>{"\\mathrm{C}"}</Math> weakly dominates <Math>{"\\mathrm{D}"}</Math> for every seller; the buyer&rsquo;s dominance follows from the best-response lemma. In the first IEWDS round, <Math>{"\\mathrm{D}"}</Math> is eliminated for all players, leaving <Math>{"(\\mathrm{C}, \\ldots, \\mathrm{C})"}</Math>. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="Strength of the N-party result.">
                        The seller&rsquo;s cooperation&ndash;defection gap is <Math>{"\\Delta_i = P_i + 2G_i = P_i + 2\\sum_{j=1}^{i} P_j \\geq 3P_i"}</Math>, with equality only at the root and growing with every upstream payment.
                    </PaperRemark>
                    <FormalBlock label="Corollary (Coordination Pressure Grows With Depth).">
                        <p>The risk-to-reward ratio for <Math>{"S_i"}</Math> is <Math>{"\\rho_i = C_{s,i}/P_i = 2G_i/P_i = 2\\sum_{j=1}^{i} P_j / P_i"}</Math>. For equal payments, <Math>{"\\rho_i = 2i"}</Math>, growing linearly with chain depth; the deeper participant absorbs the cumulative upstream risk.</p>
                    </FormalBlock>
                    <p>
                        <em>Example.</em> Alice opens a process. Bob (seller 1) commits to provide the food ($10) and Charlie (seller 2) to deliver it ($2). Both bond against Alice&rsquo;s cumulative-value accumulator under the standard rule:
                    </p>
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Party", "Role", "Pᵢ", "Gᵢ", "C_{s,i}", "ρᵢ"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ["Bob", "Seller 1", "$10", "$10", "$20", "2.0"],
                                    ["Charlie", "Seller 2", "$2", "$12", "$24", "12.0"],
                                ].map((r) => (
                                    <tr key={r[0]}>{r.map((c, i) => <td key={i} className="border border-default px-3 py-1.5">{c}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p>Charlie risks $24 to earn $2 (<Math>{"\\rho = 12"}</Math>); Bob risks $20 to earn $10 (<Math>{"\\rho = 2"}</Math>). The deeper participant faces amplified consequences.</p>
                </PaperSubsection>
                <PaperSubsection title="5.2 Self-Enforcing Cumulative-Value Reporting">
                    <p>Must the mechanism validate the cumulative value reported by each seller at commit time? It need not &mdash; the bonding rule itself makes honest reporting dominant whenever the probability of non-resolution is positive.</p>
                    <FormalBlock label="Theorem (Cumulative-Value Reporting Honesty).">
                        <p>Under the monotonic-accumulator assumption, under-reports (<Math>{"G'_i < G_i"}</Math>) are rejected at commit. Among feasible reports <Math>{"G'_i \\geq G_i"}</Math>, truth-telling (<Math>{"G'_i = G_i"}</Math>) weakly dominates every over-report, strictly whenever the probability of non-resolution is positive.</p>
                    </FormalBlock>
                    <Proof>
                        Let <Math>{"q \\in [0,1]"}</Math> be the probability the buyer resolves. Then <Math>{"\\mathbb{E}[u_{S_i}(G'_i)] = q(2G'_i + P_i - 2G'_i) + (1-q)(-2G'_i) = q P_i - (1-q) 2G'_i"}</Math>. The derivative <Math>{"\\partial \\mathbb{E}[u_{S_i}] / \\partial G'_i = -2(1-q)"}</Math> is strictly negative for <Math>{"q < 1"}</Math>, so expected utility is strictly decreasing in the reported value; the optimum is the smallest feasible <Math>{"G'_i = G_i"}</Math>. For <Math>{"q = 1"}</Math> the seller is indifferent (truth-telling weakly optimal). Since <Math>{"q < 1"}</Math> in any realistic setting, truth-telling strictly dominates overstating. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="Why the mechanism does not validate reports.">
                        Beyond enforcing accumulator monotonicity, the mechanism performs no validation of cumulative-value reports. Misreporting cannot profit a seller because the bonding rule already makes overstating <Math>{"G_i"}</Math> strictly dominated.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="5.3 Atomic Resolution and Seller Coordination">
                    <FormalBlock label="Theorem (Endogenous Coordination Pressure).">
                        <p>The <Math>{"N"}</Math>-party bonding game under atomic resolution induces a <em>weakest-link public goods game</em> among sellers, where each seller&rsquo;s payout depends on universal cooperation.</p>
                    </FormalBlock>
                    <Proof>
                        Fixing the buyer&rsquo;s strategy (resolve iff all cooperate), the <em>externality</em> imposed by <Math>{"S_k"}</Math>&rsquo;s defection on <Math>{"S_i"}</Math> (<Math>{"i \\neq k"}</Math>) is <Math>{"\\varepsilon_{k \\to i} = u_{S_i}(\\text{all }\\mathrm{C}) - u_{S_i}(S_k \\text{ defects}) = P_i - (-2G_i) = P_i + 2G_i"}</Math>, strictly positive. The total externality of <Math>{"S_k"}</Math>&rsquo;s defection is <Math>{"\\mathcal{E}_k = \\sum_{i \\neq k}(P_i + 2G_i)"}</Math>. This satisfies the defining properties of a weakest-link game (Hirshleifer, 1983): the group outcome depends on the minimum individual effort; the cooperative outcome is Pareto-optimal among the subgame&rsquo;s Nash equilibria; and the marginal value of cooperation is constant on the all-cooperate profile and zero elsewhere &mdash; the characteristic weak-link structure. Every <Math>{"S_i"}</Math> has a direct mechanism-level economic interest of magnitude <Math>{"P_i + 2G_i"}</Math> in <Math>{"S_k"}</Math>&rsquo;s cooperation, computable from the monotonic accumulator alone, with no information acquisition, repeated interaction, or communication required. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="Distinction from the experimental weakest-link literature.">
                        The experimental literature (Van Huyck, Battalio, &amp; Beil, 1990) finds that weakest-link games empirically produce coordination <em>failure</em> in groups larger than two: players converge to the Pareto-inferior all-defect equilibrium via pessimistic beliefs. This does not threaten the result above. That failure arises when cooperation is <em>collectively</em> preferred but not <em>individually</em> dominant. In the bonded mechanism, defection is individually dominated regardless of others (Case 2 of the <Math>{"N"}</Math>-party proof: even when all others defect, <Math>{"S_i"}</Math> incurs <Math>{"-2G_i"}</Math> either way, so there is no strategic incentive to defect). The cooperation pressure arises in a setting where coordination failure through pessimistic beliefs cannot occur.
                    </PaperRemark>
                    <FormalBlock label="Proposition (Collusion is Unprofitable).">
                        <p>Let <Math>{"K \\subseteq \\{S_1, \\ldots, S_n\\}"}</Math> be any non-empty seller coalition and <Math>{"X"}</Math> an external party paying a side transfer for joint defection by <Math>{"K"}</Math>. Joint defection is not a Pareto improvement over universal cooperation for <Math>{"K \\cup \\{X\\}"}</Math>: the minimum side transfer at which <Math>{"K"}</Math>&rsquo;s members defect, <Math>{"T_{\\min}(K) = \\sum_{i \\in K}(P_i + 2G_i) \\geq 3\\sum_{i \\in K} P_i"}</Math>, weakly exceeds <Math>{"X"}</Math>&rsquo;s maximum benefit <Math>{"B_{\\max}(K) \\leq 3\\sum_{i \\in K} P_i"}</Math>, strictly whenever <Math>{"K"}</Math> contains any non-root seller.</p>
                    </FormalBlock>
                    <Proof>
                        For each <Math>{"S_i \\in K"}</Math>, the cooperation&ndash;defection gap is <Math>{"\\Delta_i = P_i + 2G_i"}</Math>, so <Math>{"X"}</Math> must transfer at least <Math>{"\\Delta_i"}</Math>, giving <Math>{"T_{\\min}(K) = \\sum_{i \\in K}(P_i + 2G_i) \\geq 3\\sum_{i \\in K} P_i"}</Math> (equality only when every <Math>{"S_i"}</Math> is a root order). <Math>{"X"}</Math>&rsquo;s benefit from non-resolution is bounded by the total loss <Math>{"X"}</Math> can impose on <Math>{"B"}</Math> &mdash; the locked buyer bonds <Math>{"\\sum_{i \\in K} 2P_i"}</Math> plus the goods&rsquo; value to <Math>{"B"}</Math> (bounded by willingness to pay <Math>{"\\sum_{i \\in K} P_i"}</Math>) &mdash; so <Math>{"B_{\\max}(K) \\leq 3\\sum_{i \\in K} P_i"}</Math>. Combining, <Math>{"T_{\\min}(K) \\geq B_{\\max}(K)"}</Math>, strict whenever <Math>{"K"}</Math> contains a seller with <Math>{"G_i > P_i"}</Math>. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="Margin grows with chain depth.">
                        The dominance margin <Math>{"T_{\\min}(K) - B_{\\max}(K) \\geq 2\\sum_{i \\in K}(G_i - P_i) \\geq 0"}</Math> is monotone in chain depth: deeper colluding sellers face a larger spread between their bonds <Math>{"2G_i"}</Math> and the harm imposable on the buyer. Coalitions of deep-chain sellers are the most strictly unprofitable.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="5.4 Seller Non-Performance and Externality Handling">
                    <p>Four externality categories arise; the mechanism treats them with a single primitive &mdash; bonded sub-orders, optionally layered with external risk products &mdash; without additional governance.</p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><em>Intra-process externalities</em> (the loss one seller&rsquo;s defection imposes on co-sellers) are handled by the bonding mechanism itself: defection is weakly dominated for every seller, and the cooperation pressure propagating through atomic resolution is the externality made strategic.</li>
                        <li><em>Seller non-performance</em> is absorbed by pre-commitment substitution or, once the seller is bonded, by the weakest-link subgame of &sect;5.3, optionally layered with an external risk product (performance guarantee, surety bond, insurance).</li>
                        <li><em>Buyer non-performance</em> (commits but never resolves) is absorbed by the no-escape-hatch property: the buyer&rsquo;s bond remains locked indefinitely, a <Math>{"2P"}</Math> deterrent equal to the buyer&rsquo;s worst-case loss.</li>
                        <li><em>Third-party externalities</em> (harms to non-participants) compose the same way: the harmed party becomes a remediation buyer in a new bonded sub-order against the harming party, or an external risk product layers over the process in advance.</li>
                    </ol>
                    <PaperRun title="Seller substitution.">
                        Substitution respects atomic resolution, which settles every order in a process together or none. Before <Math>{"S_i"}</Math> has committed &mdash; a bilateral order requires its counter-signature &mdash; nothing is locked on its behalf, and the buyer simply commits a replacement <Math>{"S_i'"}</Math> in its place. Once <Math>{"S_i"}</Math> has committed, its bond is live and cannot be selectively forfeited: resolving the process pays every listed order, and withholding locks every bond until it resolves. A post-commitment non-performance therefore does not isolate to <Math>{"S_i"}</Math>; it triggers the weakest-link subgame of &sect;5.3 &mdash; the standing pressure on every co-seller to see the process through, and on <Math>{"S_i"}</Math> to cure under the hostage of its own <Math>{"2G_i"}</Math>. The buyer&rsquo;s terminal options are to resolve (accepting that the non-performer is paid, and pursuing recovery against it on the external evidence record) or to withhold under mutual assured destruction; a replacement, where sourced, runs as a fresh order. This is the coordination pressure the mechanism is built to produce, not a leak in it.
                    </PaperRun>
                    <PaperRun title="External risk products.">
                        Where substitution is impractical, standard instruments (performance guarantees, surety bonds, insurance) layer over the bonded process: they hold independently bonded positions on the seller&rsquo;s behalf, do not commit or resolve, hold no mechanism state, and leave the bonding equilibrium intact.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.5 Comparison with Joint-Liability Microfinance">
                    <p>
                        The coordination pressure above is operationally analogous to the peer-enforcement equilibrium in joint-liability microfinance, formalized by Ghatak (1999) and Stiglitz (1990) on the Grameen Bank model (Yunus, 1999). Those models obtain peer enforcement through joint-liability contracting <em>plus</em> a social substrate (repeated interaction, local information, exogenous social sanction); the contract alone is insufficient. The bonded mechanism reproduces the same equilibrium-selection effect under strictly weaker assumptions.
                    </p>
                    <FormalBlock label="Proposition (Assumption Reduction on Cooperation Pressure).">
                        <p>The cooperation-pressure component of the equilibrium common to Ghatak (1999) and Stiglitz (1990) is obtained by the bonded commitment mechanism requiring none of: (i) repeated interaction, (ii) local information among sellers, (iii) a punishment technology exogenous to the contract, nor (iv) joint-liability contracting.</p>
                    </FormalBlock>
                    <Proof>
                        The <Math>{"N"}</Math>-party Nash theorem establishes cooperation as the unique IEWDS survivor in a one-shot game, using only the payoff function &mdash; no continuation value or trigger strategies; (i) is not required. The externality <Math>{"\\varepsilon_{k \\to i} = P_i + 2G_i"}</Math> is computed from the monotonic accumulator, independent of any seller&rsquo;s information about co-sellers; (ii) is not required. The punishment for a co-seller&rsquo;s defection is the loss of <Math>{"S_i"}</Math>&rsquo;s own bond <Math>{"2G_i"}</Math>, imposed by the mechanism through non-resolution; (iii) is not required. Each <Math>{"C_{s,i}"}</Math> is posted individually against <Math>{"S_i"}</Math>&rsquo;s own snapshot, not the group&rsquo;s aggregate obligation; coupling arises from atomic resolution, not the bond structure; (iv) is not required. <Math>{"\\square"}</Math>
                    </Proof>
                    <p>
                        The reduction is scoped to cooperation pressure. Two further microfinance results &mdash; peer selection on private types (Ghatak, 1999) and peer monitoring under principal information asymmetry (Stiglitz, 1990) &mdash; are not directly reproduced; both require additional structure above the bonded primitive (attested credentials, signal-contingent resolution rules) and lie outside the present scope. The reduction reframes rather than corrects those theorems: their assumptions characterize one settlement environment, not necessary conditions for endogenous peer monitoring &mdash; once the settlement layer admits bilaterally signed, individually collateralized commitments with atomic resolution, the same outcome obtains among strangers in a single shot with no social substrate.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Dispute Resolution">
                <p>
                    Within the perfect-monitoring model of &sect;4&ndash;&sect;5, dispute resolution is marginal by design. Defection is weakly dominated for every party at every position, and the cooperation pressure that propagates through atomic resolution makes each seller&rsquo;s payout contingent on universal cooperation. The bonded process itself absorbs almost all of the work that traditional arrangements externalise to courts, arbitrators, and platform adjudication. The marginality claim is scoped to that model: disputes that turn on honest disagreement about whether performance met the agreement &mdash; the imperfect-monitoring case placed outside scope in &sect;5.1 &mdash; are not settled by the mechanism at all, and are the concern of the composable surfaces above it rather than of the bonding game.
                </p>
                <p>
                    For the marginal cases where internal pressure does not resolve a dispute, the bonded commitment is compatible with external legal and arbitral forums &mdash; but the composition is asymmetric. Such forums adjudicate <em>outside</em> the bonding game, consuming the evidence record the mechanism produces; they cannot serve as a constitutive resolution path within it without breaking the equilibrium (escape-hatch weakness, Case 2). Parties may name a forum in their composed graph, and the choice does not affect the bonding equilibrium.
                </p>
                <PaperRun title="Post-delivery extraction.">
                    A residual concern targets the buyer&rsquo;s resolve monopoly head-on: once the seller has delivered, the buyer alone holds the key to settlement, and a strategic buyer might withhold resolution as leverage &mdash; resolving only if the seller concedes something beyond the agreed terms. This is the classical objection to a unilaterally held hostage (Williamson, 1983): the party holding the hostage is tempted to expropriate it. Under asymmetric bonding the temptation is self-defeating, for three composing reasons, and post-delivery renegotiation is not a viable strategy. First, the threat is never free to make. A buyer who withholds after delivery does not sit at zero; it forfeits its own bond above the payment &mdash; resolving returns the buyer to <Math>{"-P"}</Math>, withholding holds it at <Math>{"-2P"}</Math> &mdash; so the leverage is financed out of the very <Math>{"2P"}</Math> the mechanism locked as the buyer&rsquo;s own deterrent, and it decays for exactly as long as the buyer wields it.
                </PaperRun>
                <p>
                    Second, the attempt is permanently and publicly evidenced. The bonded process is recorded on chain as an evidence event (&sect;3.2); a process the buyer leaves unresolved after performance persists there indefinitely, its locked bonds and the buyer&rsquo;s address plainly attached. A non-resolution standing against a delivered order is legible to anyone who reads that address&rsquo;s history, and a counterparty deciding whether to bond into a future process with this buyer reads exactly that. The extracting buyer therefore spends its own future access to the network &mdash; the standing record does the work a reputation system would do, without the mechanism containing one.
                </p>
                <p>
                    Third, recourse is never foreclosed. The same evidence record supports adjudication by an external forum &mdash; arbitration such as Kleros, or an ordinary legal system &mdash; acting on the extraction attempt from outside the bonding game, exactly as the external-forum composition above provides and without weakening the equilibrium (escape-hatch weakness, Case 2). No clause need be named in the agreement for that recourse to exist; the mechanism pushes dispute resolution to the periphery, it does not eliminate it.
                </p>
                <p>
                    Taken together, the resolve monopoly is not a bargaining chip. Using it as one converts the buyer&rsquo;s protective instrument &mdash; the power to withhold settlement from a non-performing seller &mdash; into a self-financed, self-documenting act against the buyer&rsquo;s own bond and future standing. The monopoly is safe to concentrate in the buyer precisely because exercising it abusively is self-defeating on every margin at once.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    We have presented Figaro, a settlement primitive that achieves self-enforcing multi-party coordination through two composing mechanisms. The mechanism is minimal &mdash; no timeout, no governance, no escape hatches &mdash; and the minimality is itself a security requirement: any unilateral exit path weakens the Nash equilibrium. Under perfect monitoring and complete information, cooperation is weakly dominant at every position in an <Math>{"N"}</Math>-party process chain, and the cooperative profile is the unique outcome surviving iterated elimination of weakly dominated strategies. The same per-edge structure makes seller coalitions unprofitable even with external side-payment. Finally, the mechanism reproduces the cooperation-pressure component of the peer-enforcement equilibrium in joint-liability microfinance under strictly weaker assumptions, with no appeal to repeated interaction, local information, or social sanction.
                </p>
            </PaperSection>

            <PaperSection title="Acknowledgments">
                <p className="text-sm text-ink-muted">
                    I thank the Solidity team for the Safe Remote Purchase pattern, Fabrizio Romano Genovese for his contributions to Figaro, Vlad Zamfir for early conversations on consensus, and the broader Ethereum community for the body of work in mechanism design, coordination economics, and applied cryptographic settlement that this paper builds on.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

import type { Metadata } from "next";
import { PAPER_CELL } from "@/components/papers/tableCell";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "External Events and the Resolution Frame — Figaro",
    description:
        "Everything that happens between a process's commits and its buyer's resolution (a cargo resold in transit, a partial loss, a seller that cannot perform, a forum's ruling) meets one rule: the parties square it before the buyer resolves. A fixed resolution schedule plus free transfers among the parties reaches any reallocation of the committed value. No transfer disturbs the buyer's reason to resolve. A failing seller executes its agreed part: a transfer answering performance the buyer has not received. It does so up to a bound set by its payment, its bond and what it retains, because that bond stays locked while the parties negotiate. That holds given a buyer that resolves once the agreed transfers have executed and not before, and a reallocation that closes the process with the seller giving up what it retains. The results hold for parties beyond each other's coercive reach. The frame is deterministic and keeps exactly one discretionary act.",
});

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

export default function ExternalEventsPaper() {
    return (
        <PaperLayout slug="external-events"
            title="External Events and the Resolution Frame"
            subtitle="One Rule for Everything the World Does Between the Two Calls"
            author="Figaro"
            date="September 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        A bonded process has two calls. <em>Commit</em> fixes a deterministic resolution schedule, every amount set by the parties&rsquo; signatures and none changed by elapsed time. <em>Resolve</em> is the buyer&rsquo;s terminal judgment of performance, available at any moment and compelled at none. Between the two a pallet is crushed, a seller cannot perform, a forum rules. We call any occurrence that changes the resolution the parties want an <em>external event</em>, and show that one rule meets every such event: the parties square it before the buyer resolves.
                    </p>
                    <p>
                        Write <Math>{"P_i"}</Math> for the payment of order <Math>{"i"}</Math> and <Math>{"G_i"}</Math> for the value accumulated through it. Free transfers among the parties before resolution reach every point of the zero-sum hyperplane through the committed schedule, the allocations that sum to zero, with fewer transfers than there are parties (Proposition 1). No transfer touches a bond, the accumulator (the process&rsquo;s running total of payments), or the schedule, so after performance resolving stays strictly better for the buyer (Proposition 2). Proposition 3 takes parties beyond each other&rsquo;s coercive reach and a buyer that resolves once the agreed reallocation has executed, and not before. A seller then executes an agreed transfer <Math>{"\\tau"}</Math> answering performance the buyer has not received whenever <Math>{"\\tau < P_i + 2G_i - r_i"}</Math>. Here <Math>{"r_i"}</Math> is what it retains off-chain, given up when the reallocation closes the process. The result is one-sided: a buyer holding performance may refuse a transfer and resolve anyway, so the frame makes good the transfers a remedy from a failing seller is made of. A frame that freezes the arithmetic and keeps one discretionary act absorbs events nobody has listed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bernstein, Lisa. 1992. &ldquo;Opting Out of the Legal System: Extralegal Contractual Relations in the Diamond Industry.&rdquo; <em>Journal of Legal Studies</em> 21 (1): 115&ndash;157. https://doi.org/10.1086/467902.</li>
                    <li>Coase, Ronald H. 1960. &ldquo;The Problem of Social Cost.&rdquo; <em>Journal of Law and Economics</em> 3: 1&ndash;44. https://doi.org/10.1086/466560.</li>
                    <li>Ellickson, Robert C. 1991. <em>Order without Law: How Neighbors Settle Disputes</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 23, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Fischhoff, Baruch, Paul Slovic, and Sarah Lichtenstein. 1978. &ldquo;Fault Trees: Sensitivity of Estimated Failure Probabilities to Problem Representation.&rdquo; <em>Journal of Experimental Psychology: Human Perception and Performance</em> 4 (2): 330&ndash;344. https://doi.org/10.1037/0096-1523.4.2.330.</li>
                    <li>Hart, Oliver, and John Moore. 1988. &ldquo;Incomplete Contracts and Renegotiation.&rdquo; <em>Econometrica</em> 56 (4): 755&ndash;785. https://doi.org/10.2307/1912698.</li>
                    <li>Knight, Frank H. 1921. <em>Risk, Uncertainty and Profit</em>. Boston: Houghton Mifflin.</li>
                    <li>Kreps, David M. 1979. &ldquo;A Representation Theorem for &lsquo;Preference for Flexibility.&rsquo;&rdquo; <em>Econometrica</em> 47 (3): 565&ndash;577. https://doi.org/10.2307/1910406.</li>
                    <li>Macaulay, Stewart. 1963. &ldquo;Non-Contractual Relations in Business: A Preliminary Study.&rdquo; <em>American Sociological Review</em> 28 (1): 55&ndash;67. https://doi.org/10.2307/2090458.</li>
                    <li>Maskin, Eric, and Jean Tirole. 1999. &ldquo;Unforeseen Contingencies and Incomplete Contracts.&rdquo; <em>Review of Economic Studies</em> 66 (1): 83&ndash;114. https://doi.org/10.1111/1467-937X.00079.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Savage, Leonard J. 1954. <em>The Foundations of Statistics</em>. New York: John Wiley &amp; Sons.</li>
                    <li>Simon, Herbert A. 1955. &ldquo;A Behavioral Model of Rational Choice.&rdquo; <em>Quarterly Journal of Economics</em> 69 (1): 99&ndash;118. https://doi.org/10.2307/1884852.</li>
                    <li>Tversky, Amos, and Derek J. Koehler. 1994. &ldquo;Support Theory: A Nonextensional Representation of Subjective Probability.&rdquo; <em>Psychological Review</em> 101 (4): 547&ndash;567. https://doi.org/10.1037/0033-295X.101.4.547.</li>
                </>
            }
        >
            <PaperSection title="1. The Window Between the Two Calls">
                <p>
                    A consignment is mid-voyage under three bonded orders when its owner agrees to sell it. Who should now pay for the voyage is a question nobody could answer when the orders were signed. The orders are held by the mechanism, smart contracts with two operations that bond the parties to a trade and pay them out. A smart contract is a program that a public chain runs exactly as written, and a public chain is a ledger that anyone may read and submit to.
                </p>
                <p>
                    A <em>process</em> is what one buyer opens. It is a sequence of <em>orders</em>, each one buyer&ndash;seller commitment, and its orders are resolved together. A party appears to the mechanism as a <em>wallet</em>: a signing key and the balance it controls. Every order of a process is counted in one denomination, a single token.
                </p>
                <p>
                    Write <Math>{"P_i > 0"}</Math> for the payment of order <Math>{"i"}</Math>. The process keeps one running total of its payments, the <em>accumulator</em>, which each commit extends by that commit&rsquo;s payment. Write <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> for the accumulator&rsquo;s value through order <Math>{"i"}</Math>, its own payment included. Then <Math>{"G_i \\geq P_i"}</Math>, with equality only at the first order.
                </p>
                <p>
                    The mechanism exposes two operations that move tokens or write a bond or the accumulator, and no other. <em>Commit</em> takes a commitment signed by the buyer and seller <Math>{"S_i"}</Math> and locks two bonds: <Math>{"2P_i"}</Math> from the buyer and <Math>{"2G_i"}</Math> from the seller. The bonds make keeping its word each party&rsquo;s better move while the others keep theirs. The seller&rsquo;s bond is twice the value accumulated through its own order, the most a holdout there could keep. Commit computes the accumulator&rsquo;s new value as arithmetic, its old value plus the new payment, and admits no other figure. <em>Resolve</em> may be called only by the buyer that opened the process, and it is atomic: every order of the process resolves at once, or none does. Each seller is paid its payment and refunded its bond whole; the buyer is refunded its bond less the payments it carried.
                </p>
                <p>
                    The chain holds fingerprints and figures, never the terms. An <em>agreement</em> is the clauses composed for one buyer&ndash;seller relationship, which the two parties complete and sign as their order&rsquo;s terms, a <em>clause</em> being one reusable term published for anyone to compose. Each commitment carries a fingerprint of its agreement, one hash of the composed clauses. An <em>attestation</em> is a statement a party signs about an order it is party to while the order is open. It is held as a content hash, a fingerprint of the statement, bound to a clause of that order&rsquo;s agreement. The bonds and the accumulator are held as figures. Nothing in the mechanism tests performance, which happens off-chain.
                </p>
                <p>
                    Between the two calls the interval is open, and no clock runs in it. Nothing matures and nothing expires. A party&rsquo;s locked bond, what it stands to receive at resolution and what it holds off-chain are held, not lost, until the buyer resolves. A buyer that loses its key, having made no provision while it held it, strands every bond in its process. The interval is where goods travel and work is done, and the world does not pause because two parties have signed.
                </p>
                <PaperRun title="External events.">
                    An <em>external event</em> is any occurrence, after the signatures that open or extend a process and before its resolution, that changes which resolution the parties want. The definition is by effect, not by kind, because the mechanism has no representation of an occurrence. What it holds is a schedule and a set of positions, and an event can only change which allocation of the committed value the parties now want. A cargo resold in transit, a pallet crushed in a warehouse, a courier that cannot reach the address, a forum&rsquo;s ruling, a currency movement that makes one party regret its price: these differ in every respect that matters commercially. They differ in none that matters to the resolution frame, the committed schedule and its closure, which Section 3 defines.
                </PaperRun>
                <p>
                    The reader&rsquo;s prior is that trust between strangers is repaired <em>afterwards</em>, by someone with the authority to decide: a platform that inspects and then releases a payment, a card network that reverses a charge, an arbitrator, a court. On that model an event is an input to a decision procedure. A decision procedure must recognize its inputs, so the mechanism needs a list of what can happen and a rule for each entry. The institution is old: the private judges of the Champagne fairs kept such a procedure, and their authority rested on knowing who had been found in default (Milgrom, North, and Weingast 1990). It also seats a decision with a party that has bonded nothing.
                </p>
                <p>
                    This paper&rsquo;s claim concerns a mechanism which recognizes no event: a fixed deterministic schedule, free transfers among the parties before resolution, and one discretionary act. Such a mechanism reaches every zero-sum reallocation of the committed value. It leaves the buyer&rsquo;s reason to resolve unchanged. Its third result concerns a failing seller&rsquo;s part of a reallocation: a transfer answering performance the buyer has not received, in a reallocation that closes the process with the seller giving up what it holds. Given a buyer that resolves once the agreed transfers have executed and not before, the mechanism makes that part credible up to a bound set by the payment, the seller&rsquo;s bond and what it retains. The bound is what the seller&rsquo;s comparison makes worth sending, not what it can send: a transfer comes from a balance held beyond the bonds, so a seller short of tokens executes at most the smaller of the bound and that balance. The three parts are Propositions 1 to 3, each with its falsifier and scope. The two that rest on the equilibrium, Propositions 2 and 3, hold for parties beyond each other&rsquo;s coercive reach (neither can reach the other to take by force what it is owed).
                </p>
                <p>
                    That such a mechanism does better than one which adjudicates events is the economic hypothesis of Section 8. The hypothesis sets this design against adjudication as the decision-science literature and Lemma 2 describe it, not against an adjudicating mechanism specified and solved, and this paper does not make that comparison. Section 2 separates two questions about any decision: when it is made, and whether it is computed or exercised. Section 3 states what commit creates and the equilibrium the argument uses. Section 4 proves that the fixed schedule constrains the arithmetic and not the allocation, and that the reallocation is credible for the reason the schedule was. Section 5 states the rule and its instances, and Section 6 works the cargo-resale case. Section 7 shows that granularity is a design variable of the bargaining, and Section 8 states what the design buys.
                </p>
            </PaperSection>

            <PaperSection title="2. Discretionary and Deterministic">
                <p>
                    Two questions separate every decision that bears on a resolution. The first is <em>when</em>: before both parties have signed, or after? The second is <em>how</em>: computed deterministically from what was signed, or exercised by a named party at its own discretion? The pivot for the first is the signature pair, where assent is complete and the terms stand as signed. Crossing the two questions gives four positions, and all four are occupied.
                </p>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className={`${PAPER_CELL} text-left text-ink-muted font-normal`}> </th>
                                <th className={`${PAPER_CELL} font-semibold text-ink-heading`}>Deterministic</th>
                                <th className={`${PAPER_CELL} font-semibold text-ink-heading`}>Discretionary</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={`${PAPER_CELL} font-semibold text-ink-heading`}>Before the signatures</td>
                                <td className={PAPER_CELL}>the bond schedule applied to the signed figures; the accumulator&rsquo;s arithmetic; the hashing of what was assented to</td>
                                <td className={PAPER_CELL}>what to offer, whom to bind, which terms to compose, what price to accept: where all meaning enters</td>
                            </tr>
                            <tr>
                                <td className={`${PAPER_CELL} font-semibold text-ink-heading`}>After the signatures</td>
                                <td className={PAPER_CELL}>the resolution schedule&rsquo;s execution; the data of what was undertaken</td>
                                <td className={PAPER_CELL}>the buyer&rsquo;s decision to resolve; the remedies the parties agree beforehand; a forum&rsquo;s ruling on the open process</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="text-xs text-ink-muted mt-2">The lower-right cell holds exactly one act that the mechanism itself executes: the buyer&rsquo;s resolution. The remedies and the ruling are the parties&rsquo; and a forum&rsquo;s, and reach the mechanism only through what the parties do with them.</p>
                </PaperScroll>
                <PaperRun title="One discretionary act, and what it does.">
                    After the signatures everything the mechanism does is fixed by them, except whether and when the buyer resolves. That act is discretionary in the strong sense: the mechanism holds no test of performance, and no attestation conditions resolution. Resolution <em>is</em> the buyer&rsquo;s judgment of performance. Because it is atomic across the process, its force reaches beyond any one order: nobody is paid until it is called, so every seller holds a live interest in every co-seller&rsquo;s (every other seller&rsquo;s) performance. A seller&rsquo;s <em>bonded interest</em> in a co-seller&rsquo;s performance is what it is kept from while that performance is missing: the payment it awaits plus its bond, which stays locked, less what it still holds. A seller that has performed has a bonded interest of <Math>{"P_i + 2G_i"}</Math>, since it has parted with its work and its whole bond stays locked. One that has not yet performed has a bonded interest of at least <Math>{"P_i + G_i"}</Math>, since it still holds at most <Math>{"G_i"}</Math> of value. Both figures are arithmetic on the signed accumulator, and they make the co-sellers participants in any negotiation over an event.
                </PaperRun>
                <p>
                    External events force discretion. The world does not arrive with an answer to who should bear a loss, and no arithmetic derives one. Whether a seller that could not deliver should send back the payment, or half of it, or make good in kind, or be forgiven, is a question about what these parties think fair and expedient. It is uncertainty in Knight&rsquo;s (1921) sense: not a draw from a distribution the parties could have written down, but an occurrence whose description was unavailable when they signed. A mechanism can meet it in one of two ways. It can absorb the discretion, enumerating events and appointing someone to decide each; or it can hold the arithmetic still and let the parties decide. This one does the second.
                </p>
            </PaperSection>

            <PaperSection title="3. The Resolution Frame">
                <p>
                    Commit creates a schedule and five closures, and nothing after it changes either. The <em>resolution frame</em>, the frame for short, is the committed schedule of Definition 1 together with the closure properties of Definition 2. Consider a process opened by a buyer <Math>{"B"}</Math> and extended by orders <Math>{"i = 1, \\ldots, n"}</Math>, order <Math>{"i"}</Math> carrying the payment <Math>{"P_i"}</Math> and the seller <Math>{"S_i"}</Math>. The parties hold balances sufficient to bond.
                </p>
                <FormalBlock label="Definition 1 (The committed schedule).">
                    <p>At commit, order <Math>{"i"}</Math> locks <Math>{"2P_i"}</Math> from <Math>{"B"}</Math> and <Math>{"2G_i"}</Math> from <Math>{"S_i"}</Math>. At resolution it pays <Math>{"2G_i + P_i"}</Math> to <Math>{"S_i"}</Math> and <Math>{"P_i"}</Math> to <Math>{"B"}</Math>, which exhausts what was locked. The <em>committed schedule</em> is the vector of net movements across the two calls,</p>
                    <p><Math display>{"\\sigma = \\bigl(\\sigma_B;\\, \\sigma_1, \\ldots, \\sigma_n\\bigr), \\qquad \\sigma_B = -\\sum_{i} P_i, \\qquad \\sigma_i = +P_i,"}</Math></p>
                    <p>so that <Math>{"\\sum \\sigma = 0"}</Math>: every locked unit leaves to one of the parties, and there is no third recipient. A wallet may hold more than one order, and the buyer may also be a seller; a wallet&rsquo;s coordinates then add, and the schedule is read over the <Math>{"m + 1"}</Math> distinct parties, <Math>{"m \\leq n"}</Math>. The schedule is fixed by the signatures and the accumulator at each commit, and no later occurrence alters a term of it.</p>
                </FormalBlock>
                <FormalBlock label="Definition 2 (Closure of the frame).">
                    <p>The frame created by commit has five closure properties, and the argument uses all of them.</p>
                    <p>(i) <em>No position transfer.</em> A party&rsquo;s place in a process is not assignable, not transferable, and not represented by any object the mechanism issues. There is nothing to sell, endorse, or pledge.</p>
                    <p>(ii) <em>No party substitution.</em> An order names its two parties in what they signed. No operation replaces one of them, and a wallet that has not signed and bonded is not in the process.</p>
                    <p>(iii) <em>No partial resolution.</em> Resolution is atomic: every order of the process resolves, or none does. No order resolves alone.</p>
                    <p>(iv) <em>No third-party call.</em> Only the buyer that opened the process may resolve it.</p>
                    <p>(v) <em>No other path to a bond.</em> Resolution is the only operation that moves a locked unit. There is no timeout, no cancellation, no unilateral exit, and no operation that refunds part of a bond on any terms but resolution.</p>
                </FormalBlock>
                <PaperSubsection title="3.1 The equilibrium the frame carries">
                    <PaperRun title="The payoff convention.">
                        A party&rsquo;s payoff has two parts: what the mechanism moves to or from it, and the off-chain value in its hands. That value is credited at the measure the parties signed: <Math>{"P_i"}</Math> for the exchange at order <Math>{"i"}</Math>, and at most <Math>{"G_i"}</Math> for everything accumulated through it. It is always a credit and never a debit: a party is counted for what it holds and never charged for what it does not. Write <Math>{"r_i \\leq G_i"}</Math> for what seller <Math>{"S_i"}</Math> can actually retain if it holds out. A courier holds a cargo; it cannot retain a delivery it never made.
                    </PaperRun>
                    <FormalBlock label="Lemma 1 (The two-call equilibrium).">
                        <p>This lemma restates, in the frame&rsquo;s notation and payoff convention, Theorem 3 of Figaro (2026), proved there for parties beyond each other&rsquo;s coercive reach; the proof is not repeated. Take the profile (a plan, or strategy, for each party) in which every seller performs and the buyer resolves once every order has been performed, and not before. Under the payoff convention:</p>
                        <p>(a) At any node where the buyer acts after performance, resolving yields <Math>{"0"}</Math> and never resolving yields <Math>{"-\\sum_i P_i"}</Math>, with no assumption about any seller.</p>
                        <p>(b) Given (a) and the buyer&rsquo;s plan, and given that its co-sellers perform, seller <Math>{"S_i"}</Math> strictly prefers performing, <Math>{"+P_i"}</Math>, to never performing, <Math>{"-2G_i + r_i \\leq -G_i"}</Math>, by a margin of at least <Math>{"\\Delta_i = P_i + G_i \\geq 2P_i"}</Math>.</p>
                        <p>(c) Given (b), before every seller has performed the buyer prefers keeping the process open, which leads to <Math>{"0"}</Math>, to resolving at once, which is terminal at <Math>{"-\\sum_i P_i + V"}</Math>, where <Math>{"V"}</Math> is the signed value of the performance already in hand, zero before any.</p>
                        <p>(b) and (c) are the two parties&rsquo; best-response checks against one profile, verified jointly: the profile is a fixed point, which is what an equilibrium is. (a) is the one unconditional anchor.</p>
                    </FormalBlock>
                    <p>
                        Cooperation is the equilibrium, not a dominant strategy (a plan best against every plan of the others): a seller facing a buyer that will never resolve keeps its goods, and no schedule changes that. The doubling answers retention. Value passes off-chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7 and the remark after it). The second half is what leaves a defector strictly out of pocket after it is credited with everything it keeps: a buyer that never resolves at <Math>{"-\\sum_i P_i"}</Math>, a seller that holds out at <Math>{"-G_i"}</Math> or below.
                    </p>
                    <FormalBlock label="Lemma 2 (A third path changes the game).">
                        <p>This lemma applies Theorem 2 of Figaro (2026), stated there for two parties, to the game of Lemma 1; the case split carries over unchanged, and the proof is not repeated. Call an <em>exit path</em> any operation other than resolution that moves part of a locked bond. Let the game of Lemma 1 be augmented with an exit path <Math>{"E"}</Math>. Then at least one of the following holds. (a) <Math>{"E"}</Math> is available on the decision of a party <Math>{"J"}</Math> outside the process. The refund of the bonds then turns on an agent that locks nothing and holds nothing the process moves, whose choices no payoff of the game orders. (b) <Math>{"E"}</Math> is available on the decision of the buyer or a seller, or on no decision at all. It then adds a third continuation at a node where Lemma 1 compared two, and Lemma 1 is not a result about the augmented game.</p>
                    </FormalBlock>
                    <p>
                        Lemma 2 says the equilibrium of Lemma 1 is not inherited by a game with an exit path. Definition 2(v) is therefore a security property: without it, Lemma 1 would describe a game the mechanism no longer plays. It is also the standard against which the machinery Section 6 refuses is measured.
                    </p>
                    <PaperRun title="Remedies precede resolution.">
                        A party&rsquo;s <em>standing position</em> is where it stands while the process stays open and it does not act. For a seller that cannot perform, it is its bond locked against a credit of what it retains, <Math>{"-2G_i + r_i"}</Math>. The move that ends that position is a remedy agreed with the buyer <em>before</em> resolution. The reason is that resolution is terminal. Once the buyer resolves, the mechanism holds nothing further to recover, so a buyer with a live complaint resolves after it is answered.
                    </PaperRun>
                    <PaperRun title="Forums do not resolve.">
                        Where the parties disagree about whether what arrived met what was agreed, an outside forum may rule on the open process. The forum is named in the composed terms, or is the one that would have heard the parties anyway. It reads the process&rsquo;s data, which is the parties&rsquo; own evidence: the agreement each order carries, by its fingerprint, and the attestations each party filed while the process stood open. The chain keeps only the hashes, and performance occurred off-chain. What a party brings the forum is therefore the content behind those fingerprints, which the forum checks against them. Its ruling feeds the parties&rsquo; negotiation; it cannot resolve, and nothing in the mechanism enforces it. By Lemma 2(a) that is why composing a forum leaves the equilibrium untouched: no party the bonds do not constrain sits on the path by which they are refunded.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Netting Completeness">
                <p>
                    The objection to a frozen schedule is plain: does commit not bind the parties to an allocation chosen before the world had finished happening? A shipment resold, a partial loss, a failure nobody is to blame for: each makes the signed allocation the wrong one. The answer is that the schedule fixes the arithmetic and not the allocation. The parties may move value between themselves while the process stands open, and those movements are unconstrained.
                </p>
                <PaperRun title="Positions and transfers.">
                    Index the <Math>{"m + 1"}</Math> distinct parties by <Math>{"j"}</Math>, and write <Math>{"x_j"}</Math> for party <Math>{"j"}</Math>&rsquo;s final net position in the denomination. It is what the schedule moves to or from it, plus what it has received from other parties, less what it has sent them. A <em>transfer</em> is a movement of value from one party of the process to another, made before resolution, out of the sender&rsquo;s own balance. A transfer is not an operation of the mechanism: it touches no bond, no accumulator, no order, and no term of any commitment.
                </PaperRun>
                <FormalBlock label="Proposition 1 (Netting completeness).">
                    <p>Let a process carry the committed schedule <Math>{"\\sigma"}</Math> of Definition 1 over <Math>{"m + 1"}</Math> distinct parties holding sufficient balances. The set of final net positions reachable by executing the schedule together with transfers among the parties before resolution is exactly</p>
                    <p><Math display>{"\\mathcal{X} \\;=\\; \\Bigl\\{\\, x \\in \\mathbb{R}^{\\,m+1} \\;:\\; \\textstyle\\sum_j x_j = 0 \\,\\Bigr\\},"}</Math></p>
                    <p>and every point of <Math>{"\\mathcal{X}"}</Math> is reached with at most <Math>{"m"}</Math> transfers.</p>
                    <p>The proposition rests on four premises. (1) The committed schedule sums to zero, <Math>{"\\sum \\sigma = 0"}</Math>: every locked unit leaves to one of the parties (Definition 1). (2) A transfer of <Math>{"t"}</Math> from <Math>{"j"}</Math> to <Math>{"k"}</Math> adds <Math>{"-t"}</Math> to the coordinate of <Math>{"j"}</Math> and <Math>{"+t"}</Math> to that of <Math>{"k"}</Math>, and moves nothing else (stipulated: the definition of a transfer). (3) A final net position is the schedule plus the net of the transfers, <Math>{"x = \\sigma + d"}</Math> (stipulated: the definition of <Math>{"x_j"}</Math>). (4) Each sender holds what it sends when the sequence reaches it (stipulated: balances held beyond the bonds, Section 4.1).</p>
                </FormalBlock>
                <Proof>
                    <em>Step 1 (necessity, from premises 1&ndash;3).</em> Each transfer preserves the sum of the coordinates by premise 2, and the schedule&rsquo;s sum is zero by premise 1, so by premise 3 every reachable position lies in <Math>{"\\mathcal{X}"}</Math>. <em>Step 2 (sufficiency, by pairing).</em> Fix <Math>{"x \\in \\mathcal{X}"}</Math> and let <Math>{"d = x - \\sigma"}</Math>, so <Math>{"\\sum_j d_j = 0"}</Math>. If <Math>{"d = 0"}</Math> the schedule alone reaches <Math>{"x"}</Math>. Otherwise <Math>{"D^- = \\{ j : d_j < 0 \\}"}</Math> and <Math>{"D^+ = \\{ j : d_j > 0 \\}"}</Math> are both non-empty; pick <Math>{"j \\in D^-"}</Math> and <Math>{"k \\in D^+"}</Math> and transfer <Math>{"\\min\\{-d_j,\\, d_k\\}"}</Math> from <Math>{"j"}</Math> to <Math>{"k"}</Math>. The step zeroes at least one coordinate and leaves the residual summing to zero, so it may be repeated. <em>Step 3 (counting).</em> The last coordinate is zeroed by the sum, so at most <Math>{"m"}</Math> transfers suffice for <Math>{"m + 1"}</Math> parties. <em>Step 4 (feasibility, from premise 4).</em> Each step is a transfer from a party that, by premise 4, holds what it sends when its turn comes, so the sequence executes. <em>Conclusion.</em> The final net positions reachable by executing the schedule with transfers among the parties are exactly <Math>{"\\mathcal{X}"}</Math>, and every point of it is reached with at most <Math>{"m"}</Math> transfers. <Math>{"\\square"}</Math>
                </Proof>
                <PaperRemark title="What would refute Proposition 1, and what it covers.">
                    The proposition is refuted by a final position reached from the schedule by transfers among the parties whose coordinates do not sum to zero, or by a point of <Math>{"\\mathcal{X}"}</Math> that needs more than <Math>{"m"}</Math> transfers. Its scope is the four limits of Section 4.1: one denomination, the parties of the process alone, balances actually held, and execution rather than agreement.
                </PaperRemark>
                <PaperRemark title="The schedule is an origin, not a constraint.">
                    The committed schedule is one point of <Math>{"\\mathcal{X}"}</Math>, and the parties may stand anywhere else in it. Only the sum is conserved, and it is conserved by arithmetic: value is not created inside a process. The reachable set is therefore not bounded by the committed total. A party may end further below zero than any payment in the process, funding the difference from its own balance. The question that raises is not reachability but credibility, which Proposition 3 answers on the sellers&rsquo; side.
                </PaperRemark>
                <FormalBlock label="Proposition 2 (Invariance of the frame).">
                    <p>Transfers among the parties leave the frame as they found it, in two senses.</p>
                    <p>(a) <em>Structural.</em> No transfer alters a bond, the accumulator, the set of orders in the process, the identity of any party, or any term of <Math>{"\\sigma"}</Math>. The deterrent that stood before the negotiation stands during and after it, unchanged in every magnitude.</p>
                    <p>(b) <em>Strategic.</em> Let <Math>{"T"}</Math> be the buyer&rsquo;s net position from transfers made and received. At a buyer node after performance, resolving yields <Math>{"T"}</Math> and never resolving yields <Math>{"-\\sum_i P_i + T"}</Math>. The gap is <Math>{"\\sum_i P_i"}</Math>, exactly the gap of Lemma 1(a), whatever the transfers were. The comparison is with never resolving; when the buyer resolves is fixed by its plan in Proposition 3(a).</p>
                    <p>The proposition rests on four premises, two for each part. (1) Only commit and resolve write a bond, the accumulator, the set of orders, a party&rsquo;s place, or a term of <Math>{"\\sigma"}</Math> (Definitions 1 and 2). (2) A transfer is neither commit nor resolve (stipulated: the definition of a transfer). (3) At a buyer node after performance, each of the buyer&rsquo;s two continuations is worth what Lemma 1(a) gives it plus what transfers have moved to or from the buyer (the payoff convention of Section 3.1). (4) A constant common to two branches does not change their comparison (arithmetic).</p>
                </FormalBlock>
                <Proof>
                    <em>Step 1 (structural, from premises 1 and 2).</em> A transfer is not an operation that writes any of those quantities, so every bond, the accumulator, the set of orders, every party&rsquo;s place, and every term of <Math>{"\\sigma"}</Math> stand as commit left them. <em>Step 2 (strategic, from premises 3 and 4).</em> The transfers already made add <Math>{"T"}</Math> to both continuations at the node, resolving at <Math>{"T"}</Math> and never resolving at <Math>{"-\\sum_i P_i + T"}</Math>; the constant drops out, and the branches differ by what the schedule moves, <Math>{"\\sum_i P_i"}</Math>, as in Lemma 1(a). <em>Conclusion.</em> Transfers among the parties leave the frame as they found it: no magnitude of the deterrent moves, and after performance resolving stays better for the buyer by <Math>{"\\sum_i P_i"}</Math>, whatever the transfers were. <Math>{"\\square"}</Math>
                </Proof>
                <PaperRemark title="What would refute Proposition 2, and what it covers.">
                    The proposition is refuted by a transfer among the parties that changes a locked amount, the accumulator, or a party&rsquo;s place, or by a buyer whose gap between resolving and never resolving after performance differs from <Math>{"\\sum_i P_i"}</Math> once transfers have been made. Its scope is the buyer node after performance, between parties beyond each other&rsquo;s coercive reach, and the comparison with never resolving; when the buyer resolves is its plan, which Proposition 3(a) takes as a premise.
                </PaperRemark>
                <p>
                    A referee might ask whether side payments distort the incentive to resolve: does a buyer paid something extra, or a seller that has paid something away, face a different decision at the terminal node? Proposition 2(b) says no. The comparison at that node is between two futures that share the whole past, transfers included. What transfers change is where the parties stand, never which branch the buyer prefers, so the parties may negotiate freely without endangering the close.
                </p>
                <FormalBlock label="Proposition 3 (The range the bonds make good, and the side it has).">
                    <p>An agreed reallocation must still be executed, and a party asked to send its part may refuse. What refusing leaves it holding differs between the two sides, because only one of them can resolve.</p>
                    <p>(a) <em>Sellers.</em> Take a transfer that answers performance the buyer has not received (here and below, a failure not yet remedied counts as performance not received), and the buyer&rsquo;s plan: resolve once the agreed transfers have executed, and not before. A seller cannot resolve, so under that plan refusing leaves its position standing at <Math>{"-2G_i + r_i"}</Math>. Given the plan, and given that the agreed reallocation closes the process with the seller giving up what it retains, seller <Math>{"S_i"}</Math> sends an agreed amount <Math>{"\\tau"}</Math> whenever <Math>{"P_i - \\tau > -2G_i + r_i"}</Math>, that is, for every</p>
                    <p><Math display>{"\\tau \\;<\\; P_i + 2G_i - r_i."}</Math></p>
                    <p>The bound is the payment closing brings plus the standing position closing ends, the bond less what the seller retains. It reaches the ceiling <Math>{"P_i + 2G_i"}</Math> for a seller that retains nothing, and the floor <Math>{"\\Delta_i = P_i + G_i \\geq 2P_i"}</Math> at maximal retention.</p>
                    <p>(b) <em>The buyer.</em> Once it holds what it contracted for, the buyer has no such bound. It may refuse <em>and resolve</em>, ending at <Math>{"0"}</Math>, which beats the <Math>{"-\\tau"}</Math> of sending and resolving for every <Math>{"\\tau > 0"}</Math>. The range the bonds make good for a buyer-outbound transfer (one sent by the buyer) at that node is empty. No arrangement of bonds could make it otherwise: the act that makes the schedule executable is the act that leaves the buyer&rsquo;s part unpriced.</p>
                    <p>(c) <em>Consequently</em> the reallocations the bonds make good are the seller-outbound ones (sent by a seller) answering performance not received, bounded seller by seller by (a). These are the transfers a remedy from a failing seller is made of. The bounds are the quantities of Lemma 1, not new ones: the bonds that made the first allocation credible make the second one credible, because they never moved.</p>
                    <p>The proposition rests on six premises. The first three come from the payoff convention and the definitions. (1) Every comparison is between certain amounts, a seller that holds out credited with what it retains, <Math>{"r_i \\leq G_i"}</Math> (the payoff convention of Section 3.1). (2) Resolution pays <Math>{"S_i"}</Math> its payment and refunds its bond, <Math>{"P_i + 2G_i"}</Math> against the <Math>{"2G_i"}</Math> it locked (Definition 1). (3) Only the buyer resolves, and nothing but resolution moves a locked bond (Definition 2(iv) and (v)).</p>
                    <p>The other three concern the plan and the reallocation: one is Lemma 1(c), one is stipulated, and one is Proposition 2(b). (4) The buyer resolves once the agreed transfers have executed, and not before, each transfer answering performance the buyer has not received. This is the plan of the equilibrium itself: until what it is still owed arrives, keeping the process open is the buyer&rsquo;s best reply, since resolving at once forecloses it (Lemma 1(c)). (5) The agreed reallocation closes the process, the seller giving up what it retains against the performance the buyer has not received (stipulated). (6) After performance, resolving is available to the buyer and strictly preferred, whatever has passed between the parties (Proposition 2(b)).</p>
                </FormalBlock>
                <Proof>
                    <em>Step 1 (the seller&rsquo;s two continuations, from premises 1, 2, 4, and 5).</em> The transfer answers what the buyer is still owed, so the plan waits on it. Sending and closing, the seller having given up what it retained, pays <Math>{"S_i"}</Math> its payment and refunds its bond, net <Math>{"+P_i - \\tau"}</Math>. Refusing leaves <Math>{"2G_i"}</Math> locked against a credit of at most <Math>{"r_i"}</Math>, and the plan never resolves over it. <em>Step 2 (the refusal stands, from premise 3).</em> No move of <Math>{"S_i"}</Math>&rsquo;s ends that position, since a seller cannot resolve and nothing else moves its bond, so refusing is worth <Math>{"-2G_i + r_i"}</Math>. <em>Step 3 (the bound).</em> Rearranging <Math>{"P_i - \\tau > -2G_i + r_i"}</Math> gives <Math>{"\\tau < P_i + 2G_i - r_i"}</Math>, and <Math>{"r_i \\leq G_i"}</Math> gives the floor <Math>{"P_i + G_i"}</Math>. <em>Step 4 (the buyer&rsquo;s two continuations, from premise 6).</em> After performance the buyer resolves whether or not it sends: sending and resolving is worth <Math>{"-\\tau"}</Math>, refusing and resolving <Math>{"0"}</Math>, and the second exceeds the first for every <Math>{"\\tau > 0"}</Math>. <em>Conclusion.</em> The reallocations the bonds make good are the seller-outbound ones answering performance not received, each seller executing its agreed part up to <Math>{"P_i + 2G_i - r_i"}</Math>, and the range the bonds make good for a buyer-outbound transfer after performance is empty. <Math>{"\\square"}</Math>
                </Proof>
                <PaperRemark title="What would refute Proposition 3, and what it covers.">
                    The proposition is refuted by a seller that, under the buyer&rsquo;s plan, refuses an agreed transfer below its bound and ends above <Math>{"P_i - \\tau"}</Math>: that requires a path to its bond other than the buyer&rsquo;s resolution, which Definition 2 excludes. Its one-sidedness is refuted by a schedule of bonds under which a buyer holding performance does better by sending than by refusing and resolving. Its scope is parties beyond each other&rsquo;s coercive reach, the buyer&rsquo;s plan, a reallocation that closes the process with the seller&rsquo;s retention given up, a transfer answering performance not received, and one denomination.
                </PaperRemark>
                <PaperRemark title="Against a performed seller, the plan has no support.">
                    Part (a) is restricted to transfers still owed because Lemma 1(c) gives the plan only there. A seller whose part is performed sends a transfer that answers nothing still owed, so a plan to wait for it departs from the equilibrium&rsquo;s plan, which resolves once performance has occurred. A profile in which that buyer waits and that seller sends rests on nothing but itself, and this paper claims nothing for it.
                </PaperRemark>
                <PaperRemark title="The seller's side carries Lemma 1's conditionality.">
                    The bound also assumes the seller believes the others will do their parts, as the seller&rsquo;s side of Lemma 1 does, and for the same reason: no schedule of bonds makes it attractive to pay into a process that will not close. A seller that does not believe it compares its standing position against itself and learns nothing. What the frame does supply is that no failed negotiation is banked. Nothing terminates but resolution, so a refused proposal leaves every party where it was, free to propose again.
                </PaperRemark>
                <PaperRemark title="Part (b) withholds a guarantee and restricts nothing.">
                    Part (b) restricts nothing a buyer <em>may</em> send; it withholds only the frame&rsquo;s guarantee that it will. What makes a buyer-outbound transfer good is what makes ordinary commerce good. The buyer sends because it wants the performance it is still buying, and the seller may withhold that performance.
                </PaperRemark>
                <PaperSubsection title="4.1 The bounds of the result">
                    <p>
                        Four limits belong with Proposition 1, and the fourth is the one the rest of the paper turns on.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><em>One denomination.</em> The netting is exact only in the process&rsquo;s single token. Parties may transfer value in anything they like, but a transfer in another unit nets against the schedule only at a rate somebody supplies. The frame supplies none: it compares magnitudes and does not convert them.</li>
                        <li><em>The parties only.</em> The coordinates of <Math>{"\\mathcal{X}"}</Math> are the parties of the process. A transfer to a non-party is a party&rsquo;s own disposal of what it ends up with, neither made good by the frame nor visible to it. A party that wants a non-party held to something must have it sign and bond, which is a decision taken before the signatures.</li>
                        <li><em>Balances actually held.</em> Reachability assumes each sender holds what it sends when the sequence reaches it. It asks more than commit does, since a locked bond cannot fund a transfer (Definition 2(v)), and the constructive proof needs fewer sending steps than there are parties.</li>
                        <li><em>The frame executes agreements and produces none.</em> Nothing above says which point of <Math>{"\\mathcal{X}"}</Math> the parties will choose, and the mechanism has no opinion. Whether a failing seller returns the whole payment or part of it, whether a damaged consignment is worth taking at a discount, is decided by the parties before resolution. Completeness is a statement about what can be executed, not about what will be agreed. The governing law&rsquo;s excuse doctrines (impossibility, frustration and hardship among them) enter through what the parties agree before resolution and what a forum rules on the open data. The frame takes no position on them: a forum&rsquo;s ruling may inform the reallocation and never resolves.</li>
                    </ol>
                    <PaperRun title="The familiar shape, and where it differs.">
                        Proposition 1 has the shape of the argument Coase (1960) made about rights: a fixed initial assignment plus unrestricted bargaining. There the bargaining reaches an efficient allocation whichever way the right was assigned. Here it reaches any allocation, and efficiency is the parties&rsquo; to judge. Three differences make it a mechanism result rather than a restatement.
                    </PaperRun>
                    <p>
                        First, the assignment is not a right conferred by an outside authority; it is arithmetic the parties signed, computed from the value accumulated at each commit. Second, bargaining is not assumed costless, and Section 7 shows that the choices of the designer (the party that composes a process&rsquo;s terms) move its cost. Third, execution is not assumed. The seller-outbound part of a bargain is carried out because the seller&rsquo;s bond stays locked while the negotiation runs, over the range Proposition 3(a) gives, given that the bargain closes the process. The bargaining half of the classical argument is thus supplied with a half the bonds make good, and it is the one that made the original exchange good.
                    </p>
                    <PaperRun title="Renegotiation as the normal life of the arrangement.">
                        The incomplete-contracting literature treats renegotiation as the characteristic event of a contract whose terms cannot cover every state. On that view a mechanism must be robust to renegotiation, since parties who can renegotiate will (Hart and Moore 1988). The frame here is built out of renegotiation. It writes down only what it can compute and leaves every substantive contingency to the parties, each held to the table by its own bond. Describing every state need not block optimal contracting when parties can foresee the distribution of their payoffs (Maskin and Tirole 1999). This frame does not rely on that foresight: the parties report nothing to the mechanism, and they decide the consequences afterwards.
                    </PaperRun>
                    <PaperRemark title="What the world calls a refund.">
                        Here a bond is <em>refunded</em> only in the sense Section 1 gives the word, at resolution. Nothing is reversed by that, since a bond always belongs to the party that locked it. The reversal of a payment, which commerce calls by the same word, has no path in this frame: no operation reverses a payment, and one that did would be an exit path in the sense of Lemma 2. What a party asks for when it asks for its tokens back is a transfer agreed and executed before resolution: a point of <Math>{"\\mathcal{X}"}</Math>, credible by Proposition 3(a) when it runs from a seller and answers performance not received. The substitute is more general, since the parties may agree the whole payment, part of it, or something else entirely.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The General Rule">
                <p>
                    The rule is: <em>every external event is squared between the parties before the buyer resolves</em>. To <em>square</em> an event has three components, and separating them is what makes the rule operable.
                </p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>Agree the reallocation.</strong> The parties decide which point of <Math>{"\\mathcal{X}"}</Math> they now want. This is discretionary and theirs, and no part of it happens inside the mechanism. A forum&rsquo;s ruling may inform it and a co-seller&rsquo;s bonded interest may press it; only the parties decide it.</li>
                    <li><strong>Execute the transfers.</strong> The parties move value between themselves, and the buyer resolves. Propositions 1 to 3 state when this step executes and which parts of it the bonds make good. A part the buyer sends once it holds performance is not among them (Proposition 3(b)).</li>
                    <li><strong>Attest what happened.</strong> Each party may sign an attestation (Section 1) about an order it is party to while the process stands open. To attest a variation the parties agreed, the agreement carries from signing a clause providing for one, and any designer may write such a clause. What the clause lets the parties attest has four parts: the event in the parties&rsquo; words; the fingerprint of the transferable instrument through which it happened (a bill of lading, a warehouse receipt, a contract of sale), when there is one; the transfers that net the schedule to the positions the parties agreed; and the fingerprint of the terms as revised. The instrument and the revised terms stay with the parties. Each party attests the variation against its own order. The process&rsquo;s data then holds the variation the parties agreed alongside the schedule: undertakings and attestations, never performance.</li>
                </ol>
                <PaperRun title="A verification proof is an attestation.">
                    A verification proof enters the process the way a variation does. A cryptographic proof that a computation ran, or a perceptual-hash match between what was delivered and what was agreed, is an attestation the buyer reads before resolving. It informs the buyer&rsquo;s decision and never resolves the process, because only the buyer resolves (Definition 2(iv)) and nothing but resolution moves a bond (Definition 2(v)).
                </PaperRun>
                <p>
                    Every event receives the same treatment, for the reason the definition of an external event gives in Section 1: an event cannot present itself to the frame at all. What it does is change which point of <Math>{"\\mathcal{X}"}</Math> the parties want, and <Math>{"\\mathcal{X}"}</Math> is the same set whatever changed it. The instances below are therefore organized by what an event <em>demands</em> of the parties, not by what it <em>is</em>.
                </p>
                <PaperRun title="A remedy transfer.">
                    Non-performance, partial loss, a delivery that arrived late or short: one party is out of pocket against what it agreed, and the reallocation moves value from the party at fault to the party that bore it. Where a seller cannot perform, the failing seller sends the buyer the payment it stands to receive and makes good whatever of the buyer&rsquo;s it holds. At resolution its bond is refunded and it is paid the payment it has already paid away, so it ends at zero. Its failure earns it nothing, and zero beats the standing position of at best <Math>{"-G_i"}</Math> by the whole value through its order. The buyer, made whole, resolves. Both halves of the transfer matter: a seller that sent the payment but kept what it held would end holding its retention, and the buyer would stay short by what it kept.
                </PaperRun>
                <PaperRun title="A full reallocation.">
                    Nobody is at fault and the commercial facts have changed: the goods are resold, a party takes over what another was to bear, the price the parties would now sign is not the one they signed. The reallocation may move any amount among any of them, and Proposition 1 places no ceiling on it. Section 6 works this case, because it is where the pull toward machinery is strongest: an assignable position, a substituted party, a resolution of one order alone.
                </PaperRun>
                <PaperRun title="A ruling that feeds the negotiation.">
                    The parties disagree in good faith about whether what arrived met what was agreed. Here the event is a disagreement, and what it demands is a judgment the parties cannot supply between them. A forum supplies it in the way Section 3.1 states, and its ruling changes what the parties expect from holding their positions. They then agree a point of <Math>{"\\mathcal{X}"}</Math> in its light. Where a party resists the ruling, enforcement runs through that party&rsquo;s exposure outside the process, as rulings ordinarily reach parties.
                </PaperRun>
                <PaperRun title="Nothing at all.">
                    The largest class is the easiest to overlook. Many things happen during a process that change nobody&rsquo;s mind about its resolution: a truck takes another route, a subcontractor is swapped, an exchange rate moves against a party that priced in the process&rsquo;s token anyway. A frame with an event taxonomy (a list of the events it recognizes) would have to decide whether each is an entry. This frame has nothing to notice, because the parties still want the resolution they signed.
                </PaperRun>
                <PaperRun title="The standing position: the boundary case.">
                    One case is not squared. A party may simply not act: a seller that neither performs, nor remedies, nor answers a ruling; a buyer that neither agrees a variation nor resolves. The position then stands: every bond locked, the accumulator where the commits left it, the data marking an undertaking never closed. Both sides of it are priced. A seller in it is at best at <Math>{"-G_i"}</Math>. A buyer in it is at <Math>{"-P_i"}</Math> on each order performed and <Math>{"-2P_i"}</Math> on each order not, so at <Math>{"-\\sum_i P_i"}</Math> or below. Its withheld payments sit inside its own bond, which only resolution moves. Nothing consumes either bond, and no elapsed time narrows either gap.
                </PaperRun>
                <p>
                    The way out stays open at every moment to the party whose conduct holds the position. A seller performs or makes the buyer whole, on the terms of Proposition 3(a); a buyer agrees the variation and resolves, on the terms of Proposition 2(b). A seller that has performed and still waits offers the variation that would make the buyer willing to close, attests its own account, and brings the disagreement to the forum the agreement names. Each co-seller that has performed meanwhile presses for the same resolution under the bonded interest of Section 2. The deterrent leaves a party that stands still out of pocket; it cannot stop a party from staying there, its own bond locked, and the frame advises neither side to give way.
                </p>
                <PaperRemark title="The rule asks the parties for nothing unfamiliar.">
                    Studies of how firms behave under contract find that they square things between themselves and reach for adjudication rarely. The businesses Macaulay (1963) interviewed adjusted by negotiation and regarded litigation as a last resort that damaged the relationship. The diamond traders Bernstein (1992) studied opted out of the legal system almost entirely. The ranchers Ellickson (1991) observed decided damage among themselves under norms that ignored the applicable law. The rule asks parties to do what they already do. It supplies the part they otherwise had to trust: the arrangement will not shift under them while they do it, and the value each stands to recover is held where the other cannot take it.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. Worked Instance: Cargo Resale in Transit">
                <p>
                    Take a shipper as buyer, moving a consignment under three orders, all in the process&rsquo;s single token. A hauler carries the inland leg at <Math>{"P_1 = 10"}</Math>, an ocean carrier the sea leg at <Math>{"P_2 = 30"}</Math>, and a warehouse at destination stores the cargo at <Math>{"P_3 = 5"}</Math>. The accumulator gives <Math>{"G_1 = 10"}</Math>, <Math>{"G_2 = 40"}</Math>, <Math>{"G_3 = 45"}</Math>, so the sellers bond <Math>{"20"}</Math>, <Math>{"80"}</Math>, and <Math>{"90"}</Math>, and the buyer <Math>{"2 \\times 45 = 90"}</Math> across its three orders. The committed schedule is <Math>{"\\sigma = (-45;\\, +10,\\, +30,\\, +5)"}</Math>.
                </p>
                <p>
                    Mid-voyage the shipper agrees to sell the consignment to a new owner. The sale is agreed under whatever instrument the trade uses for one: a contract of sale, an endorsement, a warehouse receipt. The instrument is outside the protocol; it names no order and moves no bond. Nor does it move the cargo&rsquo;s ownership yet. While the process stands committed the consignment is the shipper&rsquo;s, and the instrument sets ownership to pass at resolution; the bonds are tokens and reference no goods. The commercial question is the ordinary one: who ends up paying for the movement, and how.
                </p>
                <PaperRun title="What does not happen.">
                    The shipper&rsquo;s place in the process is not sold with the cargo, because no position is transferable (Definition 2(i)). The new owner does not step into the process, because a wallet that has not signed and bonded is not in it (Definition 2(ii)). The warehouse&rsquo;s order is not resolved alone so the remainder can be handled separately, because resolution takes the whole process or none (Definition 2(iii)). The sellers are not asked to agree to the sale, because the consignment is the shipper&rsquo;s to sell and the process&rsquo;s terms are not what is sold. Each of these refusals looks like a missing feature; each is the frame holding still while the world moves.
                </PaperRun>
                <PaperRun title="What happens instead.">
                    The shipper agrees to the sale. The sellers agree the variation it calls for, the transfers and the terms as revised, each attesting it against its own order. They make the sale possible by transferring the whole, or part, of their payment to the shipper, the cargo&rsquo;s original owner, before resolution: the whole where the shipper will receive none of the service, part where it has received part. The shipper then resolves. The schedule executes unchanged, every bond is refunded, and ownership passes to the new owner on the instrument&rsquo;s terms. What the new owner then does with its property is its own affair. It may engage the same carrier for the rest of the voyage, or another, under a process of its own; it owes the sellers of this one nothing, and they owe it nothing.
                </PaperRun>
                <p>
                    Take the sale agreed when the hauler has delivered the consignment to the port, the carrier is halfway across, and the warehouse has done nothing. An adjudicating mechanism reaches for machinery here: a novation (a new contract with a new party in place of the old), an assignment, a substitution of parties, a partial resolution. Here it is a reallocation, and Proposition 1 reaches it with transfers.
                </p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li>The shipper and the new owner agree the sale and its price. The frame is not party to that agreement and does not price it.</li>
                    <li>Before resolution, each seller transfers to the shipper the part of its payment that answers to what the shipper will not receive. The carrier sends <Math>{"15"}</Math>, half of its <Math>{"30"}</Math> for the half of the voyage not sailed, and the warehouse <Math>{"5"}</Math>, the whole of its payment. The hauler, whose leg is performed, transfers nothing. These are transfers in the sense of Section 4.</li>
                    <li>Each party attests the variation against its own order, under the clause its agreement carried from signing for one (Section 5).</li>
                    <li>The shipper resolves once. The schedule executes unchanged: the carrier receives <Math>{"80 + 30"}</Math>, the warehouse <Math>{"90 + 5"}</Math>, the hauler <Math>{"20 + 10"}</Math>, and the shipper <Math>{"45"}</Math>. Every bond is refunded to the party that locked it, and ownership of the consignment passes to the new owner at that resolution, as the instrument sets.</li>
                </ol>
                <p>
                    The netting is exact. The carrier&rsquo;s position inside the process is <Math>{"+30 - 15 = +15"}</Math>, the half of the voyage it sailed for the shipper; the warehouse&rsquo;s is <Math>{"+5 - 5 = 0"}</Math>. The hauler, whose leg was performed on the original terms, keeps its <Math>{"+10"}</Math>. The shipper stands at <Math>{"-45 + 20 = -25"}</Math>, the movement it bought before it sold. The final vector is <Math>{"(-25;\\, +10,\\, +15,\\, 0)"}</Math>: it sums to zero, and it was reached with two transfers, inside Proposition 1&rsquo;s bound of three for four parties.
                </p>
                <p>
                    Each transfer sits well inside its sender&rsquo;s bound from Proposition 3(a). The carrier sent <Math>{"15"}</Math> against a floor of <Math>{"\\Delta_2 = 70"}</Math>, and the warehouse sent <Math>{"5"}</Math> against <Math>{"\\Delta_3 = 50"}</Math>. Throughout, every bond stayed where commit put it. The carrier holding the shipper&rsquo;s cargo at sea sends its <Math>{"15"}</Math> because the <Math>{"80"}</Math> it bonded before there was any sale stays locked until the shipper resolves. The shipper&rsquo;s plan is to resolve once the transfers have arrived. The cargo goes on under the new owner&rsquo;s own arrangement, not to this warehouse.
                </p>
                <PaperRun title="What the process's data holds, and what it does not.">
                    The data holds the three commitments, the accumulator they built, the attested variation, and one atomic resolution. It holds the parties&rsquo; words for the sale and the fingerprint of the instrument under which it was agreed, never the sale or the instrument. The mechanism cannot read the instrument whose fingerprint the variation carries, nor verify that ownership passed under it. This is the boundary the whole design rests on: the passage of goods happens off-chain, and a change of ownership is such a passage. The sale stands on its own instrument, before whatever forum that instrument answers to. The process stands on its own data, and because the two meet only at a fingerprint, neither needed anything from the other.
                </PaperRun>
                <PaperRemark title="What the instance does not promise.">
                    The frame guarantees that the schedule executes on the buyer&rsquo;s resolution, not that a sale is available. The figures are chosen for legibility. If no sale is agreed, nothing is stuck: the schedule stands, the sellers perform, and the shipper resolves at the end of the movement, where the schedule put it.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Granularity Is a Design Variable of the Bargaining">
                <p>
                    Every negotiation in Sections 5 and 6 takes place among parties whose bonded interests were fixed before any of them knew there would be something to negotiate. The bond each seller stands in and the floor of what it will transfer rather than hold out are set by where its order sits in the accumulator. That is a choice made when the assembly was designed, not when the event occurred. The designer who divides an assembly into agreements, each signed as an order, is therefore laying down the bonded interests under which every later reallocation is reached.
                </p>
                <PaperRun title="Depth raises the floor; retention sets the bound.">
                    <Math>{"G_i"}</Math> is non-decreasing along the process, so of two orders carrying the same payment the later one has the higher floor <Math>{"\\Delta_i = P_i + G_i"}</Math> and the higher ceiling <Math>{"P_i + 2G_i"}</Math>. The bound itself, <Math>{"P_i + 2G_i - r_i"}</Math>, falls with what the seller retains. Each seller&rsquo;s actual bound exceeds its floor by whatever of the value through its order it does not hold, a service not yet rendered included (Figaro 2026, Definition 7). Depth and payment fix the floor and the ceiling from the accumulator alone; where the bound sits between them depends on retention, which the parties read from the work.
                </PaperRun>
                <p>
                    Take the process of Section 6, with no sale agreed, after the cargo has been discharged into the warehouse. The carrier has performed and retains nothing, so it owes no transfer of its own. Its <Math>{"30 + 80 = 110"}</Math> is its bonded interest in a co-seller&rsquo;s performance (Section 2): its reason to help cure the warehouse&rsquo;s part should it fail. Read from the accumulator alone, the warehouse&rsquo;s floor is <Math>{"\\Delta_3 = 50"}</Math>. That is below the carrier&rsquo;s <Math>{"\\Delta_2 = 70"}</Math>, although the warehouse is the deeper order, because its payment is smaller. A warehouse holding nothing would have the bound <Math>{"95"}</Math>, the ceiling <Math>{"P_3 + 2G_3"}</Math>.
                </p>
                <PaperRun title="Splitting an order changes the bonded total, not the bonded interest through it.">
                    Suppose a designer divides one agreement into two consecutive agreements, which the same party signs as two orders of <Math>{"a"}</Math> and <Math>{"b"}</Math> in place of one order of payment <Math>{"P_i"}</Math>, <Math>{"a + b = P_i"}</Math>. The bonds become <Math>{"2(G_{i-1} + a)"}</Math> and <Math>{"2(G_{i-1} + a + b) = 2G_i"}</Math>. The bonded interest through the later order is unchanged, since the schedule keys to the accumulator and not to the local payment. The party now bonds the sum of the two, and each half carries its own agreement, so a shock can be attested against the order it struck. Fine granularity buys explicitness and asks a larger total bond.
                </PaperRun>
                <PaperRun title="Every party is a party to the reallocation.">
                    The coordinates of Proposition 1 are the parties, so reaching a point of <Math>{"\\mathcal{X}"}</Math> needs the assent of everyone whose position moves. A coarse process concentrates the bargaining in few hands and closes quickly. Its price is that one seller absorbs internally, on its own books and outside any bond, what the frame would otherwise have made explicit. A fine process makes the structure visible and bonds each part, with more parties to convene. Neither is right in general, and the trade-off is the designer&rsquo;s. By Proposition 3, what the designer allocates is the sellers&rsquo; standing positions, which make their parts of a future reallocation executable.
                </PaperRun>
                <p>
                    Coordination that would traditionally be split across separate contracts composes inside one process: a haulage contract, a carriage contract, and a storage agreement, each with its own close, reconciled afterwards by somebody&rsquo;s accounts. The process the mechanism sees is linear: a sequence of commits extending one accumulator. Everything inside it shares one resolution and one set of reachable allocations. That is why the reallocation of Section 6 needed no reconciliation: the payments returned for the service the shipper no longer bought netted in the same resolution that paid for the service it had.
                </p>
                <PaperRemark title="Where the topology lives.">
                    The mechanism holds no ordering among a process&rsquo;s orders beyond the accumulator they extend; who stands before whom is a term the parties signed. An <em>assembly</em> is a designer&rsquo;s reusable design of a process: its agreements, in the sequence the parties will stand. How a process divides into orders is set by the assembly&rsquo;s list of agreements. The designer composes the assembly, the sellers bind it, and the buyer selects it. A granularity choice binds the parties in the only way anything binds them here: through the figures each signed and the bonds those figures fixed.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="8. Discretion as the Design">
                <p>
                    A mechanism that undertook to adjudicate events would need two things it cannot get cheaply. It would need an event taxonomy complete enough that a case arriving from the world is recognized as an instance of an entry. And it would need a <em>decision procedure per entry</em>: someone or something empowered to say, for each kind, what follows. The decision-science literature is specific about what the first costs, and Lemma 2 prices the second.
                </p>
                <PaperRun title="A taxonomy is a small world.">
                    Savage (1954) built his theory on a state space in which every relevant contingency is enumerated, and applied it to &ldquo;small worlds&rdquo;: simplified descriptions whose adequacy the theory itself cannot certify. The experimental evidence says the enumeration is inadequate in a way invisible from inside. Shown a fault tree with whole branches pruned, participants did not fully transfer the pruned probability to the residual &ldquo;all other causes&rdquo; category, so the omitted branches drew little weight anywhere (Fischhoff, Slovic, and Lichtenstein 1978). Support theory generalizes the finding: an implicit disjunction is judged less likely than the sum of its explicit components, so a catch-all is underweighted because its contents are unnamed (Tversky and Koehler 1994). A taxonomy is written by someone of bounded rationality, satisficing (accepting the first adequate list rather than seeking the best) over the cases it can bring to mind (Simon 1955). The class of events a mechanism has never listed is thus both the largest and the one its designers will judge smallest.
                </PaperRun>
                <PaperRun title="A judge per entry is a party the bonds do not constrain.">
                    The second cost is structural. A decision procedure seated inside the mechanism is a discretionary act added after the signatures, and whoever exercises it stands on the path by which bonds are refunded without having bonded anything: case (a) of Lemma 2, as Section 3.1 states. This is not an argument against adjudication; the parties may want a forum, and often should. It is an argument about where a forum sits, and Section 3.1 placed it beside the open process, off the path to the bonds. A forum that could move a bond would replace the comparisons of Lemma 1, and the results would have to be derived again for the arrangement that resulted.
                </PaperRun>
                <p>
                    The design taken here freezes the arithmetic at the signatures and keeps exactly one discretionary act after them, held by the buyer, the party the exchange is for. Its results hold for parties beyond each other&rsquo;s coercive reach. Every other substantive decision sits before the signatures or in the interval, where the parties negotiate under bonds that make their agreements executable. A decision-maker who cannot foresee the menu values flexibility itself (Kreps 1979), and this design keeps that flexibility with the parties. It is complete in the sense that matters in an open world: whatever happens, the reallocation the parties then want is reachable (Proposition 1), reaching it disturbs nothing (Proposition 2), and a failing seller&rsquo;s own bond makes its part worth executing within the bound of Proposition 3. Our hypothesis is that a mechanism that adjudicates absorbs the events it has heard of, while this one absorbs the events nobody listed.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

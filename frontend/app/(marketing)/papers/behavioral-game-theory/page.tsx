import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment — Figaro Protocol",
    description:
        "How the bonded commitment's equilibrium fares with loss-averse, boundedly reasoning participants: retention puts each comparison across the prospect-theoretic reference point, the Van Huyck coordination failure loses the finality it runs on, atomic resolution gives every seller a bonded interest in its peers, and the equilibrium is checked with one comparison per node and one step of reasoning about the counterparty.",
});

export default function BehavioralGameTheoryPaper() {
    return (
        <PaperLayout slug="behavioral-game-theory"
            title="Behavioral Game Theory of the Two-Mechanism Bonded Commitment"
            subtitle="Loss Aversion, Coordination, Peer Pressure, and Incentive Legibility"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        The bonded commitment puts each party in front of two certain amounts at every node where its act decides the outcome. After performance the buyer compares resolving, <Math>{"0"}</Math>, against never resolving, <Math>{"-P"}</Math>, with no assumption about the seller; that comparison anchors the equilibrium. The seller&rsquo;s choice to perform and the buyer&rsquo;s wait before performance are best replies to one profile, and they are checked jointly. We ask how this structure fares with the participants experimental economics describes: loss-averse, boundedly reasoning, pessimistic about strangers, and moved by motives no payoff counts.
                    </p>
                    <p>
                        Four claims follow. Because a defector is credited with what it retains, each comparison straddles the prospect-theoretic reference point, so loss aversion weights the defecting branch and does not cancel; a defector that books its retention and its bond apart feels the holdout 1.29 to 1.36 times more heavily across the meta-analytic interval for loss aversion. The condition behind the Van Huyck&ndash;Battalio&ndash;Beil coordination failure is present: once a co-seller holds out, holding out is strictly better for a seller that retains anything. The setting lacks the finality that failure runs on, so pessimism buys duration rather than a worse outcome. Atomic resolution gives every seller a bonded interest in every other seller&rsquo;s performance, largest for the seller that has already performed. And the equilibrium is checkable with one comparison per node and one step of reasoning about the counterparty, the depth the level-<Math>{"k"}</Math> literature finds participants reach. Each claim is a hypothesis: no play by independent participants has been observed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bolton, Gary E., and Axel Ockenfels. 2000. &ldquo;ERC: A Theory of Equity, Reciprocity, and Competition.&rdquo; <em>American Economic Review</em> 90 (1): 166&ndash;193. https://doi.org/10.1257/aer.90.1.166.</li>
                    <li>Brown, Alexander L., Taisuke Imai, Ferdinand M. Vieider, and Colin F. Camerer. 2024. &ldquo;Meta-analysis of Empirical Estimates of Loss Aversion.&rdquo; <em>Journal of Economic Literature</em> 62 (2): 485&ndash;516. https://doi.org/10.1257/jel.20221698.</li>
                    <li>Camerer, Colin F. 2003. <em>Behavioral Game Theory: Experiments in Strategic Interaction</em>. Princeton, NJ: Princeton University Press.</li>
                    <li>Cameron, Lisa A. 1999. &ldquo;Raising the Stakes in the Ultimatum Game: Experimental Evidence from Indonesia.&rdquo; <em>Economic Inquiry</em> 37 (1): 47&ndash;59. https://doi.org/10.1111/j.1465-7295.1999.tb01415.x.</li>
                    <li>Cialdini, Robert B., and Noah J. Goldstein. 2004. &ldquo;Social Influence: Compliance and Conformity.&rdquo; <em>Annual Review of Psychology</em> 55: 591&ndash;621. https://doi.org/10.1146/annurev.psych.55.090902.142015.</li>
                    <li>Costa-Gomes, Miguel, Vincent P. Crawford, and Bruno Broseta. 2001. &ldquo;Cognition and Behavior in Normal-Form Games: An Experimental Study.&rdquo; <em>Econometrica</em> 69 (5): 1193&ndash;1235. https://doi.org/10.1111/1468-0262.00239.</li>
                    <li>Fehr, Ernst, and Simon G&auml;chter. 2000. &ldquo;Cooperation and Punishment in Public Goods Experiments.&rdquo; <em>American Economic Review</em> 90 (4): 980&ndash;994. https://doi.org/10.1257/aer.90.4.980.</li>
                    <li>Fehr, Ernst, and Klaus M. Schmidt. 1999. &ldquo;A Theory of Fairness, Competition, and Cooperation.&rdquo; <em>Quarterly Journal of Economics</em> 114 (3): 817&ndash;868. https://doi.org/10.1162/003355399556151.</li>
                    <li>Figaro. 2026a. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Figaro. 2026b. &ldquo;A Verified Resolution Contract: Formal Verification, Threat Model, and the Scope of the Claim.&rdquo; Preprint. https://figaroprotocol.com/papers/verified-resolution-kernel/. Accessed October 18, 2026.</li>
                    <li>Ghatak, Maitreesh. 1999. &ldquo;Group Lending, Local Information and Peer Selection.&rdquo; <em>Journal of Development Economics</em> 60 (1): 27&ndash;50. https://doi.org/10.1016/S0304-3878(99)00035-8.</li>
                    <li>G&uuml;th, Werner, Rolf Schmittberger, and Bernd Schwarze. 1982. &ldquo;An Experimental Analysis of Ultimatum Bargaining.&rdquo; <em>Journal of Economic Behavior and Organization</em> 3 (4): 367&ndash;388. https://doi.org/10.1016/0167-2681(82)90011-7.</li>
                    <li>Hirshleifer, Jack. 1983. &ldquo;From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods.&rdquo; <em>Public Choice</em> 41 (3): 371&ndash;386. https://doi.org/10.1007/BF00141070.</li>
                    <li>Kahneman, Daniel, and Amos Tversky. 1979. &ldquo;Prospect Theory: An Analysis of Decision under Risk.&rdquo; <em>Econometrica</em> 47 (2): 263&ndash;291. https://doi.org/10.2307/1914185.</li>
                    <li>Morduch, Jonathan. 1999. &ldquo;The Role of Subsidies in Microfinance: Evidence from the Grameen Bank.&rdquo; <em>Journal of Development Economics</em> 60 (1): 229&ndash;248. https://doi.org/10.1016/S0304-3878(99)00042-5.</li>
                    <li>Rabin, Matthew. 1993. &ldquo;Incorporating Fairness into Game Theory and Economics.&rdquo; <em>American Economic Review</em> 83 (5): 1281&ndash;1302. https://www.jstor.org/stable/2117561.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Slonim, Robert, and Alvin E. Roth. 1998. &ldquo;Learning in High Stakes Ultimatum Games: An Experiment in the Slovak Republic.&rdquo; <em>Econometrica</em> 66 (3): 569&ndash;596. https://doi.org/10.2307/2998575.</li>
                    <li>Stahl, Dale O., and Paul W. Wilson. 1995. &ldquo;On Players&rsquo; Models of Other Players: Theory and Experimental Evidence.&rdquo; <em>Games and Economic Behavior</em> 10 (1): 218&ndash;254. https://doi.org/10.1006/game.1995.1031.</li>
                    <li>Stiglitz, Joseph E. 1990. &ldquo;Peer Monitoring and Credit Markets.&rdquo; <em>World Bank Economic Review</em> 4 (3): 351&ndash;366. https://doi.org/10.1093/wber/4.3.351.</li>
                    <li>Sugden, Robert. 1995. &ldquo;A Theory of Focal Points.&rdquo; <em>Economic Journal</em> 105 (430): 533&ndash;550. https://doi.org/10.2307/2235016.</li>
                    <li>Thaler, Richard. 1985. &ldquo;Mental Accounting and Consumer Choice.&rdquo; <em>Marketing Science</em> 4 (3): 199&ndash;214. https://doi.org/10.1287/mksc.4.3.199.</li>
                    <li>Tversky, Amos, and Daniel Kahneman. 1992. &ldquo;Advances in Prospect Theory: Cumulative Representation of Uncertainty.&rdquo; <em>Journal of Risk and Uncertainty</em> 5 (4): 297&ndash;323. https://doi.org/10.1007/BF00122574.</li>
                    <li>Van Huyck, John B., Raymond C. Battalio, and Richard O. Beil. 1990. &ldquo;Tacit Coordination Games, Strategic Uncertainty, and Coordination Failure.&rdquo; <em>American Economic Review</em> 80 (1): 234&ndash;248. https://www.jstor.org/stable/2006745.</li>
                    <li>Yunus, Muhammad, with Alan Jolis. 1999. <em>Banker to the Poor: Micro-Lending and the Battle against World Poverty</em>. New York: PublicAffairs.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider a buyer and three sellers who have never met. The sellers&rsquo; payments are 6, 3, and 1, committed in that order, so the value accumulated through their orders is 6, 9, and 10. The buyer bonds twice each payment, 20 in all. Each seller bonds twice the value accumulated through its own order, so the third seller locks 20 against a payment of 1. Nobody is paid until the buyer resolves, and resolution pays all three sellers and refunds every bond at once.
                </p>
                <p>
                    Mechanism design predicts that every party here performs its part, because at each node its cooperative branch is strictly better given the other party&rsquo;s plan. Behavioral game theory (Camerer 2003) asks whether a prediction of that kind survives the participants found in the laboratory. Four decades of experiments document loss aversion (Kahneman and Tversky 1979; Tversky and Kahneman 1992), mental accounting (Thaler 1985), fairness preferences (Fehr and Schmidt 1999; Bolton and Ockenfels 2000), bounded depth of reasoning (Stahl and Wilson 1995; Costa-Gomes, Crawford, and Broseta 2001), and coordination failure under pessimism about co-players (Van Huyck, Battalio, and Beil 1990). A mechanism is robust to these departures only if they leave its equilibrium comparisons pointing the same way.
                </p>
                <p>
                    The answer turns on the shape of the equilibrium, which Section 2 states in full. One comparison, the buyer&rsquo;s after performance, holds with no assumption about anyone. The other two, the seller&rsquo;s and the buyer&rsquo;s before performance, are each party&rsquo;s best reply to one profile and hold together. Every term in every comparison is a payment or a bond. Effort, inputs, and time are each party&rsquo;s own outlay, made on its own account, and Section 6 turns that into an argument about cognitive load.
                </p>
                <PaperRun title="Organization.">
                    Section 2 states the mechanism, its payoffs, and its equilibrium. Section 3 reads each node through prospect theory and mental accounting. Section 4 concedes the condition behind the Van Huyck coordination failure and answers it on other ground. Section 5 derives the coordination pressure atomic resolution creates among sellers and asks whether participants feel it. Section 6 defines incentive legibility and argues the mechanism has it. Section 7 concludes.
                </PaperRun>
                <PaperRun title="The claims are hypotheses.">
                    Every claim below is a prediction. The mechanism is built, its equilibrium is proved (Figaro 2026a), and the equilibrium&rsquo;s inequalities are checked in a proof assistant (Figaro 2026b), but no play by independent participants has been observed, and the bonded game has no laboratory replication. The arguments transfer findings from adjacent games &mdash; minimum-effort coordination, public-goods punishment, prospect-theoretic valuation of mixed outcomes &mdash; to a payoff structure that differs from each in the respect the argument turns on. A reader should hold them as hypotheses with stated structural grounds and an obvious experimental program.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Mechanism, Its Payoffs, and Its Equilibrium">
                <p>
                    The mechanism has two calls, commit and resolve, and each carries a mechanism design of its own: asymmetric bonding at commit, and buyer dominance with atomic resolution at resolve. The two compose, and neither substitutes for the other. This section states what the behavioral analysis uses.
                </p>
                <PaperRun title="Order, process, link.">
                    An order is one seller&rsquo;s commitment to one buyer at one payment, signed by both. A process is a sequence of orders under one buyer and one denomination, extended one commit at a time and resolved together. Its first order is the root, and seller <Math>{"S_i"}</Math>&rsquo;s position in the sequence is its link. A process holds as many orders as the network can resolve in one call. The terms of each order, its agreement, enter the chain only as a fingerprint the commitment carries: the chain never holds the terms and never tests performance.
                </PaperRun>
                <PaperRun title="Commit: asymmetric bonding.">
                    For an order with payment <Math>{"P_i > 0"}</Math>, the buyer bonds <Math>{"2P_i"}</Math> and the seller bonds <Math>{"2G_i"}</Math>. Here <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> is the value the process has accumulated through that seller&rsquo;s link, its own payment included, so <Math>{"G_i \\geq P_i"}</Math> with equality only at the root. The base is arithmetic, not a report: commit admits exactly one value, the standing total plus the new payment, and refuses any other. The doubling answers retention. Value passes off-chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026a, Definition 7).
                </PaperRun>
                <PaperRun title="Resolve: buyer dominance with atomic resolution.">
                    Only the buyer resolves, and resolution takes every order in the process at once or none: it pays every seller and refunds every bond together. Resolution is the only terminal event. A resolved process cannot be reopened, and an unresolved one stays open with no clock running against it. A buyer that loses its key, with no recovery arrangement installed on its wallet before it commits, strands every bond in its process. The arrangement is the wallet&rsquo;s, never the Core&rsquo;s, and it reaches a resolution called on the direct path, not one signed for the batch path. Resolution is the buyer&rsquo;s acceptance and its own judgment; the mechanism holds no test of performance and admits no report of delivery.
                </PaperRun>
                <PaperRun title="What a payoff contains.">
                    A payoff has two parts. The first is what the mechanism moves: the bond taken at commit and the payout made at resolution. The second is a credit for the off-chain value the party holds, at the figure the parties signed. The credit is never a debit: a party is counted for what is in its hands and never charged for what is not. Off the cooperative path it credits a defecting seller with its <em>retention</em> <Math>{"r_i"}</Math>, what it keeps by holding out, which is at most <Math>{"G_i"}</Math> and often less. Every deterrence claim below is net of retention.
                </PaperRun>
                <p>
                    At a single order the mechanism produces four outcomes.
                </p>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left text-ink-muted font-normal"><Math>{"(u_b, u_s)"}</Math></th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">resolution occurs</th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">no resolution</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">performance occurs</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(0,\\; +P)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; -2G)"}</Math></td>
                            </tr>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">no performance</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; \\leq P + G)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; \\leq -G)"}</Math></td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="text-xs text-ink-muted mt-2">The four outcomes at one order, each the pair <Math>{"(u_b, u_s)"}</Math>: the position in the mechanism plus the signed value of what each party holds. Rows say whether the seller ever performs and columns whether the buyer ever resolves; every plan either party may adopt ends in one of the four, so this is a table of outcomes and not a strategic form. The seller&rsquo;s entries are bounds because its retention is at most <Math>{"G"}</Math>. The right-hand column holds open positions, which persist because no clock runs from the bonded state.</p>
                </PaperScroll>
                <PaperRun title="The equilibrium is an anchor and a fixed point.">
                    The equilibrium has three comparisons and one structure. <strong>(a)</strong> After performance the buyer compares resolving, <Math>{"0"}</Math>, against never resolving, <Math>{"-P"}</Math>. It holds the delivery either way, and the withheld payment stays frozen in its own bond, so resolving is strictly better with no assumption about the seller. <strong>(b)</strong> Given (a) and the buyer&rsquo;s plan &mdash; resolve once performance has occurred and not before &mdash; the seller compares performing, <Math>{"+P"}</Math>, against never performing, <Math>{"-2G + r \\leq -G"}</Math>, and performs by a margin of at least <Math>{"P + G"}</Math>. The two premises fix one branch each: (a) fixes performing at <Math>{"+P"}</Math>, and the plan&rsquo;s &ldquo;not before&rdquo; fixes holding out at its bound, since a buyer that resolved against non-performance would hand the seller up to <Math>{"P + G"}</Math>. <strong>(c)</strong> Given (b), before performance the buyer compares keeping the process open, worth <Math>{"0"}</Math> once the seller performs, against resolving at once, a terminal <Math>{"-P"}</Math>, and waits.
                </PaperRun>
                <p>
                    (b) and (c) are the two parties&rsquo; best-response checks against one profile, the buyer&rsquo;s plan and the seller&rsquo;s performance, and they hold jointly. The profile is therefore a fixed point, which is what an equilibrium is, and (a) is its one unconditional anchor. Each comparison is made at the node where the choice falls, so the profile is subgame-perfect: a buyer plan threatening never to resolve fails (a) after any performance. A second equilibrium exists, in which the seller never performs and the buyer resolves regardless, at <Math>{"(-P,\\; \\leq P + G)"}</Math>. It is sustained only by a buyer that has given up the instrument the mechanism reserves to it, and that buyer&rsquo;s loss is bounded by the payment it agreed to.
                </p>
                <PaperRun title="Many sellers.">
                    With <Math>{"n"}</Math> sellers under one buyer the comparisons recur at every link, and the buyer&rsquo;s plan becomes: resolve once every seller has performed. Provided the co-sellers perform, seller <Math>{"S_i"}</Math>&rsquo;s gap between performing and holding out at full retention is <Math>{"\\Delta_i = P_i + G_i \\geq 2P_i"}</Math>, equal at the root and growing with every payment accumulated ahead of it. Where some co-seller does not perform, holding out beats performing for a seller that retains anything and ties with it for one that retains nothing, and Section 4 takes that case up.
                </PaperRun>
                <PaperRun title="The externality falls hardest on the seller that has performed.">
                    Atomic resolution couples the sellers. Under the buyer&rsquo;s plan, a seller <Math>{"S_k"}</Math> that holds out costs a co-seller <Math>{"S_i"}</Math> (<Math>{"i \\neq k"}</Math>) that has already performed <Math>{"\\varepsilon_{k \\to i} = P_i + 2G_i"}</Math>: it has parted with the product and stands in its whole bond. A co-seller that has not yet performed loses at least <Math>{"P_i + G_i"}</Math>, because it still holds what it can retain. Either way the loss is positive, and it is largest for the seller that has already done its part. A payoff in which every party&rsquo;s outcome is governed by the least performance in the group is a weakest-link structure (Hirshleifer 1983).
                </PaperRun>
                <PaperRun title="Remedy comes before resolution.">
                    A seller that cannot perform faces an external event the parties handle between themselves before any resolution. The transfer is simple: the failing seller sends the buyer the payment it stands to receive and makes good whatever of the buyer&rsquo;s it holds. At resolution it is refunded its bond and paid the payment it has already passed on, so it ends at zero and the buyer is made whole. Where the parties disagree, an outside forum may rule on the open process&rsquo;s data and on what the parties bring it, and its ruling feeds their negotiation. A forum cannot resolve, so it has no direct enforcement. Resolution is terminal acceptance, with no recourse inside the mechanism afterwards.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Prospect Theory at the Two Nodes">
                <p>
                    Prospect theory (Kahneman and Tversky 1979; Tversky and Kahneman 1992) values outcomes as gains and losses from a reference point, with a value function steeper for losses than for gains. A gain <Math>{"x > 0"}</Math> is felt as <Math>{"x^{\\alpha}"}</Math> and a loss of the same size as <Math>{"-\\lambda x^{\\alpha}"}</Math>, where <Math>{"\\lambda"}</Math> is the loss-aversion ratio and <Math>{"\\alpha"}</Math> the curvature. Tversky and Kahneman (1992) estimate <Math>{"\\lambda = 2.25"}</Math> and <Math>{"\\alpha = 0.88"}</Math>. A meta-analysis of 607 estimates puts the mean of <Math>{"\\lambda"}</Math> at 1.955, with a 95% interval of 1.82 to 2.10 (Brown et al. 2024). We take the reference point to be pre-commitment wealth, the point the payoffs of Section 2 measure from.
                </p>
                <p>
                    The direction of every comparison holds under any strictly monotone transformation of the payoffs, loss-averse ones included. What prospect theory changes is the felt margin, and retention decides how. A defector is credited with what it keeps, so its position is mixed: a locked bond below the reference point, a retained value above it. The cooperative branch is a clean gain for the seller and a clean break-even for the buyer, so the two nodes are worked separately.
                </p>
                <PaperRun title="The buyer compares a break-even against a loss.">
                    After performance the buyer&rsquo;s branches are <Math>{"0"}</Math> for resolving and <Math>{"-P"}</Math> for never resolving. The first sits at the reference point and the second below it, so the felt comparison is <Math>{"v(0) = 0"}</Math> against <Math>{"v(-P) = -\\lambda P^{\\alpha}"}</Math>: loss aversion multiplies the whole gap. Retention accounting is what puts it there. Read with the delivery uncounted, the node compares <Math>{"-P"}</Math> against <Math>{"-2P"}</Math>, both in the loss domain, where <Math>{"\\lambda"}</Math> scales both branches alike and leaves their ratio at <Math>{"2^{\\alpha} \\approx 1.84"}</Math>. Crediting the buyer with what it holds makes loss aversion load-bearing at this node.
                </PaperRun>
                <PaperRun title="The seller compares a gain against a loss.">
                    Where the co-sellers perform, the seller&rsquo;s branches are <Math>{"+P_i"}</Math> for performing and at most <Math>{"-G_i"}</Math> for holding out. Loss aversion weights the holding-out branch alone, and the felt gap is at least <Math>{"P_i^{\\alpha} + \\lambda G_i^{\\alpha}"}</Math>. No cancellation arises, because cancellation needs both branches on one side of the reference point. An analysis that finds cancellation at the buyer&rsquo;s uncounted node and extends it to every participant gets the seller wrong.
                </PaperRun>
                <PaperRun title="Separate accounts make retention feel smaller.">
                    The holdout branch is a mixed position. Prospect theory&rsquo;s editing phase (the preliminary stage in which a decision-maker codes outcomes as gains or losses and may combine or segregate them before evaluating them) leaves open whether a participant evaluates the net or its parts. Mental accounting (Thaler 1985) makes the question live, because the parts sit in different places: the retained product in the defector&rsquo;s hands, the locked bond on chain. At full retention two readings bracket the felt position. Integrated, the seller feels the net, <Math>{"v(-G_i) = -\\lambda G_i^{\\alpha}"}</Math>. Segregated, it books a gain of <Math>{"G_i"}</Math> against a loss of <Math>{"2G_i"}</Math>, felt as <Math>{"G_i^{\\alpha} - \\lambda 2^{\\alpha} G_i^{\\alpha} = (1 - \\lambda 2^{\\alpha}) G_i^{\\alpha}"}</Math>.
                </PaperRun>
                <p>
                    At the Tversky&ndash;Kahneman estimates the integrated reading gives <Math>{"-2.25\\,G_i^{\\alpha}"}</Math> and the segregated one <Math>{"-3.14\\,G_i^{\\alpha}"}</Math>, so segregation makes the holdout about 1.40 times heavier. The factor is <Math>{"2^{\\alpha} - 1/\\lambda"}</Math>. Holding <Math>{"\\alpha"}</Math> at 0.88, it runs from 1.29 to 1.36 across the meta-analytic interval and is 1.33 at its mean. The direction is the point: segregation credits retention at gain-domain weight and charges the bond at loss-domain weight. The more cleanly a defector keeps its accounts, the less its retention is felt to pay, which is the behavioral face of a doubling that exists because a defector keeps what is in its hands.
                </p>
                <p>
                    At the buyer&rsquo;s node the same editing narrows the margin a little. Segregated, the withholding branch is a delivery worth <Math>{"P"}</Math> against <Math>{"2P"}</Math> locked, felt as <Math>{"(1 - \\lambda 2^{\\alpha})P^{\\alpha}"}</Math>. The resolving branch is mixed too, a payment made against a delivery received, felt as <Math>{"(1 - \\lambda)P^{\\alpha}"}</Math>. The gap is <Math>{"\\lambda(2^{\\alpha} - 1)P^{\\alpha}"}</Math> against <Math>{"\\lambda P^{\\alpha}"}</Math> integrated: narrower by the factor <Math>{"2^{\\alpha} - 1 \\approx 0.84"}</Math>, about a sixth, and positive for every <Math>{"\\lambda > 0"}</Math>. Segregation widens the seller&rsquo;s margin and narrows the buyer&rsquo;s, and reverses neither.
                </p>
                <PaperRun title="No live node is flat.">
                    A node where both branches are worth the same lets spite, fatigue, or indifference decide for free. Retention accounting leaves no such node at a live decision. A seller with the process live compares <Math>{"+P_i"}</Math> against <Math>{"-2G_i + r_i"}</Math>, and the buyer&rsquo;s branches differ strictly at each of its nodes. The one flat node is exact. On a process that has already failed, a seller compares performing, <Math>{"-2G_i"}</Math>, against holding out, <Math>{"-2G_i + r_i"}</Math>, and is indifferent only when it retains nothing, as with a service not yet rendered. That same seller, at its live decision, faces the widest comparison of anyone: <Math>{"+P_i"}</Math> against a locked <Math>{"2G_i"}</Math> with no credit against it.
                </PaperRun>
                <PaperRun title="Non-pecuniary preferences have a price.">
                    The equilibrium prices payoffs only, and the experiments document preferences no payoff counts: fairness (Fehr and Schmidt 1999; Bolton and Ockenfels 2000), reciprocity (Rabin 1993), spite, and intrinsic motivation. Three observations bound them. First, inequity aversion bites at entry. The schedule is symmetric at the root, where <Math>{"G = P"}</Math> and both parties bond <Math>{"2P"}</Math>, and below it the seller&rsquo;s bond exceeds the buyer&rsquo;s; a participant averse to that asymmetry declines to commit, so the correction shows as slower process formation rather than a different equilibrium of play.
                </PaperRun>
                <p>
                    Second, spite costs something at the node where it would do damage. A seller that holds out to punish a buyer, with its co-sellers ready, forgoes at least <Math>{"P_i + G_i"}</Math>, in the loss domain where weighting is steepest. The ultimatum game shows that such a price is sometimes paid: responders forfeit their share to punish an offer they read as unfair (G&uuml;th, Schmittberger, and Schwarze 1982; Camerer 2003). Two features bear on how often. Ultimatum rejections fall as stakes rise (Slonim and Roth 1998; Cameron 1999), and this price is never a small fraction of the stake. And it buys no ending: the punished buyer holds an open position, so the spiteful seller pays for as long as it holds out and stops paying the moment it performs. Third, intrinsic motivation to deliver the agreed work runs with the schedule, so the two add.
                </p>
            </PaperSection>

            <PaperSection title="4. Pessimistic Beliefs and the Van Huyck Concern">
                <p>
                    Van Huyck, Battalio, and Beil (1990) found that large groups playing minimum-effort games converge to the worst equilibrium through pessimism about co-players. The mechanism induces a weakest-link structure among sellers, so the finding challenges the multi-party prediction directly. The structure is present here, and this section begins by conceding the condition the finding needs.
                </p>
                <PaperRun title="The experimental result and the condition it needs.">
                    In the Van Huyck&ndash;Battalio&ndash;Beil design each of 14 to 16 players chooses an effort level from <Math>{"\\{1, \\ldots, 7\\}"}</Math>; a player&rsquo;s payoff rises with the group minimum and falls with its own effort. Every common effort level is a Nash equilibrium, and the equilibria are Pareto-ranked, with 7 best for everyone. The condition that makes failure possible is that high effort is not dominant: a player who chooses 7 against a co-player who chooses 1 pays a private cost for no joint benefit, so pessimism about others rationalizes choosing low. The result is dynamic. The game is played in rounds, the minimum is announced after each, and it ratchets downward as players update on what they have just seen; by the tenth round the minimum stood at the floor in all seven large-group sessions, while fixed pairs reached the efficient level in twelve of fourteen.
                </PaperRun>
                <PaperRun title="The condition is present, and we concede it.">
                    A seller in a process where a co-seller has held out compares performing, <Math>{"-2G_i"}</Math> &mdash; product passed on, bond locked, nothing paid &mdash; against holding out, <Math>{"-2G_i + r_i"}</Math>. Holding out is strictly better for a seller that retains anything, and equal to performing when it retains nothing. No bond schedule changes this, because nothing makes it attractive to hand goods into a process that will not close. The sellers&rsquo; side has no dominance solution, and a claim that bonding forecloses the pessimistic-belief channel would be false. Three features of the setting answer the concern instead.
                </PaperRun>
                <PaperRun title="First: nothing is banked, so belief-updating has no history.">
                    The Van Huyck convergence is produced by realization. Each round ends, the minimum is computed, payoffs are paid, and the realized profile becomes the datum from which the next belief is formed; low play confirms low play, and the ratchet runs one way. The bonded process has no round. Resolution is the only terminal event and the buyer&rsquo;s acceptance, and short of it nothing computes, nothing pays, and nothing enters a history. A standoff is a position held, not an outcome taken. A cascade of holdouts is therefore a function of the current state, and it reverses once the blocked seller stands ready to perform: each remaining seller&rsquo;s comparison returns to <Math>{"+P_i"}</Math> against at most <Math>{"-G_i"}</Math>. What the setting removes is not the coordination problem but the finality that makes coordination failure terminal in the experiments.
                </PaperRun>
                <PaperRun title="Second: each seller&rsquo;s exposure is a figure, not a belief.">
                    A Van Huyck player&rsquo;s reason to choose high effort turns on an unobservable, what fifteen strangers will do, estimated from priors and announced history. Pessimism is a distribution over that unobservable. Here the quantity governing a seller&rsquo;s stake is of a different kind: its exposure to a peer&rsquo;s fault is computed from the signed accumulator, exactly <Math>{"P_i + 2G_i"}</Math> once it has performed and at least <Math>{"P_i + G_i"}</Math> before. Pessimism can attach to whether the others will perform; it cannot attach to what a failure would cost.
                </PaperRun>
                <p>
                    One scope line belongs here. The accumulator shows the stake, not which seller failed, because performance happens off-chain. What the chain can hold about fault is what each party attests for itself while the process is open: an attestation is a party&rsquo;s own signed statement about an order, entered on chain as a content hash. It is that party&rsquo;s word and never a test of performance, so identifying the seller that did not deliver remains knowledge the parties hold.
                </p>
                <PaperRun title="Third: every party in a standoff strictly prefers the close.">
                    The Van Huyck floor is a rest point. Nobody in the all-low profile gains by moving alone, so pessimism, once fallen into, is comfortable to hold. The bonded standoff is a set of open positions, and each holder strictly prefers the cooperative close: the buyer stands at <Math>{"-2P"}</Math> on each order not yet performed and <Math>{"-P"}</Math> on each performed one, against the <Math>{"0"}</Math> closing would give it on both, and each seller at most at <Math>{"-G_i"}</Math> against <Math>{"+P_i"}</Math>. Pessimism here is a position every party pays to maintain, with no clock ending the payment. The laboratory games cannot exhibit that object, because their pessimism is discharged at the end of each round.
                </PaperRun>
                <PaperRun title="Pessimism in a long process buys duration.">
                    One channel from the experiments does transfer. Coordination fails in large groups and succeeds in pairs because the chance that someone plays low rises with the number of players, and the chance that some seller in a long process holds out rises the same way. The consequence differs. Each seller&rsquo;s own quantities are fixed by its own commitment and do not move with <Math>{"n"}</Math>: its gap is <Math>{"P_i + G_i"}</Math> and its exposure <Math>{"P_i + 2G_i"}</Math> whatever the process&rsquo;s length. What grows with <Math>{"n"}</Math> is the number of parties the proviso ranges over. Pessimism in a long process therefore buys a process that stays open longer, not a worse resolution, since no resolution exists short of the buyer&rsquo;s acceptance.
                </PaperRun>
                <PaperRun title="Scope of the claim.">
                    The argument is structural and its conclusion narrow: the negative finding does not transfer, because the finality it runs on is absent. It establishes no positive finding. The failure that survives is persistence, a process open a long time with each party holding a position it would rather close, and we do not predict how long. What answers persistence is a standing exposure that does not decay, together with a route out open to every party at every moment: perform, or make the buyer whole before resolution.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Atomic Resolution as Peer Pressure">
                <p>
                    The externality of Section 2 is economic: it acts on each seller&rsquo;s own bonded position. The behavioral question is whether participants also feel it as peer pressure. We argue they should, and then bound what that licenses.
                </p>
                <PaperRun title="Coordination pressure needs no social substrate.">
                    Joint-liability microfinance obtains peer pressure from joint-liability contracting plus a social substrate: repeated interaction, local information among borrowers, and a sanction exogenous to the contract (Ghatak 1999; Stiglitz 1990). The bonded mechanism produces the coordination-pressure component of that equilibrium with neither the contracting nor any of the substrate&rsquo;s three elements, for four reasons. Universal performance is an equilibrium within a single process, from the payoffs alone, with no continuation value and no repetition. The externality <Math>{"\\varepsilon_{k \\to i}"}</Math>, or its floor <Math>{"P_i + G_i"}</Math>, is computed from the accumulator, so its existence and size need no seller&rsquo;s information about another. What a co-seller stands to lose is its own locked position, held by non-resolution and imposed by no one. And each bond is posted against its own seller&rsquo;s accumulated value, so the coupling comes from atomic resolution and not from any shared obligation in the schedule. Two other microfinance results, peer selection on private types and peer monitoring under information asymmetry, need structure above the bonded commitment and are not reproduced here.
                </PaperRun>
                <PaperRun title="The stake is large where the pressure is felt.">
                    Fehr and G&auml;chter (2000) find that participants in public-goods games pay to punish free-riders when punishing returns them nothing, and punish more the further a free-rider&rsquo;s contribution falls below the group&rsquo;s. The channel activates with no expected-value rationale at all. The bonded setting supplies one as well. In the opening example the third seller, once it has performed, carries 21 from any co-seller&rsquo;s fault against its payment of 1, and before performing it carries at least 11. The channel should be expected to activate at such stakes; how intensely, we do not predict.
                </PaperRun>
                <PaperRun title="The seller that has done its part has the strongest reason to press.">
                    Section 2&rsquo;s externality is largest for the seller that has already performed, so the participant that has behaved exactly as the mechanism intends has the strongest reason to press for a cure. Whether co-sellers press, wait, substitute, or arrange a remedy privately is conduct this paper does not model. What the structure supplies is a bonded, computable interest in the same outcome, which makes any of those responses rational rather than altruistic.
                </PaperRun>
                <PaperRun title="The joint-liability comparison, and the number we do not carry.">
                    The repayment figure usually quoted for the Grameen model comes from the lender&rsquo;s own reporting (Yunus 1999). Morduch (1999) re-examines the lender&rsquo;s accounts and contests that figure on accounting grounds, so we carry no number into the argument. Three margins set the comparison, and the third runs against the mechanism.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><em>The stake scales with the link.</em> A co-seller&rsquo;s exposure grows with the value accumulated at its own link, so a seller deep in a process has a larger interest in its peers&rsquo; performance than a shallow one. Joint liability as Ghatak (1999) and Stiglitz (1990) specify it has no counterpart: a member&rsquo;s liability for a peer&rsquo;s default does not vary with its position in the group.</li>
                    <li><em>The punishment technology is the schedule.</em> Nothing has to be organized, threatened, or socially administered for the pressure to exist. Each participant&rsquo;s own bond does the work a village&rsquo;s sanctioning capacity does in the joint-liability models, and it does so from the first commitment rather than after a relationship has formed.</li>
                    <li><em>The information margin runs one way.</em> Each seller&rsquo;s exposure is public arithmetic, where a village lender&rsquo;s borrowers inferred one another&rsquo;s positions. Which seller failed is local knowledge here as there: the accumulator does not show it, and the attestations the parties enter are each their own word. The pressure&rsquo;s existence and size come free of local information, while applying it to a particular failure still takes what the parties know.</li>
                </ol>
                <p>
                    A fourth asymmetry cuts against the mechanism on the behavioral side. Joint-liability groups selected themselves, so their pressure arrived bundled with a prior relationship. Social psychology traces compliance and conformity to goals of accuracy, affiliation, and a positive self-concept (Cialdini and Goldstein 2004), and the affiliation channel needs a relationship to operate. The bonded setting supplies none. The economic channel and the monitoring incentive it creates transfer cleanly; the acquaintance-mediated channels do not, and a prediction that the bonded setting reproduces the microfinance literature&rsquo;s outcomes would rely on exactly the part that does not transfer. Our claim is the narrow one: the peer-pressure channel is present on structural grounds that need no social substrate. We predict no rate.
                </p>
            </PaperSection>

            <PaperSection title="6. Incentive Legibility and Interface Cognition">
                <p>
                    <em>Incentive legibility</em> is the property that a participant can check the equilibrium with comparisons of two certain amounts, one at each node where its act decides the outcome, and with one step of reasoning about its counterparty. The mechanism has it because of the structure Section 2 states: one unconditional anchor, and two best replies checked jointly.
                </p>
                <PaperRun title="An elimination argument asks for depth participants lack.">
                    An equilibrium reached by eliminating strategies in successive rounds asks a participant for as many steps of &ldquo;I know that it knows that I know&rdquo; as the elimination has rounds. It also asks for the common knowledge of rationality that licenses carrying the reasoning through them. The level-<Math>{"k"}</Math> literature (Stahl and Wilson 1995; Costa-Gomes, Crawford, and Broseta 2001) finds most participants reasoning at one or two steps. A legibility thesis resting on an elimination argument would therefore be in tension with itself.
                </PaperRun>
                <PaperRun title="Checking this profile takes one step each way.">
                    The anchor asks for no belief: after performance the buyer compares <Math>{"0"}</Math> against <Math>{"-P"}</Math>, and nothing the seller does enters. The seller&rsquo;s check rests on the two premises of comparison (b) in Section 2, the anchor and the buyer&rsquo;s plan not to resolve before performance. That plan is the buyer&rsquo;s own comparison (c): if the seller performs, waiting is worth <Math>{"0"}</Math> against a terminal <Math>{"-P"}</Math> now. So the seller checks one inequality about itself and one about the buyer&rsquo;s reply to its performance, and the buyer checks the converse. Each check holds the other party&rsquo;s plan fixed, and the pair closes there. Verifying the fixed point takes one step of reasoning in each direction.
                </PaperRun>
                <p>
                    A referee will ask: is a fixed point not exactly what bounded reasoners fail to find? They need not find it, because the mechanism names the profile in its own terms: the buyer resolves after performance and not before, and each seller performs. A participant shown that profile verifies it with the comparisons above, each between two amounts it reads before signing. Finding an equilibrium from scratch can take iterated reasoning, while checking a stated one takes the steps just counted. The buyer, who chooses its plan, also prefers this profile to the second equilibrium: it ends at <Math>{"0"}</Math> rather than <Math>{"-P"}</Math>.
                </p>
                <PaperRun title="The seller&rsquo;s belief sits on the defecting branch.">
                    The value of performing rests on the anchor alone, so a seller that doubts the buyer&rsquo;s plan doubts only what holding out is worth. The belief that would move it off performance is optimism, that the buyer will resolve against non-performance and hand it up to <Math>{"P_i + G_i"}</Math>. The doubt that would lower the performing branch is doubt that the buyer takes <Math>{"0"}</Math> over <Math>{"-P"}</Math> after delivery, and a buyer acting on it pays the whole payment to do so. In level-<Math>{"k"}</Math> terms, a level-1 player best-responds to a nonstrategic level-0 placeholder, conventionally uniform random. The seller&rsquo;s counterparty is better than a placeholder: its move after performance is fixed by two certain amounts, which assumes only that a party prefers more to less. Its one further move, the wait, is again a comparison of certain amounts.
                </PaperRun>
                <PaperRun title="A comparison holds two certain amounts and nothing else.">
                    The seller&rsquo;s node holds <Math>{"+P_i"}</Math> against at most <Math>{"-G_i"}</Math>; the buyer&rsquo;s node after delivery holds <Math>{"0"}</Math> against <Math>{"-P"}</Math>. Every amount is readable off the commitment before it is signed and is produced by the mechanism&rsquo;s arithmetic, not by anyone&rsquo;s report: the seller&rsquo;s bond base is fixed by the accumulator. No probability enters, so there is no estimate to form and no threshold to clear. No private accounting enters, because effort, inputs, and time are outlays on the participant&rsquo;s own account, so nobody prices its own performance before telling which branch is better. A comparison of two certain quantities is perhaps the cheapest cognitive object a mechanism can present, and this one presents the same object at every link with only the magnitudes changing.
                </PaperRun>
                <PaperRun title="Arithmetic replaces salience.">
                    Focal-point coordination (Schelling 1960; Sugden 1995) also resolves at shallow depth: a participant identifies the salient solution and chooses it, expecting the counterparty to do the same. Salience depends on framing and attention, and two parties who see a situation differently can contest it. The bonded dependence is a comparison of two certain amounts that either party can carry out and both will answer alike. A participant therefore does not have to guess which solution looks obvious to a stranger.
                </PaperRun>
                <PaperRun title="Interface cognition.">
                    Legibility must survive the interfaces through which participants meet the mechanism. At commitment a participant attends to four things: what is exchanged, the price, the bond, and resolution. The price and the value accumulated at the link fix the bond, and resolution is the buyer&rsquo;s own call. That call reads no term of the agreement; the terms shape what the parties arrange before it. The invariants are enforced rather than left to the participant: the schedule produces <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math> unasked, only the buyer resolves, and resolution takes the whole process or none. The task reduces to two routine commercial judgments: whether the exchange is worth the price, and whether the wallet can fund the bond.
                </PaperRun>
                <PaperRun title="The runtime caveat.">
                    A referee will ask: will participants unfamiliar with key management, signing, and gas estimation be overloaded by the substrate the mechanism runs on? The objection is real, and the distinction answers it: the comparison at a node is legible, and whether the interface presenting it is legible is a separate question about the wallet and onboarding surfaces around it. The mechanism&rsquo;s legibility is a property of its payoffs. It is necessary for a legible experience and not sufficient, and the surfaces are where the behavioral promises are kept or broken in practice.
                </PaperRun>
                <PaperRun title="Legibility bears on adoption.">
                    A population adopts a mechanism partly according to how well it can verify the mechanism&rsquo;s equilibrium. An argument a participant cannot follow cannot be rationally trusted, however correct it is, so opacity costs adoption independently of soundness. Here the participant can check the argument with operations it performs routinely, on figures it reads before it signs. A participant who reads the two amounts also sees the bond for what it is: the instrument that lets it trust a stranger.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The behavioral reading leaves every comparison pointing where the equilibrium needs it. Retention puts loss aversion on the defecting branch, and a seller that keeps separate accounts feels its retention less; the same editing narrows the buyer&rsquo;s margin by about a sixth and reverses neither comparison. What the reading cannot remove is persistence, a process held open by sellers who doubt one another, and the mechanism answers it with an exposure that never decays rather than with a belief correction. The judgment the argument earns concerns checking. A participant can verify the profile from figures fixed before it signs, with one comparison per node and one step of reasoning about its counterparty, which is the depth the level-<Math>{"k"}</Math> experiments find people reach. Each claim remains a prediction, and the bonded game&rsquo;s payoffs are simple enough for a laboratory to run as stated.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

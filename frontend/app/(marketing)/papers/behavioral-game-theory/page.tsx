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
    title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment — Figaro",
    description:
        "How the bonded commitment's equilibrium fares with loss-averse, boundedly reasoning participants: retention puts each comparison across the prospect-theoretic reference point, so loss aversion and segregated accounts widen the seller's margin and narrow the buyer's without reversing either, and the equilibrium is checked with one comparison per node and one step of reasoning about the counterparty.",
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
                        The bonded commitment puts each party in front of two certain amounts at every node where its act decides the outcome. After performance the buyer compares two amounts, with <Math>{"P"}</Math> the payment: resolving is worth <Math>{"0"}</Math>, and never resolving is worth <Math>{"-P"}</Math>. The comparison needs no assumption about the seller, and it anchors the equilibrium. We ask how this structure fares with the participants experimental economics describes: loss-averse, boundedly reasoning, pessimistic about strangers, and moved by motives no payoff counts.
                    </p>
                    <p>
                        The paper&rsquo;s claim is that the equilibrium survives two of these departures, loss aversion with segregated accounts and bounded depth of reasoning, and it has two parts. Because a defector is credited with what it retains, each comparison straddles the prospect-theoretic reference point (the wealth from which gains and losses are measured). Loss aversion therefore weights the defecting branch and does not cancel. A seller that books its retention and its bond apart feels the holdout 1.29 to 1.36 times more heavily across the meta-analytic interval for loss aversion. The same accounting narrows the buyer&rsquo;s margin by about a sixth, and neither comparison reverses.
                    </p>
                    <p>
                        The second part is incentive legibility: the equilibrium is checkable with one comparison per node and one step of reasoning about the counterparty. That is the depth the level-<Math>{"k"}</Math> literature finds participants reach. Two results proved for the mechanism, for parties beyond each other&rsquo;s coercive reach, bound the setting. The Van Huyck&ndash;Battalio&ndash;Beil coordination failure needs a finality the bonded process lacks, and atomic resolution gives every seller a bonded interest in its peers&rsquo; performance (Figaro 2026). Each part is an economic hypothesis argued from the payoffs, with a falsifier a laboratory can run.
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
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 18, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Ghatak, Maitreesh. 1999. &ldquo;Group Lending, Local Information and Peer Selection.&rdquo; <em>Journal of Development Economics</em> 60 (1): 27&ndash;50. https://doi.org/10.1016/S0304-3878(99)00035-8.</li>
                    <li>G&uuml;th, Werner, Rolf Schmittberger, and Bernd Schwarze. 1982. &ldquo;An Experimental Analysis of Ultimatum Bargaining.&rdquo; <em>Journal of Economic Behavior and Organization</em> 3 (4): 367&ndash;388. https://doi.org/10.1016/0167-2681(82)90011-7.</li>
                    <li>Hirshleifer, Jack. 1983. &ldquo;From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods.&rdquo; <em>Public Choice</em> 41 (3): 371&ndash;386. https://doi.org/10.1007/BF00141070.</li>
                    <li>Kahneman, Daniel, and Amos Tversky. 1979. &ldquo;Prospect Theory: An Analysis of Decision under Risk.&rdquo; <em>Econometrica</em> 47 (2): 263&ndash;291. https://doi.org/10.2307/1914185.</li>
                    <li>Rabin, Matthew. 1993. &ldquo;Incorporating Fairness into Game Theory and Economics.&rdquo; <em>American Economic Review</em> 83 (5): 1281&ndash;1302. https://www.jstor.org/stable/2117561.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Slonim, Robert, and Alvin E. Roth. 1998. &ldquo;Learning in High Stakes Ultimatum Games: An Experiment in the Slovak Republic.&rdquo; <em>Econometrica</em> 66 (3): 569&ndash;596. https://doi.org/10.2307/2998575.</li>
                    <li>Stahl, Dale O., and Paul W. Wilson. 1995. &ldquo;On Players&rsquo; Models of Other Players: Theory and Experimental Evidence.&rdquo; <em>Games and Economic Behavior</em> 10 (1): 218&ndash;254. https://doi.org/10.1006/game.1995.1031.</li>
                    <li>Stiglitz, Joseph E. 1990. &ldquo;Peer Monitoring and Credit Markets.&rdquo; <em>World Bank Economic Review</em> 4 (3): 351&ndash;366. https://doi.org/10.1093/wber/4.3.351.</li>
                    <li>Sugden, Robert. 1995. &ldquo;A Theory of Focal Points.&rdquo; <em>Economic Journal</em> 105 (430): 533&ndash;550. https://doi.org/10.2307/2235016.</li>
                    <li>Thaler, Richard. 1985. &ldquo;Mental Accounting and Consumer Choice.&rdquo; <em>Marketing Science</em> 4 (3): 199&ndash;214. https://doi.org/10.1287/mksc.4.3.199.</li>
                    <li>Tversky, Amos, and Daniel Kahneman. 1992. &ldquo;Advances in Prospect Theory: Cumulative Representation of Uncertainty.&rdquo; <em>Journal of Risk and Uncertainty</em> 5 (4): 297&ndash;323. https://doi.org/10.1007/BF00122574.</li>
                    <li>Van Huyck, John B., Raymond C. Battalio, and Richard O. Beil. 1990. &ldquo;Tacit Coordination Games, Strategic Uncertainty, and Coordination Failure.&rdquo; <em>American Economic Review</em> 80 (1): 234&ndash;248. https://www.jstor.org/stable/2006745.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider a buyer and three sellers who have never met. The sellers&rsquo; payments are <Math>{"P_1 = 6"}</Math>, <Math>{"P_2 = 3"}</Math>, and <Math>{"P_3 = 1"}</Math>, committed in that order, so the value accumulated through their orders is <Math>{"G_1 = 6"}</Math>, <Math>{"G_2 = 9"}</Math>, and <Math>{"G_3 = 10"}</Math>. Each party bonds so that, credited with whatever it keeps, defecting leaves it worse off than keeping its word while the others keep theirs. The buyer bonds twice each payment, 20 in all, and each seller twice the value accumulated through its own order. The third seller, at the third order in the process&rsquo;s sequence of orders, where the process has accumulated all 10, bonds 20 against a payment of 1: 10 is the most a holdout there could keep. Nobody is paid until the buyer resolves, and resolution pays all three sellers and refunds every bond at once.
                </p>
                <p>
                    A mechanism is robust to the departures experimental economics documents only if they leave its equilibrium comparisons pointing the same way. The default answer to a stranger&rsquo;s broken promise comes after the fact, from a court, a platform, or an arbitrator with authority to decide. The mechanism read here makes the promise good before the trade, with bonds both sides lock at commit. Mechanism design identifies universal performance as an equilibrium here, because at each node each party&rsquo;s cooperative branch is strictly better given the others&rsquo; plans. Behavioral game theory (Camerer 2003) asks whether the participants found in the laboratory play it. Experiments document loss aversion (Kahneman and Tversky 1979; Tversky and Kahneman 1992), mental accounting, the keeping of gains and losses in separate mental accounts (Thaler 1985), and fairness preferences (Fehr and Schmidt 1999; Bolton and Ockenfels 2000). They document bounded depth of reasoning (Stahl and Wilson 1995; Costa-Gomes, Crawford, and Broseta 2001) and coordination failure under pessimism about co-players (Van Huyck, Battalio, and Beil 1990).
                </p>
                <p>
                    The answer turns on the shape of the equilibrium, which Section 2 states in full. Every term in every comparison is a payment or a bond. Effort, inputs, and time are each party&rsquo;s own outlay, made on its own account, and Section 6 turns that into an argument about cognitive load.
                </p>
                <PaperRun title="Organization.">
                    Section 2 states the mechanism, its payoffs, and its equilibrium. Section 3 reads each node through prospect theory and mental accounting. Section 4 states what the equilibrium analysis establishes about the Van Huyck coordination failure, and Section 5 what it establishes about the coordination pressure atomic resolution creates among sellers, each in the payoff measure of Section 2. Section 6 defines incentive legibility and argues the mechanism has it. Section 7 concludes.
                </PaperRun>
                <PaperRun title="The claim is a hypothesis.">
                    Both parts of the claim are economic hypotheses. The equilibrium it reads is a mechanism-design result, proved for parties beyond each other&rsquo;s coercive reach (Figaro 2026, Theorems 1 and 3); the claims about how participants weigh that equilibrium are argued, not proved and not observed. Each part states the result that would refute it.
                </PaperRun>
                <p>
                    A referee will ask: why should findings from adjacent games transfer to a payoff structure that differs from each? Because each argument takes from a game only the behavior that game measures, and the respect in which the bonded game differs is the argument&rsquo;s next step, never a gap in it. Minimum-effort coordination supplies pessimism about co-players, and the bonded process lacks the finality that pessimism needs to lock in a worse outcome (Section 4). Public-goods punishment supplies a willingness to sanction at a cost, and here a holdout already costs each co-seller its own bonded position (Section 5). Prospect theory supplies the value function, and the bonded nodes hold certain amounts, so the value function transfers without the probability weighting (Section 3, premise 5).
                </p>
            </PaperSection>

            <PaperSection title="2. The Mechanism, Its Payoffs, and Its Equilibrium">
                <p>
                    The mechanism has two operations, commit and resolve, and each carries a mechanism design of its own: asymmetric bonding at commit, and buyer dominance with atomic resolution at resolve. The two compose, and neither substitutes for the other. This section states what the behavioral analysis uses.
                </p>
                <PaperRun title="Order and process.">
                    An order is one seller&rsquo;s commitment to one buyer at one payment, signed by both. A process is a sequence of orders under one buyer and one token, extended one commit at a time and resolved together. Its first order is the root, and each seller <Math>{"S_i"}</Math> holds its own order. The terms of each order, the agreement its two parties complete and sign, enter the chain only as a fingerprint the commitment carries, so the chain never holds the terms.
                </PaperRun>
                <PaperRun title="Commit: asymmetric bonding.">
                    For an order with payment <Math>{"P_i > 0"}</Math>, the buyer bonds <Math>{"2P_i"}</Math> and the seller bonds <Math>{"2G_i"}</Math>. Here <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> is the value the process has accumulated through that seller&rsquo;s order, its own payment included, so <Math>{"G_i \\geq P_i"}</Math> with equality only at the root. The base is arithmetic, not a report: commit admits exactly one value, the value accumulated so far plus the new payment, and refuses any other. The doubling answers <em>retention</em>, what a defector keeps. Value passes off-chain, so a party that walks away keeps what is in its hands. A bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7).
                </PaperRun>
                <PaperRun title="Resolve: buyer dominance with atomic resolution.">
                    Only the buyer resolves, and resolution takes every order in the process at once or none: it pays every seller and refunds every bond together. Resolution is the only terminal event. A resolved process cannot be reopened, and an unresolved one stays open with no clock running against it. Resolution is the buyer&rsquo;s own judgment of performance; the mechanism holds no test of performance and admits no report of performance. A buyer that loses its key strands every bond in its process.
                </PaperRun>
                <PaperRun title="What a payoff contains.">
                    A payoff has two parts. The first is what the mechanism moves: the bond taken at commit and the payout made at resolution. The second is a credit for the off-chain value the party holds, at the figure the parties signed. The credit is never a debit: a party is counted for what is in its hands and never charged for what is not. Off the cooperative path it credits a defecting seller with its retention, written <Math>{"r_i"}</Math>, which is at most <Math>{"G_i"}</Math> and often less. Every deterrence claim below is net of retention.
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
                    <p className="text-xs text-ink-muted mt-2">The four outcomes at one order, each the pair <Math>{"(u_b, u_s)"}</Math>: the position in the mechanism plus the signed value of what each party holds. Rows say whether the seller ever performs, and columns whether the buyer ever resolves. Every plan either party may adopt ends in one of the four, so this is a table of outcomes and not a strategic form. The seller&rsquo;s entries are bounds because its retention is at most <Math>{"G"}</Math>. The right-hand column holds open positions, which persist until the buyer resolves.</p>
                </PaperScroll>
                <PaperRun title="The equilibrium is an anchor and a fixed point.">
                    The equilibrium (Figaro 2026, Theorem 1) has three comparisons and one structure. <strong>(a)</strong> After performance the buyer compares resolving, <Math>{"0"}</Math>, against never resolving, <Math>{"-P"}</Math>. Resolving is strictly better with no assumption about the seller.
                </PaperRun>
                <p>
                    <strong>(b)</strong> The buyer&rsquo;s plan is to resolve once performance has occurred and not before. Given (a) and that plan, the seller compares performing, <Math>{"+P"}</Math>, against never performing, <Math>{"-2G + r \\leq -G"}</Math>. It performs by a margin of at least <Math>{"P + G"}</Math>. <strong>(c)</strong> Given (b), the buyer before performance compares keeping the process open against resolving at once. Keeping it open is worth <Math>{"0"}</Math> once the seller performs, and resolving at once is a terminal <Math>{"-P"}</Math>, so the buyer waits.
                </p>
                <p>
                    (b) and (c) are the two parties&rsquo; best-response checks against one profile, the buyer&rsquo;s plan and the seller&rsquo;s performance, and they hold jointly. The profile is therefore a fixed point, which is what an equilibrium is, and (a) is its one unconditional anchor. Each comparison is made at the node where the choice falls, so the profile is subgame-perfect: a buyer plan threatening never to resolve fails (a) after any performance. A second equilibrium exists, in which the seller never performs and the buyer resolves regardless, at <Math>{"(-P,\\; \\leq P + G)"}</Math>. It is sustained only by a buyer that has given up the instrument the mechanism reserves to it, and it costs that buyer exactly the payment it agreed to, <Math>{"-P"}</Math> against the <Math>{"0"}</Math> of resolving after performance.
                </p>
                <PaperRun title="Many sellers.">
                    With <Math>{"n"}</Math> sellers under one buyer the comparisons recur at every order, and the buyer&rsquo;s plan becomes: resolve once every seller has performed. Provided the co-sellers perform, seller <Math>{"S_i"}</Math>&rsquo;s gap between performing and holding out at full retention is <Math>{"\\Delta_i = P_i + G_i \\geq 2P_i"}</Math>, equal at the root and growing with every payment accumulated ahead of it (Figaro 2026, Theorem 3). Where some co-seller does not perform, holding out beats performing for a seller that retains anything and ties with it for one that retains nothing (Theorem 3(d)), and Section 4 takes that case up.
                </PaperRun>
                <PaperRun title="The externality is no smaller once a seller has performed.">
                    Atomic resolution couples the sellers. Under the buyer&rsquo;s plan, a seller <Math>{"S_k"}</Math> that holds out imposes a loss on each co-seller <Math>{"S_i"}</Math> (<Math>{"i \\neq k"}</Math>). The loss is <Math>{"P_i + 2G_i"}</Math> if <Math>{"S_i"}</Math> has already performed, and at least <Math>{"P_i + G_i"}</Math> if it has not (Figaro 2026, Theorem 4). Either way the loss is positive, and for any one seller it is at least as large once it has done its part. A payoff in which every party&rsquo;s outcome is governed by the least performance in the group is a weakest-link structure (Hirshleifer 1983).
                </PaperRun>
                <PaperRun title="Remedy comes before resolution.">
                    A seller that cannot perform faces an external event the parties handle between themselves before any resolution. The failing seller sends the buyer the payment it stands to receive and makes good whatever of the buyer&rsquo;s it holds, and it ends at zero once resolved (Figaro 2026, Section 4.2). Where the parties disagree, an outside forum may rule on the open process&rsquo;s data, and its ruling feeds what they arrange (Figaro 2026, Section 6); a forum cannot resolve.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Loss Aversion Weights the Defecting Branch at Every Live Node">
                <PaperRun title="The claim.">
                    Between parties beyond each other&rsquo;s coercive reach, crediting retention makes every live node a comparison across the reference point, so loss aversion weights the defecting branch and does not cancel. A live node is one on the path where the other parties keep to the profile, at which the party&rsquo;s act decides the outcome. A participant that books the parts of a mixed position apart feels the seller&rsquo;s holdout heavier by the factor <Math>{"2^{\\alpha} - 1/\\lambda"}</Math>. Here <Math>{"\\alpha"}</Math> is the curvature and <Math>{"\\lambda"}</Math> the loss-aversion ratio of premise 1. The factor exceeds one whenever <Math>{"\\lambda > 1/(2^{\\alpha} - 1)"}</Math>. The same participant feels the buyer&rsquo;s margin narrowed to <Math>{"2^{\\alpha} - 1"}</Math> of the integrated margin, and neither comparison reverses.
                </PaperRun>
                <PaperRun title="Premises.">
                    Five premises carry the argument, the first and fourth from the literature, the rest from the model of Section 2.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><em>The value function.</em> A gain <Math>{"x > 0"}</Math> is felt as <Math>{"v(x) = x^{\\alpha}"}</Math> and a loss of the same size as <Math>{"v(-x) = -\\lambda x^{\\alpha}"}</Math>, with <Math>{"0 < \\alpha < 1"}</Math> the curvature and <Math>{"\\lambda > 1"}</Math> the loss-aversion ratio (Kahneman and Tversky 1979; Tversky and Kahneman 1992). Tversky and Kahneman (1992) estimate <Math>{"\\lambda = 2.25"}</Math> and <Math>{"\\alpha = 0.88"}</Math>; a meta-analysis of 607 estimates puts the mean of <Math>{"\\lambda"}</Math> at 1.955, with a 95% interval of 1.82 to 2.10 (Brown et al. 2024).</li>
                    <li><em>The reference point.</em> It is pre-commitment wealth, the point the payoffs of Section 2 measure from. This is stipulated.</li>
                    <li><em>Retention is credited.</em> A defecting seller is credited with its retention <Math>{"r_i \\leq G_i"}</Math>, and the buyer with the performance it has received, at the value the parties signed (Section 2; Figaro 2026, Definition 7). The argument is worked at full retention, <Math>{"r_i = G_i"}</Math>.</li>
                    <li><em>Editing.</em> Before evaluating a mixed position, a decision-maker may integrate it, feeling the net, or segregate it, feeling each part (Kahneman and Tversky 1979). Mental accounting makes segregation live where the parts sit in different places (Thaler 1985).</li>
                    <li><em>Certain amounts.</em> Every branch at a node is a certain amount, so no probability enters and probability weighting has nothing to act on (Section 2).</li>
                </ol>
                <PaperRun title="Step 1: the direction is fixed and the margin is not.">
                    The direction of every comparison holds under any strictly monotone transformation of the payoffs, loss-averse ones included (Figaro 2026, Section 4.1, the remark titled Robustness to weaker rationality). What this section adds is the felt margin, which prospect theory changes, and retention decides how. A defector is credited with what it keeps, so its position is mixed: a locked bond below the reference point, a retained value above it. The cooperative branch is a clean gain for the seller and a clean break-even for the buyer, so the two nodes are worked separately.
                </PaperRun>
                <PaperRun title="Step 2: the buyer compares a break-even against a loss.">
                    After performance the buyer&rsquo;s branches are <Math>{"0"}</Math> for resolving and <Math>{"-P"}</Math> for never resolving. The first sits at the reference point and the second below it, so the felt comparison is <Math>{"v(0) = 0"}</Math> against <Math>{"v(-P) = -\\lambda P^{\\alpha}"}</Math>. Crediting the buyer with what it holds is what places the gap across the reference point, so loss aversion multiplies the whole of it. Read with the performance uncounted, the node compares <Math>{"-P"}</Math> against <Math>{"-2P"}</Math>. Both sit in the loss domain, where <Math>{"\\lambda"}</Math> scales both branches alike and leaves their ratio at <Math>{"2^{\\alpha} \\approx 1.84"}</Math>.
                </PaperRun>
                <PaperRun title="Step 3: the seller compares a gain against a loss.">
                    Where the co-sellers perform, the seller&rsquo;s branches are <Math>{"+P_i"}</Math> for performing and at most <Math>{"-G_i"}</Math> for holding out. Does the cancellation found at the buyer&rsquo;s uncounted node extend to the seller? It does not, because cancellation needs both branches on one side of the reference point, and the seller&rsquo;s sit on opposite sides. Loss aversion weights the holding-out branch alone, and the felt gap is at least <Math>{"P_i^{\\alpha} + \\lambda G_i^{\\alpha}"}</Math>.
                </PaperRun>
                <PaperRun title="Step 4: separate accounts make retention feel smaller.">
                    The holdout branch is a mixed position whose parts sit in different places: the retained product in the defector&rsquo;s hands, the locked bond on chain. By premise 4 two readings bracket the felt position at full retention. Integrated, the seller feels the net, <Math>{"v(-G_i) = -\\lambda G_i^{\\alpha}"}</Math>. Segregated, it books a gain of <Math>{"G_i"}</Math> against a loss of <Math>{"2G_i"}</Math>, felt as <Math>{"G_i^{\\alpha} - \\lambda 2^{\\alpha} G_i^{\\alpha} = (1 - \\lambda 2^{\\alpha}) G_i^{\\alpha}"}</Math>.
                </PaperRun>
                <p>
                    The ratio of the segregated to the integrated holdout is <Math>{"2^{\\alpha} - 1/\\lambda"}</Math>. At the Tversky&ndash;Kahneman estimates the integrated reading gives <Math>{"-2.25\\,G_i^{\\alpha}"}</Math> and the segregated one <Math>{"-3.14\\,G_i^{\\alpha}"}</Math>, so segregation makes the holdout about 1.40 times heavier. Holding <Math>{"\\alpha"}</Math> at 0.88, the factor runs from 1.29 to 1.36 across the meta-analytic interval and is 1.33 at its mean. Segregation credits retention at gain-domain weight and charges the bond at loss-domain weight: the behavioral face of a doubling that exists because a defector keeps what is in its hands.
                </p>
                <PaperRun title="Step 5: the same editing narrows the buyer&rsquo;s margin.">
                    Segregated, the buyer&rsquo;s withholding branch is a performance worth <Math>{"P"}</Math> received against <Math>{"2P"}</Math> locked, felt as <Math>{"(1 - \\lambda 2^{\\alpha})P^{\\alpha}"}</Math>. The resolving branch is mixed too, a payment made against a performance received, felt as <Math>{"(1 - \\lambda)P^{\\alpha}"}</Math>. The gap is <Math>{"\\lambda(2^{\\alpha} - 1)P^{\\alpha}"}</Math> against <Math>{"\\lambda P^{\\alpha}"}</Math> integrated. The segregated gap is <Math>{"2^{\\alpha} - 1 \\approx 0.84"}</Math> of the integrated one, about a sixth less, and positive for every <Math>{"\\lambda > 0"}</Math>.
                </PaperRun>
                <PaperRun title="Step 6: no live node is flat.">
                    A node where both branches are worth the same lets spite, fatigue, or indifference decide for free. Crediting retention leaves no such node at a live decision. A seller with the process live compares <Math>{"+P_i"}</Math> against <Math>{"-2G_i + r_i"}</Math>, and the buyer&rsquo;s branches differ strictly at each of its nodes.
                </PaperRun>
                <p>
                    The one flat node lies off that path. Suppose a co-seller has held out, so the process has already failed. A seller then compares performing, <Math>{"-2G_i"}</Math>, against holding out, <Math>{"-2G_i + r_i"}</Math>. It is indifferent only when it retains nothing, as with a service not yet rendered. That same seller, at its live decision, faces the widest comparison of anyone: <Math>{"+P_i"}</Math> against a locked <Math>{"2G_i"}</Math> with no credit against it.
                </p>
                <PaperRun title="Conclusion.">
                    Crediting retention puts every live node across the reference point, so loss aversion weights the defecting branch and does not cancel (Steps 2, 3, and 6). Segregation makes the seller&rsquo;s holdout heavier by the factor <Math>{"2^{\\alpha} - 1/\\lambda"}</Math>, which exceeds one whenever <Math>{"\\lambda > 1/(2^{\\alpha} - 1)"}</Math> (Step 4). At <Math>{"\\alpha = 0.88"}</Math> that threshold on <Math>{"\\lambda"}</Math> is about 1.19, below every estimate cited in premise 1. Segregation narrows the buyer&rsquo;s margin to <Math>{"2^{\\alpha} - 1"}</Math> of the integrated margin, about a sixth less (Step 5). Neither comparison reverses.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is refuted by a laboratory run of the bonded game, the sums held fixed, that shows some sellers the holdout as two entries, the retained good and the locked bond, and others the same position as one net figure. If the first hold out at least as often as the second, the claim fails. The buyer&rsquo;s half is refuted by buyers who, shown the segregated presentation, withhold after performance as a rule, since the claim keeps that comparison pointing toward resolution.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim concerns felt margins at nodes whose branches are certain amounts, between parties beyond each other&rsquo;s coercive reach, measured from pre-commitment wealth, at full retention and with the curvature held at its estimate. It reads payoffs only; the preferences no payoff counts are bounded in the next paragraphs and lie outside the claim. It predicts the sign and relative size of felt margins, which a laboratory observes through the choices they move.
                </PaperRun>
                <PaperRun title="Non-pecuniary preferences have a price.">
                    The equilibrium prices payoffs only, and the experiments document preferences no payoff counts: fairness (Fehr and Schmidt 1999; Bolton and Ockenfels 2000), reciprocity (Rabin 1993), spite, and intrinsic motivation. Three observations bound them. First, inequity aversion bites at entry. The bond schedule (the <Math>{"2P"}</Math> and <Math>{"2G"}</Math> of Section 2) is symmetric at the root, where <Math>{"G = P"}</Math> and both parties bond <Math>{"2P"}</Math>, and below it the seller&rsquo;s bond exceeds the buyer&rsquo;s. A participant averse to that asymmetry declines to commit, so the correction shows as slower process formation rather than a different equilibrium of play.
                </PaperRun>
                <p>
                    Second, spite costs something at the node where it would do damage. A seller that holds out to punish a buyer, with its co-sellers ready, forgoes at least <Math>{"P_i + G_i"}</Math>, in the loss domain where weighting is steepest. The ultimatum game shows that such a price is sometimes paid: responders forfeit their share to punish an offer they read as unfair (G&uuml;th, Schmittberger, and Schwarze 1982; Camerer 2003). Two features bear on how often. Ultimatum rejections fall as the sums at play rise (Slonim and Roth 1998; Cameron 1999), and the price here is at least twice the seller&rsquo;s payment (Section 2). And it buys no ending: the punished buyer holds an open position, so the spiteful seller pays for as long as it holds out and stops paying the moment it performs.
                </p>
                <p>
                    Third, intrinsic motivation runs with the schedule rather than against it. A participant moved to perform the agreed work for its own sake prefers the performing branch on that ground. The schedule already makes that branch strictly better at every live node (Step 6), so the two add.
                </p>
            </PaperSection>

            <PaperSection title="4. Coordination Failure Needs Finality">
                <p>
                    The Van Huyck coordination failure needs a finality the bonded process lacks. Van Huyck, Battalio, and Beil (1990) found that groups of fourteen to sixteen players in a minimum-effort game converge, round by round, to its worst equilibrium through pessimism about co-players. In that game each player&rsquo;s payoff rises with the group&rsquo;s lowest effort and falls with its own effort, and the equilibria rank from best to worst for everyone. The condition that finding needs is present here: once a co-seller holds out, holding out is strictly better for a seller that retains anything (Section 2).
                </p>
                <p>
                    The equilibrium analysis answers the concern on other ground: no round ends, nothing is paid short of resolution, and a standoff persists with every party in it preferring the same next move (Figaro 2026, Section 5.2). Two facts from that answer bear on what follows. Each seller&rsquo;s bonded interest in a peer&rsquo;s performance is the figure of Section 2: a certain amount rather than a belief. The figure is exact once the seller has performed and a floor before. And the failure that survives is persistence, a process held open, rather than a worse resolution; we predict no duration.
                </p>
            </PaperSection>

            <PaperSection title="5. Atomic Resolution Gives Each Seller a Stake in Its Peers&rsquo; Performance">
                <p>
                    The pressure atomic resolution creates among sellers is present on structural grounds, and we predict no rate. The externality of Section 2 acts on each seller&rsquo;s own bonded position, and it is the coordination-pressure component of the peer-enforcement equilibrium of joint-liability microfinance (Ghatak 1999; Stiglitz 1990). The mechanism obtains that component with no repeated interaction, no local information among sellers, no sanction exogenous to the contract, and no joint liability (Figaro 2026, Proposition 3). The behavioral question is whether participants feel it as peer pressure. Fehr and G&auml;chter (2000) find that participants in public-goods games pay to punish free-riders when punishing returns them nothing. The channel likely activates at sums such as the opening example&rsquo;s, where the third seller, once it has performed, carries 21 from any co-seller&rsquo;s fault against a payment of 1. The channels of compliance that run through affiliation (Cialdini and Goldstein 2004) need a prior relationship the bonded setting does not supply.
                </p>
            </PaperSection>

            <PaperSection title="6. The Equilibrium Is Checked with One Step of Reasoning">
                <p>
                    <em>Incentive legibility</em> is the property that a participant can check the equilibrium with comparisons of two certain amounts, one at each node where its act decides the outcome, and with one step of reasoning about its counterparty. That each player needs one comparison per node against a fixed profile, and no regress, is noted where the equilibrium is proved (Figaro 2026, Section 4.1, the remark titled Robustness to weaker rationality). This section adds two things. The first is the match of that depth to the level-<Math>{"k"}</Math> literature (the experimental measure of how many steps of reasoning about others participants take). The second is the line between checking a named profile and finding one.
                </p>
                <PaperRun title="The claim.">
                    Between parties beyond each other&rsquo;s coercive reach, the mechanism is incentive-legible. Each party verifies the stated equilibrium profile with one comparison of two certain amounts at each node where its act decides the outcome, and with one step of reasoning about its counterparty. For each seller, the named profile fixes its co-sellers&rsquo; performance. That depth is within the one or two steps the level-<Math>{"k"}</Math> literature finds participants reach.
                </PaperRun>
                <PaperRun title="Premises.">
                    Five premises carry the argument.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><em>The equilibrium&rsquo;s shape.</em> The profile rests on three comparisons: (a) is unconditional, and (b) and (c) are the two parties&rsquo; best replies to one profile (Section 2; Figaro 2026, Theorem 1, and Theorem 3 at every order).</li>
                    <li><em>Fixed amounts.</em> Every amount in those comparisons is fixed by the signed commitment and the mechanism&rsquo;s arithmetic before signing, never by a report (Section 2).</li>
                    <li><em>Own outlays.</em> Effort, inputs, and time are outlays on each party&rsquo;s own account and enter no comparison (Section 1).</li>
                    <li><em>Bounded depth.</em> Most participants reason at one or two steps about others (Stahl and Wilson 1995; Costa-Gomes, Crawford, and Broseta 2001).</li>
                    <li><em>The profile is named.</em> Participants are shown the profile in the mechanism&rsquo;s own terms: the buyer resolves after performance and not before, and each seller performs. This is stipulated.</li>
                </ol>
                <PaperRun title="Step 1: an elimination argument would ask for depth participants lack.">
                    An equilibrium reached by eliminating strategies in successive rounds asks a participant for as many steps of &ldquo;I know that it knows that I know&rdquo; as the elimination has rounds. It also asks for the common knowledge of rationality that licenses carrying the reasoning through them. The level-<Math>{"k"}</Math> literature (Stahl and Wilson 1995; Costa-Gomes, Crawford, and Broseta 2001) finds most participants reasoning at one or two steps. A legibility thesis resting on an elimination argument would therefore be in tension with premise 4.
                </PaperRun>
                <PaperRun title="Step 2: checking this profile takes one step each way.">
                    The anchor asks for no belief: after performance the buyer compares <Math>{"0"}</Math> against <Math>{"-P"}</Math>, and nothing the seller does enters. The seller&rsquo;s check rests on the two premises of comparison (b) in Section 2, the anchor and the buyer&rsquo;s plan not to resolve before performance. That plan is the buyer&rsquo;s own comparison (c): if the seller performs, waiting is worth <Math>{"0"}</Math> against a terminal <Math>{"-P"}</Math> now. So the seller checks one inequality about itself and one about the buyer&rsquo;s reply to its performance, and the buyer checks the converse. Each check holds the other party&rsquo;s plan fixed, and the pair closes there. Verifying the fixed point takes one step of reasoning in each direction.
                </PaperRun>
                <p>
                    A referee will ask: is a fixed point not exactly what bounded reasoners fail to find? They need not find it, because the profile is named to them (premise 5). A participant shown that profile verifies it with the comparisons above, each between two amounts it reads before signing. Finding an equilibrium from scratch can take iterated reasoning, while checking a stated one takes the steps just counted. The buyer, who chooses its plan, also prefers this profile to the second equilibrium: it ends at <Math>{"0"}</Math> rather than <Math>{"-P"}</Math>.
                </p>
                <PaperRun title="Step 3: the seller&rsquo;s belief sits on the defecting branch.">
                    The value of performing rests on the anchor alone, so a seller that doubts the buyer&rsquo;s plan doubts only what holding out is worth. The belief that would move it off performance is optimism, that the buyer will resolve against non-performance and hand it up to <Math>{"P_i + G_i"}</Math>. The doubt that would lower the performing branch is doubt that the buyer takes <Math>{"0"}</Math> over <Math>{"-P"}</Math> after performance, and a buyer acting on it pays the whole payment to do so. In level-<Math>{"k"}</Math> terms, a level-1 player best-responds to a nonstrategic level-0 placeholder, conventionally uniform random. The seller&rsquo;s counterparty is better than a placeholder: its move after performance is fixed by two certain amounts, which assumes only that a party prefers more to less. Its one further move, the wait, is again a comparison of certain amounts.
                </PaperRun>
                <PaperRun title="Step 4: a comparison holds two certain amounts and nothing else.">
                    The seller&rsquo;s node holds <Math>{"+P_i"}</Math> against at most <Math>{"-G_i"}</Math>; the buyer&rsquo;s node after performance holds <Math>{"0"}</Math> against <Math>{"-P"}</Math>. Every amount is fixed before signing, never by a report (premise 2). Checking the named profile holds the co-sellers&rsquo; performance fixed as part of it, so no probability enters the check. A risk-neutral seller unsure of its co-sellers weighs one belief threshold instead, below one-half at every position (Figaro 2026, Corollary 3(b)). That threshold depends on how losses are weighted and lies outside this claim. No private accounting enters (premise 3), so nobody prices its own performance before telling which branch is better. A comparison of two certain quantities is perhaps the cheapest cognitive object a mechanism can present, and this one presents the same object at every order with only the magnitudes changing.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    Each party verifies the named profile with one comparison of two certain amounts per node (Steps 2 and 4) and one step of reasoning about its counterparty&rsquo;s reply (Step 2), and no belief about the counterparty can lower the value of performing (Step 3). That depth is within what premise 4 finds participants reach, so the mechanism is incentive-legible.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is refuted by a laboratory run of the bonded game that shows participants the profile and the amounts of their own commitment, beside a game of the same size whose equilibrium is reached only by eliminating strategies. If the first group identifies the better branch at its node no more often than the second, the claim fails. It is refuted outright by a node whose check against the named profile needs a probability, or a second step of reasoning about a party beyond what the named profile fixes.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim concerns checking a stated profile, never finding one from scratch, between parties beyond each other&rsquo;s coercive reach, and it reads the payoffs alone. It concerns the comparison at a node, never the wallet and onboarding surfaces that present it: the payoffs&rsquo; legibility is necessary for a legible experience and not sufficient. The claim predicts that participants can verify the profile, not that they will act on it.
                </PaperRun>
                <PaperRun title="Arithmetic replaces salience.">
                    Focal-point coordination (Schelling 1960; Sugden 1995) also resolves at shallow depth: a participant identifies the salient solution and chooses it, expecting the counterparty to do the same. Salience depends on framing and attention, and two parties who see a situation differently can contest it. The check at each node is a comparison of two certain amounts that either party can carry out and both will answer alike. A participant therefore does not have to guess which solution looks obvious to a stranger.
                </PaperRun>
                <PaperRun title="A participant attends to four things and decides two.">
                    Legibility must survive the interfaces through which participants meet the mechanism. At commitment a participant attends to four things: what is exchanged, the price, the bond, and resolution. The last two are the mechanism&rsquo;s work, not the participant&rsquo;s: the schedule produces <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math> unasked from the price and the value accumulated at the order, only the buyer resolves, and resolution takes the whole process or none. The terms shape what the parties arrange before resolution, never resolution itself (Section 2). The task reduces to two routine commercial judgments: whether the exchange is worth the price, and whether the wallet can fund the bond.
                </PaperRun>
                <PaperRun title="Onboarding can still overload a participant.">
                    A referee will ask: will participants unfamiliar with key management, signing, and gas estimation be overloaded by the substrate the mechanism runs on? Perhaps some will, and the claim leaves that question outside its scope (see Scope above). The wallet and onboarding surfaces are where the behavioral promises are kept or broken in practice.
                </PaperRun>
                <PaperRun title="Legibility bears on adoption.">
                    A population adopts a mechanism partly according to how well it can verify the mechanism&rsquo;s equilibrium. An argument a participant cannot follow cannot be rationally trusted, however correct it is, so opacity costs adoption independently of soundness. Here the participant can check the argument with operations it performs routinely, on figures it reads before it signs. A participant who reads the two amounts also sees the bond for what it is: the instrument that lets it trust a stranger.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The behavioral reading leaves every comparison pointing where the equilibrium needs it, for parties beyond each other&rsquo;s coercive reach. Retention puts loss aversion on the defecting branch, and a seller that keeps separate accounts feels its retention less; the same editing narrows the buyer&rsquo;s margin by about a sixth and reverses neither comparison. What the reading cannot remove is persistence, a process held open by sellers who doubt one another, and the mechanism answers it with a bonded interest that never decays rather than with a belief correction. The judgment the argument earns concerns checking. A participant can verify the profile from figures fixed before it signs, with one comparison per node and one step of reasoning about its counterparty, which is the depth the level-<Math>{"k"}</Math> experiments find people reach. Each part remains a prediction, and the bonded game&rsquo;s payoffs are simple enough for a laboratory to run as stated.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

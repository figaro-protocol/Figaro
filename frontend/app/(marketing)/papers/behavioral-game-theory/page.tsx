import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment — Figaro Protocol",
    description:
        "How the full-rationality equilibrium of the bonded primitive carries over to real participants: weak dominance at the kink, why the Van Huyck coordination failure does not transfer, atomic resolution as activated peer pressure, and the incentive legibility of a single comparison at the margin.",
};

export default function BehavioralGameTheoryPaper() {
    return (
        <PaperLayout slug="behavioral-game-theory"
            title="Behavioral Game Theory of the Two-Mechanism Bonded Commitment"
            subtitle="Loss Aversion, Coordination, Peer Pressure, and Incentive Legibility"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="behavioral game theory, loss aversion, weakest-link coordination, peer pressure, incentive legibility, mechanism design, experimental economics, interface cognition"
            abstract={
                <>
                    <p>
                        The bonded settlement primitive admits a full-rationality equilibrium argument: cooperation is the unique profile surviving iterated elimination of weakly dominated strategies. That argument assumes complete information, no non-pecuniary preferences, and no coordination failure under pessimistic beliefs, and it is correct on its own terms. This paper treats the same primitive from a behavioral-game-theory perspective and asks how the analysis carries over when participants exhibit the documented departures from full rationality the experimental literature has catalogued over the past forty years.
                    </p>
                    <p>
                        The paper develops four claims. First, the primitive&rsquo;s reliance on weak &mdash; not strict &mdash; dominance is more behaviorally robust than it appears: the operationally-relevant choice is a single comparison at the margin, the stake is the entire bond at twice the transaction value, and the behavioral prediction matches the rational-choice prediction where it matters. Second, the Van Huyck&ndash;Battalio&ndash;Beil coordination-failure result does not transfer, because the per-player game in the bonded setting is dominance-solvable in a way the experimental weakest-link games are not. Third, the externality structure of atomic resolution produces peer pressure that is both economically real and behaviorally activated. Fourth, the architecture&rsquo;s <em>incentive legibility</em> &mdash; participants can verify the equilibrium argument with a single comparison rather than through iterated reasoning about counterparty rationality &mdash; makes it unusually well-suited to the cognitive constraints of real participants.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bolton, G. E. &amp; Ockenfels, A. ERC: A Theory of Equity, Reciprocity, and Competition. <em>American Economic Review</em>, 90(1):166&ndash;193, 2000.</li>
                    <li>Camerer, C. F. <em>Behavioral Game Theory: Experiments in Strategic Interaction</em>. Princeton University Press, Princeton, NJ, 2003.</li>
                    <li>Cialdini, R. B. &amp; Goldstein, N. J. Social Influence: Compliance and Conformity. <em>Annual Review of Psychology</em>, 55:591&ndash;621, 2004.</li>
                    <li>Costa-Gomes, M., Crawford, V. P., &amp; Broseta, B. Cognition and Behavior in Normal-Form Games: An Experimental Study. <em>Econometrica</em>, 69(5):1193&ndash;1235, 2001.</li>
                    <li>Fehr, E. &amp; G&auml;chter, S. Cooperation and Punishment in Public Goods Experiments. <em>American Economic Review</em>, 90(4):980&ndash;994, 2000.</li>
                    <li>Fehr, E. &amp; Schmidt, K. M. A Theory of Fairness, Competition, and Cooperation. <em>Quarterly Journal of Economics</em>, 114(3):817&ndash;868, 1999.</li>
                    <li>Ghatak, M. Group Lending, Local Information and Peer Selection. <em>Journal of Development Economics</em>, 60(1):27&ndash;50, 1999.</li>
                    <li>Hirshleifer, J. From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods. <em>Public Choice</em>, 41(3):371&ndash;386, 1983.</li>
                    <li>Kahneman, D. &amp; Tversky, A. Prospect Theory: An Analysis of Decision under Risk. <em>Econometrica</em>, 47(2):263&ndash;291, 1979.</li>
                    <li>Morduch, J. The Microfinance Promise. <em>Journal of Economic Literature</em>, 37(4):1569&ndash;1614, 1999.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Stahl, D. O. &amp; Wilson, P. W. On Players&rsquo; Models of Other Players: Theory and Experimental Evidence. <em>Games and Economic Behavior</em>, 10(1):218&ndash;254, 1995.</li>
                    <li>Stiglitz, J. E. Peer Monitoring and Credit Markets. <em>World Bank Economic Review</em>, 4(3):351&ndash;366, 1990.</li>
                    <li>Sugden, R. A Theory of Focal Points. <em>Economic Journal</em>, 105(430):533&ndash;550, 1995.</li>
                    <li>Tversky, A. &amp; Kahneman, D. Advances in Prospect Theory: Cumulative Representation of Uncertainty. <em>Journal of Risk and Uncertainty</em>, 5(4):297&ndash;323, 1992.</li>
                    <li>Van Huyck, J. B., Battalio, R. C., &amp; Beil, R. O. Tacit Coordination Games, Strategic Uncertainty, and Coordination Failure. <em>American Economic Review</em>, 80(1):234&ndash;248, 1990.</li>
                    <li>Yunus, M. <em>Banker to the Poor: Micro-Lending and the Battle Against World Poverty</em>. PublicAffairs, New York, 1999.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Behavioral game theory (Camerer, 2003) is the empirical correction to mechanism design&rsquo;s full-rationality assumptions. Forty years of experimental work has documented systematic departures from the rational-choice baseline: loss aversion (Kahneman &amp; Tversky, 1979; Tversky &amp; Kahneman, 1992), framing effects, anchoring, hyperbolic discounting, fairness preferences (Fehr &amp; Schmidt, 1999; Bolton &amp; Ockenfels, 2000), social preferences, and coordination failures under pessimistic beliefs about co-players (Van Huyck, Battalio, &amp; Beil, 1990). A mechanism designed under the rational-choice assumption is robust to behavioral departures only if the departures preserve the mechanism&rsquo;s load-bearing equilibrium properties; many do not.
                </p>
                <p>
                    The full-rationality equilibrium argument for the bonded primitive establishes that cooperation is weakly dominant for both parties in the bonded game, and is the unique profile surviving iterated elimination of weakly dominated strategies. The proof assumes complete information, full rationality, no non-pecuniary preferences, no coordination failure under pessimistic beliefs, perfect monitoring, and costless performance; what it prices is settlement discipline, not the adjudication of disputed performance, which remains with the forums that compose above the mechanism. The result holds within those assumptions. The present paper asks: how does the result carry over when the assumptions are weakened in the directions the experimental literature has identified as empirically relevant?
                </p>
                <PaperRun title="The four claims.">
                    The paper develops four claims about the behavioral robustness of the bonded architecture.
                </PaperRun>
                <p>
                    First, the bond&rsquo;s reliance on weak rather than strict dominance is more robust than it appears, because the strict-case gap is the entire bond &mdash; and asymmetric bonding (Mechanism 1) sets that stake at twice the transaction value. The magnitude alone makes defection strongly aversive; loss aversion reinforces it under the natural framing in which a locked bond is at risk. This is the behavioral counterpart of the magnitude axis; the coordination pressure propagated across the already-scaled cohort &mdash; treated in Sections 4 and 5 &mdash; is the work of buyer dominance with atomic resolution (Mechanism 2).
                </p>
                <p>
                    Second, the multi-party result is robust to the Van Huyck&ndash;Battalio&ndash;Beil (1990) coordination-failure pattern because the per-player game is dominance-solvable in the bonded setting. The classical experimental result requires individual non-dominance &mdash; a setting in which pessimistic beliefs about co-players make defection rational. The bonded setting forecloses this.
                </p>
                <p>
                    Third, the weakest-link subgame the full-rationality analysis identifies is both economically real and behaviorally activated. The externality magnitude <Math>{"P_i + 2G_i"}</Math> is large; the experimental literature on peer pressure shows that social-pressure activation occurs at much lower stakes. The architecture&rsquo;s peer-enforcement effect should therefore be expected to operate through both the economic-rationality channel and the behavioral peer-pressure channel.
                </p>
                <p>
                    Fourth, the architecture exhibits <em>incentive legibility</em>: the cognitive operation a participant must perform to assess the equilibrium is a single comparison at the margin. This is the minimal reasoning task in any strategic setting, and it is well within the documented capabilities of unsophisticated participants. The architecture&rsquo;s behavioral robustness derives substantially from this legibility property; it asks little of the participant.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive in the register the present paper uses. Section 3 treats the weak-dominance argument&rsquo;s behavioral robustness, and works out the loss-aversion analysis at the kink. Section 4 treats the Van Huyck&ndash;Battalio&ndash;Beil coordination-failure objection and argues it does not transfer. Section 5 treats the externality structure of atomic resolution as behavioral peer pressure. Section 6 develops incentive legibility &mdash; the architectural property that makes the design unusually well-suited to behavioral participants &mdash; and the interface cognition through which participants meet it. Section 7 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>
                    The bonded primitive carries a full-rationality equilibrium argument. We summarize the features the present paper uses.
                </p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. The payoff matrix in the two-party game is:
                </PaperRun>
                <div className="my-3 overflow-x-auto">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left text-ink-muted font-normal"> </th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Buyer cooperates</th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Buyer defects</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Seller cooperates</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; +P)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                            </tr>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Seller defects</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; -2G)"}</Math></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Cooperation weakly dominates defection for both players. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies.
                </p>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the buyer can trigger resolution; resolution settles all active orders simultaneously or not at all. The atomicity rule induces a weakest-link subgame among sellers. Each seller&rsquo;s defection imposes externality <Math>{"\\varepsilon_{k \\to i} = P_i + 2G_i"}</Math> on every co-seller.
                </PaperRun>
                <PaperRun title="What the behavioral analysis adds.">
                    The full-rationality analysis assumes participants compute the matrix above, recognize the weak-dominance relations, and play cooperatively. The behavioral question is whether participants who do not perform this computation explicitly nonetheless converge on cooperation, and how they do so. The answer, we will argue, is that they do, through cognitive shortcuts that the mechanism&rsquo;s structure makes reliable. The two mechanisms factor that question along two axes: asymmetric bonding (Mechanism 1) sets the <em>magnitude</em> of what is at stake, and buyer dominance with atomic resolution (Mechanism 2) sets the coordination pressure propagated across the already-scaled cohort. Section 3 treats the magnitude axis on the bilateral bond; Sections 4 and 5 treat the coordination pressure on the multi-party cohort.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Weak Dominance and Loss Aversion at the Kink">
                <p>
                    The central equilibrium result rests on weak dominance: cooperation is at least as good as defection for both players, with strict inequality when the counterparty cooperates. Behavioral game theory has historically been wary of mechanisms that rely on weak dominance, because the fully-strict case is more robust to the cognitive limitations and non-pecuniary preferences participants exhibit. We argue the bonded mechanism&rsquo;s weak-dominance is more robust than it appears.
                </p>
                <PaperRun title="The gap is the entire bond.">
                    The strict-inequality case occurs when the counterparty cooperates: cooperation recovers the bond and settles the net flow (<Math>{"-P"}</Math> for the buyer, <Math>{"+P"}</Math> for the seller), while defection forfeits the bond entirely (<Math>{"-2P"}</Math> for the buyer, <Math>{"-2G"}</Math> for the seller). The gap between the two outcomes is the whole bond: <Math>{"P"}</Math> for the buyer, <Math>{"P + 2G"}</Math> for the seller, the latter scaling with chain depth via the cumulative upstream value. That magnitude is the work of asymmetric bonding (Mechanism 1): it sets the stake at twice the transaction value, so the strict-case gap is large in absolute terms and large relative to the natural reference point, the bond posted at commitment.
                </PaperRun>
                <p>
                    The non-strict case occurs when the counterparty defects: both cooperation and defection yield the full bond loss because the defection prevents resolution regardless of the participant&rsquo;s play. This case is non-strict, but it is also the case in which the participant has no decision to make: their payoff is determined by the counterparty&rsquo;s defection, and their own action is moot.
                </p>
                <PaperRun title="Loss aversion sharpens the strict case.">
                    Prospect theory (Kahneman &amp; Tversky, 1979; Tversky &amp; Kahneman, 1992) establishes that participants weight losses more heavily than equivalent gains, with empirical loss-aversion coefficients typically in the range 1.5 to 2.5. The asymmetry is between the gain domain and the loss domain; within each domain, prospect theory documents diminishing sensitivity (the value function is concave over gains and convex over losses).
                </PaperRun>
                <p>
                    How much loss aversion adds to the magnitude depends on the reference point, which prospect theory leaves under-determined, so the argument does not lean on it. Under the natural framing for a participant who has posted a bond &mdash; the bond is at risk, and the choice is to recover it or forfeit it &mdash; defection is a loss that cooperation avoids, and loss aversion weights the comparison toward cooperation at the kink. Under the more conservative framing that measures both outcomes from pre-commitment wealth, the payer&rsquo;s two outcomes are both losses, loss aversion multiplies both and cancels, and only the loss-domain convexity remains. The conclusion survives either way.
                </p>
                <p>
                    Take the conservative framing as the worst case. The disutility of a loss <Math>{"x \\geq 0"}</Math> is approximately <Math>{"\\lambda \\cdot |x|^{\\alpha}"}</Math>, where <Math>{"\\lambda \\in [1.5, 2.5]"}</Math> is the loss-aversion ratio (the asymmetry between gain and loss domains at the reference point) and <Math>{"\\alpha \\approx 0.88"}</Math> is the loss-domain curvature parameter (Tversky &amp; Kahneman, 1992). Cooperation costs <Math>{"\\lambda \\cdot P^{\\alpha}"}</Math> and defection <Math>{"\\lambda \\cdot (2P)^{\\alpha} = 2^{\\alpha} \\cdot \\lambda \\cdot P^{\\alpha}"}</Math>. Even with <Math>{"\\lambda"}</Math> cancelling, <Math>{"2^{\\alpha} \\approx 2^{0.88} \\approx 1.84"}</Math> places the full-bond forfeiture roughly 84% above the net flow, and <Math>{"2^{\\alpha} > 1"}</Math> for any <Math>{"\\alpha > 0"}</Math>, so forfeiture is strictly more aversive for any feasible curvature parameter the empirical literature has documented. The magnitude does the work; loss aversion only adds to it.
                </p>
                <PaperRun title="Behavioral robustness of weak dominance.">
                    The combined effect is that participants treat cooperation as strictly preferred to defection in the cases where the analysis says cooperation strictly dominates, and treat the two as equivalent in the cases where the analysis says they are equivalent (both yield bond loss because the counterparty defected). The behavioral prediction matches the rational-choice prediction at the operationally-relevant choice point.
                </PaperRun>
                <PaperRun title="Non-pecuniary preferences.">
                    The full-rationality analysis assumes participants care only about pecuniary payoffs. The experimental literature documents substantial non-pecuniary preferences: fairness (Fehr &amp; Schmidt, 1999; Bolton &amp; Ockenfels, 2000), reciprocity, spite, and intrinsic motivation. The honest scope-claim is that the bonded mechanism&rsquo;s equilibrium argument assumes pecuniary preferences and may admit additional behavior under non-pecuniary preferences. Three observations bound the concern.
                </PaperRun>
                <p>
                    First, fairness preferences in inequity-aversion form (Fehr &amp; Schmidt, 1999) predict cooperation when the symmetric case applies (root commitment with <Math>{"P = G"}</Math>, both parties bonding <Math>{"2P"}</Math>). The bonded mechanism is symmetric at root and asymmetric only deeper in the process chain, where the inequity-aversion concern is the seller&rsquo;s higher exposure relative to the buyer&rsquo;s. Inequity aversion in this direction would predict a participant refusing to enter the bonded commitment in the first place rather than defecting after entering; the equilibrium-of-play result is robust to this correction at the cost of slower multi-party-process formation.
                </p>
                <p>
                    Second, reciprocity and spite operate primarily in the counterparty&rsquo;s-defection case where both cooperation and defection yield bond loss for the participant; the participant who is spite-motivated may prefer the defection branch as a co-counterparty-punishment gesture. The mechanism&rsquo;s outcome is unchanged (both branches yield bond loss); the participant&rsquo;s internal experience may differ.
                </p>
                <p>
                    Third, intrinsic motivation to perform (a craft-based or honor-based preference for delivering the agreed work regardless of contractual incentive) reinforces cooperation; the bonded mechanism&rsquo;s pecuniary incentive aligns with the intrinsic motivation rather than competing against it. This is structurally favorable for the mechanism&rsquo;s behavioral robustness.
                </p>
            </PaperSection>

            <PaperSection title="4. The Van Huyck Coordination Failure Does Not Transfer">
                <p>
                    The classical experimental literature on weakest-link coordination, beginning with Van Huyck, Battalio, &amp; Beil (1990), documents a robust empirical finding: in groups larger than two, weakest-link coordination games converge to the Pareto-inferior all-defect equilibrium via pessimistic beliefs about co-players. The result appears to threaten the multi-party reading of the bonded architecture, since the architecture is described as inducing a weakest-link subgame among sellers. This potential threat is worth confronting directly; we develop the response here in a behavioral-game-theory register.
                </p>
                <PaperRun title="Why Van Huyck&rsquo;s coordination failure occurs.">
                    The Van Huyck&ndash;Battalio&ndash;Beil minimum-effort game asks each player to choose an effort level from <Math>{"\\{1, 2, \\ldots, 7\\}"}</Math>. Each player&rsquo;s payoff is determined by the minimum effort across the group: they gain a per-player benefit from the minimum and pay a private cost for their own effort. In the typical experimental treatment, an effort of 7 across the group is Pareto-optimal, but any individual player can guarantee a non-negative payoff by choosing the minimum effort 1 regardless of others&rsquo; choices. The combination produces multiple Nash equilibria (any common effort level), and the empirical finding is that groups of 14&ndash;16 players converge on the all-1 Pareto-inferior equilibrium via pessimistic beliefs about co-players&rsquo; choices.
                </PaperRun>
                <p>
                    The structural feature that produces the failure is that <em>individual cooperation is not dominated</em> by individual defection. A player who chooses 7 against a co-player who chooses 1 takes a private cost without producing the joint benefit; choosing 7 is rational only conditional on others&rsquo; choosing 7. Pessimistic beliefs about others&rsquo; rationality therefore rationalize choosing 1, and the iterated belief-formation drives the convergence.
                </p>
                <PaperRun title="Why the bonded mechanism does not exhibit it.">
                    The bonded mechanism&rsquo;s per-seller game is structurally different. Consider the sub-game from seller <Math>{"S_i"}</Math>&rsquo;s perspective in the <Math>{"N"}</Math>-party process. Two cases.
                </PaperRun>
                <p>
                    <em>Case 1: All other sellers cooperate, buyer resolves.</em> Then <Math>{"u_{S_i}(C) = +P_i"}</Math> and <Math>{"u_{S_i}(D) = -2G_i"}</Math>. Cooperation strictly dominates defection (gap <Math>{"P_i + 2G_i"}</Math>).
                </p>
                <p>
                    <em>Case 2: At least one other seller defects, or buyer defects.</em> Then <Math>{"u_{S_i}(C) = u_{S_i}(D) = -2G_i"}</Math>. Cooperation and defection yield the same payoff because resolution does not occur regardless of <Math>{"S_i"}</Math>&rsquo;s action.
                </p>
                <p>
                    The combination is weak dominance: cooperation is at least as good as defection in every co-player profile, with strict inequality in the cooperative profile. <em>There is no profile in which cooperation is dominated by defection.</em> The pessimistic-belief mechanism that produces Van Huyck-style coordination failure requires individual non-dominance &mdash; a setting in which a player who expects others to defect prefers to defect themselves. In the bonded mechanism, a player who expects others to defect is indifferent between cooperating and defecting; they are not <em>better off</em> defecting. The pessimistic-belief mechanism has nothing to operate on.
                </p>
                <PaperRun title="The architectural reading.">
                    The Van Huyck result documents what happens when the per-player game is non-dominance-solvable and players reason about each other&rsquo;s rationality under pessimistic priors. The bonded mechanism is dominance-solvable at the per-player level. The weakest-link <em>outcome</em> (one defection collapses all payoffs) is preserved; the weakest-link <em>strategic structure</em> that produces coordination failure is foreclosed. Hirshleifer&rsquo;s (1983) characterization of weakest-link public-goods games as a structural-payoff form continues to apply; the experimental literature&rsquo;s coordination-failure transfer does not.
                </PaperRun>
                <PaperRun title="Scope of the claim.">
                    The argument above is theoretical: the structural condition for Van Huyck coordination failure is absent in the bonded mechanism. The honest claim is that the negative experimental finding from the existing weakest-link literature does not transfer; it does not by itself establish a positive finding for the bonded setting.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Atomic Resolution as Peer Pressure">
                <p>
                    The full-rationality analysis of atomic resolution characterizes the externality structure formally: each seller&rsquo;s defection imposes externality <Math>{"\\varepsilon_{k \\to i} = P_i + 2G_i"}</Math> on every other seller. The external pressure is <em>economic</em>, in the sense that it operates on each seller&rsquo;s expected bond exposure. The behavioral question is whether the pressure is also <em>social</em>, in the sense that participants experience it as peer pressure rather than only as expected-value arithmetic. We argue it is.
                </p>
                <PaperRun title="The behavioral peer-pressure literature.">
                    The experimental literature on social-pressure activation (Cialdini &amp; Goldstein, 2004; Fehr &amp; G&auml;chter, 2000) finds that participants modify their behavior in response to peer monitoring even at low stakes, and that the response increases with the stakes faced by the monitor as well as by the monitored. The seminal Fehr&ndash;G&auml;chter result on punishment in public-goods games shows that participants will pay private costs to punish defectors even when no monetary reward is available; this establishes that peer pressure activates as a behavioral phenomenon even without an expected-value rationale.
                </PaperRun>
                <p>
                    The bonded mechanism&rsquo;s externality structure activates a stronger form of the same phenomenon. Each seller has an <em>expected-value</em> reason to monitor co-sellers: their bond is forfeit if any co-seller defects. This is unusually high stakes: each seller faces <Math>{"P_i + 2G_i"}</Math> in damages from any co-seller&rsquo;s defection, where <Math>{"G_i"}</Math> scales with chain depth. At chain depth <Math>{"i = 5"}</Math> with equal payments <Math>{"p"}</Math> per stage, the damages are <Math>{"11p"}</Math>, and at <Math>{"i = 10"}</Math> they are <Math>{"21p"}</Math>. The behavioral peer-pressure literature operates at much lower stakes; the bonded mechanism&rsquo;s stakes are an order of magnitude higher.
                </p>
                <PaperRun title="The social-substrate analogue.">
                    Joint-liability microfinance (Ghatak, 1999; Stiglitz, 1990) and the empirical literature on the Grameen Bank document a substantial reduction in reported default rates under joint-liability lending. Yunus (1999) reports a default rate of approximately 2% under the joint-liability regime, against the substantially higher default rates typical of unsecured rural lending; Morduch (1999) contests the headline figures on accounting grounds, arguing that loan rescheduling and definition-of-default ambiguity make the self-reported 2% figure optimistic. We treat the comparison as a stylized benchmark of the joint-liability literature&rsquo;s headline finding rather than as a peer-reviewed empirical estimate; the contemporary literature attributes whatever reduction is real to a combination of social peer-monitoring activation, social-sanction technology, and reputation effects.
                </PaperRun>
                <p>
                    The reduction-from-microfinance result shows that the bonded mechanism reproduces the cooperation-pressure component of the joint-liability peer-enforcement equilibrium under strictly weaker assumptions: no repeated interaction, no local information, no exogenous punishment technology, no joint-liability contracting. The behavioral reading of the same result is that the social-pressure mechanism the microfinance literature documents is, in the bonded setting, constituted directly by the bonding rule rather than mediated through the social substrate. The bonded mechanism is therefore not merely <em>equivalent</em> to joint-liability microfinance in equilibrium; it produces the social-pressure dynamics through a structurally cleaner channel that does not require the social substrate to be in place.
                </p>
                <PaperRun title="Empirical extrapolation.">
                    Read as a stylized upper-bound benchmark, with the caveats above, the Grameen comparison gives an indication of the order of magnitude the bonded mechanism&rsquo;s peer-pressure activation might support. Three structural margins favor the bonded mechanism over the Grameen setting: the externality magnitude scales with chain depth (deeper sellers face larger co-seller-defection costs); information availability is higher (every other seller&rsquo;s bond exposure is on chain); and the punishment technology is mechanical (the bonding rule rather than social sanction). We do not claim a specific quantitative prediction; we note that the accounting ambiguities clouding the headline figures do not arise in the same way for a mechanism whose default and resolution events are on-chain and unambiguous.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Incentive Legibility and Interface Cognition">
                <p>
                    The behavioral robustness of the bonded mechanism rests on a property we call <em>incentive legibility</em>: the cognitive operation a participant must perform to assess the equilibrium is a single comparison at the margin, not a multi-step iterated reasoning about counterparty rationality.
                </p>
                <PaperRun title="The cognitive demand of standard mechanism design.">
                    A typical mechanism-design proof requires the participant to reason about: their own preferences over outcomes; the counterparty&rsquo;s preferences over outcomes; their belief over the counterparty&rsquo;s choices; the counterparty&rsquo;s belief over their own choices; the equilibrium concept the mechanism rests on; and any common-knowledge assumptions the equilibrium requires. The behavioral literature documents that participants do not perform this reasoning in any reliable way &mdash; the level-<Math>{"k"}</Math> thinking literature (Stahl &amp; Wilson, 1995; Costa-Gomes, Crawford, &amp; Broseta, 2001) finds that most participants reason at level 1 or 2 (one or two steps of iterated thinking), not the unbounded level the common-knowledge equilibrium concept presumes.
                </PaperRun>
                <p>
                    The architectural concern is that mechanisms whose equilibrium properties require unbounded iterated reasoning are not robust to the cognitive limitations of real participants. The bonded mechanism is structurally different: the equilibrium argument requires only level-1 reasoning.
                </p>
                <PaperRun title="The level-1 argument for cooperation.">
                    A participant in the bonded mechanism asks: &ldquo;If I cooperate, what is my outcome? If I defect, what is my outcome?&rdquo; The first answer is bounded by what the bonding rule produces conditional on the counterparty&rsquo;s action; the second answer is the bond loss unconditional on the counterparty&rsquo;s action. The participant compares the two and chooses the better one. This is level-1 reasoning: one step of forward-looking analysis, no iterated reasoning about the counterparty&rsquo;s reasoning, no common-knowledge assumption.
                </PaperRun>
                <p>
                    The argument&rsquo;s robustness follows: a participant who can perform level-1 reasoning &mdash; which is the floor of strategic reasoning in any documented adult population &mdash; has all the cognitive machinery the bonded mechanism requires. The mechanism does not ask the participant to compute the iterated elimination or to verify common knowledge of payoffs; it asks them to compare two outcomes at the margin. The dominance argument the full-rationality equilibrium analysis formalizes corresponds, behaviorally, to the comparison the participant naturally performs.
                </p>
                <PaperRun title="The Schelling-focal-point comparison.">
                    Schelling-focal-point coordination (Schelling, 1960; Sugden, 1995) similarly works through a level-1 argument: the participant identifies the salient solution and chooses it, expecting the counterparty to do the same. The bonded mechanism&rsquo;s coordination is even simpler than focal-point coordination because it does not require any salience computation. The architecturally privileged choice is determined by the mechanism&rsquo;s payoff structure rather than by any framing- or attention-dependent salience. The participant&rsquo;s choice-of-cooperation is not a guess about what the counterparty will do; it is the choice that produces the better outcome conditional on either counterparty action.
                </PaperRun>
                <PaperRun title="Interface cognition.">
                    Legibility must survive the interface through which participants meet the mechanism. The architecture asks the participant to attend to four things at the moment of commitment: the goods or services being exchanged, the price, the bond posture (mechanically determined by the price and the cumulative upstream value), and the resolution path (the buyer&rsquo;s signature plus any clauses the parties have agreed). The invariants are not left to the participant&rsquo;s verification &mdash; the bonding rule produces <Math>{"2P"}</Math> and <Math>{"2G"}</Math> automatically, buyer dominance constrains who can resolve, and atomic resolution constrains how resolution proceeds &mdash; so the cognitive task reduces to the substantive commercial decision (is this exchange worth this price?) plus the bond-feasibility decision (is the bond within my treasury capacity?). Both are routine commercial decisions.
                </PaperRun>
                <p>
                    A participant in a platform-mediated arrangement is asked, in addition, to attend to the platform&rsquo;s terms-of-service, complaint-resolution process, reputation system, payment-flow timing, and jurisdictional-coverage rules &mdash; infrastructural-property verifications the platform delegates to the participant, with correspondingly higher cognitive load. The bonded architecture&rsquo;s load is structurally lower because its properties are enforced rather than verified: the protocol&rsquo;s behavior is its terms-of-service, and it cannot violate terms that are fixed and self-enforcing. The load shifts from infrastructural verification to substantive commercial decision-making, which is the right direction for a coordination architecture.
                </p>
                <PaperRun title="The runtime caveat.">
                    The counter-argument is that participants unfamiliar with cryptographic key management, on-chain transactions, and gas estimation may be over-loaded by substrate-tier concerns. That is a real concern at the runtime tier, and it is the work of the wallet, signing, and onboarding infrastructure rather than of the kernel itself. The kernel is incentive-legible; the runtime tier may or may not be, depending on how it presents the kernel to participants. Interface design at the runtime tier is where the architecture&rsquo;s behavioral promises are kept or broken in practice.
                </PaperRun>
                <PaperRun title="Implications for the architecture&rsquo;s adoption.">
                    A mechanism&rsquo;s adoption in a population is partly a function of how well the population can verify the mechanism&rsquo;s equilibrium properties. A mechanism whose equilibrium argument is opaque will struggle to attract participants regardless of the argument&rsquo;s correctness, because participants who cannot verify the argument cannot rationally trust it. The bonded mechanism&rsquo;s incentive legibility is therefore not just behavioral robustness but adoption advantage: participants can verify the argument themselves with the cognitive operations they routinely perform.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The bonded settlement primitive&rsquo;s full-rationality equilibrium analysis carries over to the behavioral setting: loss aversion sharpens the weak-dominance comparison at the kink rather than blunting it, the Van Huyck coordination failure does not transfer because the per-player game is dominance-solvable, the atomic-resolution externality structure activates the peer-pressure dynamics the joint-liability literature documents through a cleaner channel that does not require the social substrate, and the whole argument is verifiable by the participant with a single comparison at the margin.
                </p>
                <p>
                    The four properties together produce a mechanism whose behavioral robustness derives from its structural simplicity. The mechanism is not optimal in any technical sense; it is robust in the behavioral sense that it does not ask participants to do cognitive work they cannot reliably do. This is a different property than rational-choice optimality, and it is, we suggest, the more important property for any mechanism that aspires to operate at population scale among real participants.
                </p>
                <p>
                    The analysis is theoretical, and it stands or falls on measurable quantities: bilateral cooperation rates against an unbonded contractual baseline, multi-party resolution rates as cohort size grows, peer-monitoring activation under visible co-seller bond exposure, and the cognitive load the interface imposes relative to platform-mediated commerce &mdash; in the laboratory and in deployments such as a multi-party service chain, a logistics chain, or a local-commerce cohort.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

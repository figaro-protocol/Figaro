import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun, PaperRemark } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Coercion Variable — Figaro Protocol",
    description:
        "Bonds the parties lock at consent make priceable, bilateral, voluntary promises good before the trade, and the only decision left after consent is the buyer's resolution, made against its own locked bond. Coercion thereby becomes a variable, and between parties beyond each other's coercive reach the mechanism exercises neither of its components. Performance is each party's best reply to the others' plans, and a withheld bond stays locked and reaches no one. Remoteness is assumed because, within reach, coercion can replace the bond.",
});

export default function CoercionVariablePaper() {
    return (
        <PaperLayout slug="coercion-variable"
            title="The Coercion Variable"
            subtitle="On the Boundary Between What the Sovereign Must Do and What the Bond Can Do"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Coercion is a variable, not a constant: in priceable, bilateral, voluntary commerce between parties beyond each other&rsquo;s coercive reach, bonds locked at consent exercise neither its forcing nor its authority component, performance being each party&rsquo;s best reply to the others&rsquo; plans. The question of legitimate coercion is therefore vacated there, and it keeps its full urgency over a smaller domain. From Austin and Hobbes through Weber and Hart, the dominant tradition of legal philosophy has paired law&rsquo;s texts with a coercive apparatus that compels performance or punishes breach. We examine a mechanism that makes a bilateral commercial promise good before the trade, with no such apparatus. Each party locks a bond at the moment of consent: the buyer twice the payment, each seller twice the value accumulated through its order.
                    </p>
                    <p>
                        Only the buyer can resolve, and resolution pays every seller and refunds every bond at once; until then every bond stays locked, without timeout. Credited with whatever it retains, a seller that holds out is still worse off than one that performs. Performing is therefore each seller&rsquo;s best reply to the buyer&rsquo;s plan to resolve once performance has occurred and not before, and after performance resolving is the buyer&rsquo;s best reply, with no assumption about the seller.
                    </p>
                    <p>
                        The mechanism is a pre-commitment structure in Elster&rsquo;s sense, and on Nozick&rsquo;s baseline test its bonds are offers, not threats. The one decision it leaves after consent is the buyer&rsquo;s, exercised against the buyer&rsquo;s own locked bond, and a withheld bond stays locked and reaches no one. Remoteness is assumed because, within reach, coercion can replace the bond. Criminal harm, externalities, public goods, status, rights, and defense stay with the sovereign. The question of legitimate coercion is not answered; the domain over which it must be answered is narrowed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Austin, John. 1832. <em>The Province of Jurisprudence Determined</em>. London: John Murray.</li>
                    <li>Elster, Jon. 1979. <em>Ulysses and the Sirens: Studies in Rationality and Irrationality</em>. Cambridge: Cambridge University Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Hart, H. L. A. 1961. <em>The Concept of Law</em>. Oxford: Clarendon Press.</li>
                    <li>Hobbes, Thomas. 1651. <em>Leviathan, or The Matter, Forme, and Power of a Common-Wealth Ecclesiasticall and Civill</em>. London: Andrew Crooke.</li>
                    <li>Nakamoto, Satoshi, aceat64, and ribuck. 2010. &ldquo;Escrow.&rdquo; Forum thread, <em>Bitcointalk</em>, topic 750, August 7&ndash;11, 2010: messages 8140 (Nakamoto, August 7), 8213 (aceat64, August 8), 8734 and 8742 (ribuck, August 11). https://bitcointalk.org/index.php?topic=750.0. Accessed October 18, 2026.</li>
                    <li>Nozick, Robert. 1969. &ldquo;Coercion.&rdquo; In <em>Philosophy, Science, and Method: Essays in Honor of Ernest Nagel</em>, edited by Sidney Morgenbesser, Patrick Suppes, and Morton White, 440&ndash;472. New York: St. Martin&rsquo;s Press.</li>
                    <li>Olson, Mancur. 1965. <em>The Logic of Collective Action: Public Goods and the Theory of Groups</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Pettit, Philip. 1997. <em>Republicanism: A Theory of Freedom and Government</em>. Oxford: Clarendon Press.</li>
                    <li>Pettit, Philip. 2012. <em>On the People&rsquo;s Terms: A Republican Theory and Model of Democracy</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9781139017428.</li>
                    <li>Schmitt, Carl. (1922) 1985. <em>Political Theology: Four Chapters on the Concept of Sovereignty</em>. Translated by George Schwab. Cambridge, MA: MIT Press.</li>
                    <li>Solidity Team. 2015. &ldquo;Safe Remote Purchase.&rdquo; In <em>Solidity Documentation</em>, &ldquo;Solidity by Example.&rdquo; Version 0.8.26: https://docs.soliditylang.org/en/v0.8.26/solidity-by-example.html#safe-remote-purchase. Accessed October 18, 2026.</li>
                    <li>Stigler, George J. 1971. &ldquo;The Theory of Economic Regulation.&rdquo; <em>Bell Journal of Economics and Management Science</em> 2 (1): 3&ndash;21. https://doi.org/10.2307/3003160.</li>
                    <li>Szabo, Nick. 1997. &ldquo;Formalizing and Securing Relationships on Public Networks.&rdquo; <em>First Monday</em> 2 (9). https://doi.org/10.5210/fm.v2i9.548.</li>
                    <li>Weber, Max. (1919) 1946. &ldquo;Politics as a Vocation.&rdquo; In <em>From Max Weber: Essays in Sociology</em>, translated and edited by H. H. Gerth and C. Wright Mills, 77&ndash;128. New York: Oxford University Press.</li>
                    <li>Weber, Max. (1922) 1978. <em>Economy and Society: An Outline of Interpretive Sociology</em>. Edited by Guenther Roth and Claus Wittich. Berkeley: University of California Press.</li>
                    <li>Werbach, Kevin, and Nicolas Cornell. 2017. &ldquo;Contracts Ex Machina.&rdquo; <em>Duke Law Journal</em> 67 (2): 313&ndash;382. https://scholarship.law.duke.edu/dlj/vol67/iss2/2/.</li>
                    <li>Williamson, Oliver E. 1983. &ldquo;Credible Commitments: Using Hostages to Support Exchange.&rdquo; <em>American Economic Review</em> 73 (4): 519&ndash;540. https://www.jstor.org/stable/1816557.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider a seller and a buyer who have never met, in two jurisdictions whose courts do not recognize each other&rsquo;s judgments. The buyer will pay <Math>{"P"}</Math> for goods the seller ships. Neither can sue the other at a cost below <Math>{"P"}</Math>, neither knows the other&rsquo;s history, and neither will trade with the other again. On the dominant tradition&rsquo;s account, from Hobbes on (Section 3), this promise is unenforceable.
                </p>
                <PaperRun title="The claim.">
                    Coercion is a variable, not a constant: in priceable, bilateral, voluntary commerce between parties beyond each other&rsquo;s coercive reach, bonds locked at consent exercise neither its forcing nor its authority component, performance being each party&rsquo;s best reply to the others&rsquo; plans. The question of legitimate coercion is therefore vacated there, and it keeps its full urgency over a smaller domain.
                </PaperRun>
                <p>
                    The claim moves past a tradition that reads law as texts paired with a coercive apparatus. The apparatus compels performance when a party would not otherwise perform, and it punishes breach to deter the next one. Its ground is the sovereign&rsquo;s monopoly on legitimate violence within a territory (Weber [1919] 1946). Its standing capacity does the work even when it is never invoked, because the threat of enforcement is what makes the texts effective. A nearer prior is the argument that contracts executed as code take over work that enforcement does (Szabo 1997), which Werbach and Cornell (2017) examine and answer: contract law keeps its remedial role. The claim adds two things to it: Weber&rsquo;s decomposition, under which bonds locked at consent exercise neither power nor authority, and the consequence that the question of legitimate coercion is vacated there rather than answered. Section 2 states the mechanism, which makes the promise above good before the trade, in the slice the argument uses.
                </p>
                <PaperRun title="Premises.">
                    The argument uses ten.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Bonds and resolution.</strong> At commit the buyer locks twice the payment <Math>{"P"}</Math> and each seller twice the cumulative value <Math>{"G"}</Math> through its order, a schedule fixed by both parties&rsquo; signatures. Only the buyer resolves, and one resolution pays every seller and refunds every bond, or resolves nothing. Until then every bond stays locked and no clock runs (Figaro 2026, Definitions 1, 2, 4, 5, and 6; Corollary 1).</li>
                    <li><strong>Payoffs and retention.</strong> A party&rsquo;s payoff counts what the bonds and payments move and credits what it retains off the chain at the value the parties signed. A seller that holds out is credited at most <Math>{"G"}</Math> (Figaro 2026, Definition 7).</li>
                    <li><strong>The equilibrium.</strong> Comparisons (a) to (c) of Section 2 hold jointly. After performance resolving is the buyer&rsquo;s strict best reply, and given the buyer&rsquo;s plan and its co-sellers&rsquo; performance, performing is each seller&rsquo;s (Figaro 2026, Theorems 1 and 3).</li>
                    <li><strong>No exit.</strong> Commit and resolve are the only operations that move a bond (stipulated: the mechanism&rsquo;s definition). The substrate executes the two operations as written, no party holding an admin, pause, or upgrade power over them (stipulated). An exit from the bonded state would change the game the equilibrium was derived for (Figaro 2026, Theorem 2).</li>
                    <li><strong>Remoteness.</strong> The parties are beyond each other&rsquo;s coercive reach. Within reach a party has a channel outside the game entirely, and coercion can replace the bond (Figaro 2026, Standing Assumptions).</li>
                    <li><strong>Power and authority.</strong> <em>Macht</em> is the chance of carrying out one&rsquo;s will in a social relationship despite resistance; <em>Herrschaft</em> is the chance that a command will be obeyed (Weber [1922] 1978). The question of legitimacy arises only where power or authority is exercised (stipulated).</li>
                    <li><strong>The baseline.</strong> A threat proposes to make the recipient worse off than the normal and expected course of events if it does not comply; an offer proposes to make it better off if it accepts (Nozick 1969).</li>
                    <li><strong>Pre-commitment and the sword.</strong> Pre-commitment is a self-binding move made at consent (Elster 1979). The tradition&rsquo;s alternative is the sword: covenants without it &ldquo;are but words&rdquo; (Hobbes 1651, chap. 17), laws are commands backed by sanctions (Austin 1832), and sanctions protect voluntary compliance against those who refuse it (Hart 1961). It is swung at breach.</li>
                    <li><strong>Where the bond was held.</strong> In the architectures the legal tradition served, a bond was held by an intermediary or a court, each with authority over it, or was absent (stipulated). Outside that tradition the hostage put it in a fourth hand, the counterparty&rsquo;s (Williamson 1983). The two-sided deposit made defection cost each party more than cooperation (Nakamoto, aceat64, and ribuck 2010), and its smart-contract form put both deposits in no hand with authority, the buyer alone releasing them by confirming receipt (Solidity Team 2015).</li>
                    <li><strong>The domain.</strong> The obligation is (a) priceable in the process&rsquo;s denomination, (b) bilateral or composable into bilateral orders under one buyer, and (c) voluntary at the moment of bonding. It is also (d) specifiable in clauses accepted at consent, and (e) remote in the sense of premise 5 (stipulated).</li>
                </ol>
                <PaperRun title="Steps.">
                    The argument runs in nine named steps, in the order the paper takes them.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Unbundling the sword.</strong> By premises 6 and 8 the tradition&rsquo;s sword joins two things, power and authority, and the sword Austin and Hart analyze presupposes the authority (Section 3).</li>
                    <li><strong>Every holder held authority.</strong> By premise 9, every hand that held the bond in the architectures the legal tradition served held authority over it, and the smart-contract form of the two-sided deposit is where coercion varied, in one bilateral exchange (Section 3).</li>
                    <li><strong>Removing the hand.</strong> By premises 1, 4, and 9 no one holds the bond with a decision over it: its payouts are fixed by the signatures at consent, and the one decision left is the buyer&rsquo;s resolution, against its own bond (Section 3).</li>
                    <li><strong>Neither <em>Macht</em> nor <em>Herrschaft</em>.</strong> By premises 1, 2, 3, and 6 no will is carried out against a holdout&rsquo;s resistance and no command is obeyed, so the mechanism exercises neither component of coercion (Section 3).</li>
                    <li><strong>Offer, not threat.</strong> By premise 7 and comparison (a) of premise 3, the proposal to trade under bonds is an offer, and a buyer&rsquo;s threat never to resolve is not credible after performance (Section 4).</li>
                    <li><strong>Pre-commitment, not retribution.</strong> By premises 1 and 8 the bond binds at consent, from the party&rsquo;s own resources, so it substitutes pre-commitment for retribution (Section 4).</li>
                    <li><strong>The reach condition.</strong> By premise 5, within reach a party can coerce outside the game, so what Steps 3 to 6 establish of the mechanism shows that no coercion is exercised in the trade only between remote parties (Section 5).</li>
                    <li><strong>The boundary.</strong> By premise 10 the substitution reaches priceable, bilateral, voluntary, clause-specifiable obligations between remote parties, and nothing outside them (Section 6).</li>
                    <li><strong>Vacated here, narrowed elsewhere.</strong> By premise 6 and Steps 4 and 8, where the domain holds no coercion is exercised and its legitimacy is not in question; elsewhere the question keeps its full urgency over a smaller domain (Section 7 and Section 8).</li>
                </ol>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 9, coercion is a variable, not a constant: in priceable, bilateral, voluntary commerce between parties beyond each other&rsquo;s coercive reach, bonds locked at consent exercise neither its forcing nor its authority component, performance being each party&rsquo;s best reply to the others&rsquo; plans. The question of legitimate coercion is vacated there and keeps its full urgency over a smaller domain.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is false if either of two things is shown. The first is an operation or payoff of the bonded game by which, between parties beyond each other&rsquo;s coercive reach, a party&rsquo;s performance or resolution is obtained against its best reply. A transfer reaching a holdout&rsquo;s bond or retention would be one, and a command it must obey another. The second is a priceable, bilateral, voluntary, clause-specifiable trade between remote parties in which universal performance, with resolution once performance has occurred, is not an equilibrium of the bonded game.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim covers priceable, bilateral, voluntary, clause-specifiable obligations between parties beyond each other&rsquo;s coercive reach, in normal application, as an equilibrium proved under the bonding game&rsquo;s assumptions and not as an observation. Performance is each seller&rsquo;s best reply given the buyer&rsquo;s plan and its co-sellers&rsquo; performance, and the profile in which a buyer resolves regardless is a second equilibrium the claim does not cover. Whether a performance met the agreement stays with the parties and outside forums, whose rulings reach a party through its own law. Criminal harm, externality, public goods, status, rights, defense, fraud, systemic risk, and the exception stay with the sovereign; a trade within reach falls outside the claim.
                </PaperRun>
                <PaperRun title="The reading of coercion.">
                    We read coercion in Nozick&rsquo;s sense throughout, by the baseline test that separates threats from offers (Nozick 1969); Section 7 reads it in Pettit&rsquo;s (1997) republican sense.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Mechanism">
                <p>
                    A <em>process</em> is one buyer&rsquo;s trade with one or more sellers, run through a set of smart contracts that we call the Core. A smart contract is a program that executes exactly as deployed on a public chain: a shared ledger that any party can read and write to, kept by a network that no single party runs. Each <em>order</em> in a process is one commitment between the buyer and one seller, signed by both. The commitment carries the payment, the seller&rsquo;s cumulative value, the denomination, and a fingerprint of the agreement. The <em>denomination</em> is the one token in which every payment and bond of the process is counted, and the parties name it in what they sign. A token is a transferable unit whose balances a contract on the chain keeps.
                </p>
                <p>
                    Each party acts through a <em>wallet</em> (an account a private key controls, through which a party signs and holds tokens). The <em>agreement</em> is the order&rsquo;s terms: <em>clauses</em>, each one reusable term published for anyone to compose, filled with the particulars of this trade. The chain holds the agreement&rsquo;s fingerprint, never its text, and it never tests whether performance occurred.
                </p>
                <p>
                    The mechanism is two compositions. <em>Asymmetric bonding</em> acts at commit: the buyer locks <Math>{"2P"}</Math>, the payment traveling inside it, and each seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the cumulative value through its order, its own payment included. The schedule is fixed by the parties&rsquo; signatures, never by a report taken afterwards. <em>Buyer dominance with atomic resolution</em> acts at the end: only the buyer can resolve, and one call resolves every order of the process or none. Resolution pays every seller its payment and refunds every bond to the party that posted it, each seller&rsquo;s whole and the buyer&rsquo;s less the payments it carried. Until the buyer resolves, every bond stays locked, the performing sellers&rsquo; included, and no clock runs. A buyer that never resolves, by choice or by a lost key, leaves them locked, which is the deterrent&rsquo;s price.
                </p>
                <p>
                    The payoffs count two things: what the Core moves, and what a party retains off the chain, credited at the value the parties signed. For one order, where <Math>{"G = P"}</Math>, the buyer&rsquo;s and the seller&rsquo;s positions are:
                </p>
                <Math display>{"\\begin{array}{l|cc} & \\text{resolution} & \\text{no resolution} \\\\ \\hline \\text{performance} & (0,\\ +P) & (-P,\\ -2G) \\\\ \\text{no performance} & (-P,\\ \\le P+G) & (-2P,\\ \\le -G) \\end{array}"}</Math>
                <p>
                    For the buyer and seller of Section 1, the bonds are <Math>{"2P"}</Math> each, and each is out <Math>{"P"}</Math> or more by defecting. The doubling is what the retention term requires. A seller that holds out keeps at most <Math>{"G"}</Math>, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7); at <Math>{"2G"}</Math> the holdout is out <Math>{"G"}</Math>. A buyer that never resolves keeps the goods, worth <Math>{"P"}</Math>, against a locked <Math>{"2P"}</Math>, and is out <Math>{"P"}</Math>. Each bond is its own party&rsquo;s deterrent against its own defection.
                </p>
                <PaperRun title="The equilibrium.">
                    Cooperation is an equilibrium, verified by three comparisons of one structure. (a) After performance, the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to never resolving, at <Math>{"-P"}</Math>; this needs no assumption about the seller. (b) Given (a) and the buyer&rsquo;s plan, to resolve once performance has occurred and not before, the seller strictly prefers performing, at <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. (c) Given (b), before performance the buyer keeps the process open rather than resolving at once, which would leave it at <Math>{"-P"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best-response checks against one profile, and they hold jointly: a fixed point, not a chain of steps. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026, Theorems 1 and 3).
                </PaperRun>
                <p>
                    With several sellers, each bonds twice the cumulative value at its own order, which is what scales the deterrent along the process chain. Atomic resolution then makes one seller&rsquo;s holdout keep every co-seller&rsquo;s bond locked, which gives co-sellers reason to press it. A process carries as many orders as the chain resolves in one call.
                </p>
                <PaperRun title="Disputes, remedies, and forums.">
                    The Core admits two operations that move a bond, commit and resolve, and no exit from the bonded state. An exit would either hand a decision over a bond to a party that posted none, or add an alternative at a node where the equilibrium weighs exactly two. Either changes the game the equilibrium was derived for, and the equilibrium does not carry over by inheritance (Figaro 2026, Theorem 2). A disagreement about whether performance met the agreement is decided between the parties while the process stands open, and any remedy is made before the buyer resolves. Resolution is terminal acceptance; a payment is never reversed. An outside forum may rule on the process&rsquo;s data, but it cannot call resolve or reach a bond: it rules, and the buyer resolves.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Coercion as a Substrate Variable">
                <p>
                    We call the architecture through which a commitment is made good the <em>substrate</em>. A <em>substrate variable</em> is a feature of it that a tradition has held constant because the architectures it served did not let it vary. Coercion is our case. The claim is that both its components, in a distinction of Weber&rsquo;s set out below, can be set to zero in bilateral commerce between parties beyond each other&rsquo;s coercive reach.
                </p>
                <PaperRun title="Coercion in the dominant tradition.">
                    Austin (1832) defined laws as commands of a sovereign backed by sanctions; an obligation without a sanction is, for him, a moral injunction rather than a legal one. Hart (1961) separated primary rules of obligation from secondary rules of recognition, change, and adjudication, and denied that all law works by sanction. He kept sanctions all the same, as the protection owed to voluntary compliance against those who refuse it. Hobbes (1651, chap. 17) supplied the justification upstream: &ldquo;covenants, without the sword, are but words, and of no strength to secure a man at all.&rdquo;
                </PaperRun>
                <PaperRun title="Power and authority.">
                    Weber ([1922] 1978) separates two things the tradition&rsquo;s sword joins. <em>Macht</em> (power) is the chance of carrying out one&rsquo;s will in a social relationship despite resistance. <em>Herrschaft</em> (domination, or authority when legitimate) is the chance that a command will be obeyed, which requires a relationship of command and obedience. Weber ([1919] 1946) names three pure grounds on which such rule is held legitimate: tradition, charisma, and legality. The sword Austin and Hart analyze is <em>Herrschaft</em>-shaped, because it presupposes the sovereign&rsquo;s recognized authority to use the force, not only the force.
                </PaperRun>
                <p>
                    Commercial law inherits that shape. Specific performance and damages rely on the state&rsquo;s capacity to compel a transfer, and the standing threat of those remedies keeps contracts effective when they are not invoked. Williamson&rsquo;s (1985) transaction-cost analysis treats the cost of using courts as one cost the firm may economize on, and it assumes courts remain the residual enforcer. That residual is unevenly available. Cross-border trade meets choice-of-law and choice-of-forum costs that often exceed the trade&rsquo;s value, and parties whose courts do not recognize each other&rsquo;s judgments have no effective remedy. Parties without legal personality where the counterparty can sue, or whose identity is hard to establish, are served no better. Intermediaries such as merchant houses, factors, and banks, and extralegal devices such as reputation, have served these cases, in the shadow of the residual state option.
                </p>
                <PaperRun title="Why coercion was a constant.">
                    Under the architectures the legal tradition served, a bond posted to secure a promise was held by one of three hands. Held by an intermediary who decided whom to pay, the intermediary&rsquo;s discretion was the coercive mechanism, relocated. Held by a court, the court&rsquo;s standing capacity was the coercive mechanism, made explicit. Absent, the obligation went unenforced and the parties bore the risk. On those architectures the tradition was right: some coercive backstop was structurally necessary, because every hand that held the bond held authority over it.
                </PaperRun>
                <PaperRun title="Where it varied.">
                    Two lines outside the tradition placed the bond elsewhere. Williamson&rsquo;s (1983) hostage puts it in a fourth hand, the counterparty&rsquo;s, whose holder is tempted to expropriate it. The two-sided deposit has both parties deposit more than the trade is worth, so that defection costs each more than cooperation. In the thread that stated it the deposits still sat with an intermediary that held them or an agreed arbitrator (Nakamoto, aceat64, and ribuck 2010). Its smart-contract form puts them in no hand with authority: the contract holds both, and the buyer alone releases them by confirming receipt (Solidity Team 2015). That form let coercion vary, in one bilateral exchange.
                </PaperRun>
                <p>
                    The bonded mechanism keeps that form&rsquo;s answer and carries it to every order of a process under one buyer. The bond is held by the mechanism, whose payouts were fixed in the signatures at consent, and the one decision left after consent is the buyer&rsquo;s choice of whether and when to resolve. No party is forced. A seller that holds out keeps what it retains; its bond stays locked and reaches no one, so the holdout is priced, never overpowered.
                </p>
                <p>
                    Neither component is exercised. Not <em>Macht</em>: no will is carried out against the seller&rsquo;s resistance, and the mechanism moves nothing when it resists. Not <em>Herrschaft</em>: no one issues the seller a command; what it performs is the term it signed at consent, and the buyer&rsquo;s plan adds nothing to it. Weber counts obedience from interest as obedience, so the case rests on the absence of a command, not on the motive. On Nozick&rsquo;s baseline test the bond is an offer, not a threat (Section 4).
                </p>
                <PaperRemark title="Is the buyer the new sovereign?">
                    Does the buyer&rsquo;s decision simply relocate <em>Herrschaft</em> to the buyer? It does not, for three reasons. The buyer&rsquo;s decision is binary, resolve or not, and cannot change any amount or redirect any payment, which the signatures fixed at consent. The buyer&rsquo;s own <Math>{"2P"}</Math> stays locked under every refusal, so withholding after performance costs the buyer <Math>{"P"}</Math>, by comparison (a). And the buyer holds the decision as a party to the trade, by the terms the seller signed, not as an authority recognized over the seller beyond it. The intermediary of the prior architectures decided over a bond it had not posted; the buyer decides with its own bond beside the seller&rsquo;s.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Pre-commitment Instead of Retribution">
                <p>
                    The bond is <em>pre-commitment</em> in Elster&rsquo;s (1979) sense, a self-binding move, here made at the moment of consent, that takes the place of enforcement during performance, making performance each party&rsquo;s best reply instead. Each party locks its own bond, from its own resources, by its own signature, and both can verify the amounts before signing. Pre-commitment differs from retribution in three structural ways. It binds at consent rather than at breach: the binding occurs when the parties agree, not when one of them tries to deviate. The binding resource is the party&rsquo;s own, posted voluntarily, rather than the sovereign&rsquo;s capacity to apply force. And the one decision left after consent is held by a party to the trade, the buyer, against its own bond.
                </p>
                <PaperRun title="Hobbes&rsquo;s covenant without the sword.">
                    Hobbes&rsquo;s remark, quoted in Section 3, identifies the problem the tradition has answered since 1651 by building and legitimating sovereign apparatuses. The bonded mechanism answers it otherwise. Here the covenant arrives without the sword: each party&rsquo;s own bond makes performance the better reply, by a prospect of loss the party posted itself rather than by force. The challenge is met in bilateral commerce between remote parties and only there; we do not claim it is met elsewhere.
                </PaperRun>
                <PaperRun title="Is this coercion under a friendlier name?">
                    The objection runs: a holdout&rsquo;s bond stays locked against its preference, and that is coercive in the ordinary sense. Nozick (1969) answers it with a baseline, the normal and expected course of events. A threat proposes to make the recipient&rsquo;s position worse than that baseline if it does not comply; an offer proposes to make it better if it accepts. The proposal to trade under bonds is an offer: a party that refuses it stays where it stood, and a party that accepts gains a trade it could not otherwise make. A buyer&rsquo;s threat never to resolve unless the seller concedes is not credible once the seller has performed: by comparison (a), carrying it out costs the buyer <Math>{"P"}</Math>. What is left is a locked bond the party itself signed, not a condition another agent can credibly attach to its compliance. That is the ordinary structure of voluntary commerce, and it differs in kind from a sovereign&rsquo;s capacity to apply force to a party who never consented.
                </PaperRun>
                <PaperRemark title="On the limit of the claim.">
                    The distinction between pre-commitment and retribution is structural, not ethical. We do not claim pre-commitment is morally superior; that is a normative question on which the mechanism takes no position. The two differ in agent, timing, and relation to consent, and so they call for different political-philosophical analyses.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Distance Decides Whether the Bond Can Do the Work">
                <p>
                    Whether the bond can do the work depends on the <em>social distance</em> between the parties, along three dimensions. Geographic distance removes in-person renegotiation, local intermediaries, and, at the limit, direct physical compulsion. Jurisdictional distance removes a shared sovereign&rsquo;s courts, damages, and fraud sanctions, or prices them beyond the trade; parties under sovereigns that do not recognize each other&rsquo;s judgments, or under none, lack the apparatus entirely. Identity distance removes reputation: strangers with no shared community and no prior dealing have no future standing to lose.
                </p>
                <p>
                    Within reach, coercion can replace the bond, and the payoffs price no such channel. A party who can reach the buyer can force it to call resolve, or keep it from calling. A party who can reach a seller can force its performance or its holdout, and by atomic resolution a forced holdout keeps every co-seller&rsquo;s bond locked. Each party&rsquo;s own state reaches it in this way, which is how a forum&rsquo;s ruling reaches a party through its own law: it acts on a party, never on a bond.
                </p>
                <p>
                    At high distance on all three, no such channel exists and the bond does the work alone; its existence is then the difference between a trade and no trade. The decisive cases are those prior architectures could not serve. They are cross-border commerce with no shared sovereign, exchange between parties whose identities cannot be established, trade between software agents, and commerce by people who lack legal personality anywhere the counterparty can sue. This is a structural observation about where the mechanism does decisive work, not a prediction of where it will be adopted.
                </p>
                <PaperRemark title="Is the claim circular?">
                    Is the claim circular, since remote parties cannot coerce each other anyway? It is not. Remoteness removes coercion&rsquo;s availability, and on the tradition&rsquo;s account it thereby removes the promise: between such parties a covenant is but words (Section 1). The claim is that the promise holds there all the same, as each party&rsquo;s best reply, so coercion is not the condition of a good promise. Within reach the bond still makes performance a best reply; what cannot be claimed there is that no coercion is exercised.
                </PaperRemark>
                <PaperRemark title="Is the bond stronger at distance?">
                    A common intuition holds that the bond&rsquo;s incentives are stronger at distance and weaker in proximity. The incentives do not change with distance: the schedule is twice the payment and twice the cumulative value everywhere. What distance changes is whether a channel outside the game exists.
                </PaperRemark>
                <PaperRemark title="Who can post the bond?">
                    Does locking twice the payment, and twice the cumulative value, put the mechanism out of reach of the parties it serves at distance? The bond asks for tokens, never for standing: no legal personality, identity, or history is needed to post it. Each bond is refunded at resolution, the buyer&rsquo;s less the payment it carried. Its price is therefore the time value of the bonded tokens over the process&rsquo;s duration, plus the network&rsquo;s gas (its charge for executing a call) for the commit of each order and the one resolution. A party that does not yet hold the tokens cannot yet bond, and the schedule is the same for every party.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. The Boundary: What Shrinks, What Stays">
                <PaperRun title="Inside the boundary.">
                    The bonded mechanism substitutes for coercion in obligations that meet the five conditions of Section 1&rsquo;s premise 10. Conditions (a) to (d) cover the ordinary forms of commerce: sale of goods, services, delivery, payment, and representations against measurable standards. For these obligations the mechanism makes performing each party&rsquo;s best reply to the other&rsquo;s plan, by the comparisons of Section 2, without an external coercive backstop.
                </PaperRun>
                <p>
                    The work of the regulatory apparatus adjacent to enforcement likely narrows to what bonding leaves untouched. Antitrust regimes constrain intermediaries with market power; where no intermediary holds the bond, that regime has less to act on. Cross-border dispute regimes choose between sovereign apparatuses; where the bond makes the obligation good before the trade, that choice governs only the questions Section 8 leaves to outside forums.
                </p>
                <p>
                    Consumer-protection regimes answer an information asymmetry between seller and buyer, and the seller&rsquo;s <em>attestations</em> narrow it: statements it signs, while the process is open, about a clause of its agreement, whose truth the chain never checks. What makes one worth relying on is its cost to the seller: the buyer may withhold resolution, at the price of its own bond, until a false claim is put right. After resolution the claim stays in the public data. That discipline reaches each signer, not parties acting together. Each regime also addresses concerns the change leaves untouched: systemic risk, fraud, market manipulation.
                </p>
                <PaperRun title="Outside the boundary.">
                    The mechanism cannot substitute where the obligation is non-priceable, non-bilateral, or non-voluntary. Violence against a person cannot be made commensurable with a sum in a way that captures the violation. Third parties harmed by an externality are not parties to the bond. And a party that harms without consent posted no bond at the moment of harm. These cases include criminal harm, large environmental externality, public goods under free riding, status questions such as citizenship and legal personality, fundamental rights adjudication, and defense of the territory. Here the conditions for the mechanism are absent, and substituting a bond for the sovereign would require the substitution itself to be sovereign-backed, which is no substitution.
                </PaperRun>
                <p>
                    The boundary is structural, set by the conditions under which bonded pre-commitment operates, not by a moral or political choice. It moves as clauses are written for obligations not yet priceable in practice. Its structural limits do not move: non-consent at the moment of harm, externality on non-parties, and the non-priceability of certain violations are categorical. The state&rsquo;s coercive apparatus is bounded rather than made unnecessary.
                </p>
                <PaperRemark title="Where do straddling regimes fall?">
                    Some regimes straddle the boundary. Securities regulation is one: part of it targets intermediaries and shrinks, part prices systemic risk to non-parties and stays, part defines status categories such as qualified investors and stays. Sorting a given regime&rsquo;s functions is an empirical exercise. The structural claim is narrower: the boundary is real, and a contested case falls on one side or the other on structural grounds, not political ones.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. The Democratic-Republican Apparatus: Narrowed, Not Reformed">
                <PaperRun title="Subtraction, not reform.">
                    Constitutional democracies exercise power through four levers: legislation, executive enforcement, adjudication, and the franchise. Each has its characteristic abuse. Regulatory capture is analyzed by Stigler (1971). The executive&rsquo;s limit case is the decision on the exception that Schmitt ([1922] 1985) placed at the core of sovereignty. Adjudication drifts, the franchise is manipulated, and organized groups lobby across all four (Olson 1965).
                </PaperRun>
                <p>
                    The bonded mechanism corrects none of these. Capture continues wherever regulation does, and judicial drift wherever courts adjudicate. What changes is the domain: where bonds make bilateral obligations good before the trade, legislators likely have fewer rules to write, courts fewer cases to hear, and the executive less to enforce. The work of constraining the levers continues, over a smaller domain.
                </p>
                <PaperRun title="Freedom as non-domination.">
                    Pettit (1997) reads liberty as the absence of a <em>capacity</em> for arbitrary interference, not merely of interference in fact, and the test is sharper here than Nozick&rsquo;s. No third party holds such a capacity inside the mechanism: not a manager, a foundation, or a court, which may rule on the process&rsquo;s data but cannot reach a bond (Section 2). A counterparty&rsquo;s reach over the buyer would be one such capacity outside the mechanism, and remoteness excludes it. The buyer&rsquo;s own state keeps its reach, which acts through the buyer&rsquo;s law (Section 8), never on a bond. The buyer does hold one: it can withhold resolution indefinitely, and a buyer willing to lose <Math>{"P"}</Math> can keep a performing seller at <Math>{"-2G"}</Math> rather than <Math>{"+P"}</Math>. That capacity is not arbitrary in Pettit&rsquo;s sense, for the three reasons of Section 3. The seller signed the terms that grant it, it ranges over one binary decision that changes no amount, and it is used only at the price of the buyer&rsquo;s own locked bond.
                </PaperRun>
                <p>
                    No seller can resolve. A seller does hold one capacity: to hold out, and so keep its co-sellers&rsquo; bonds locked. It holds it on terms each co-seller accepted when it committed into the process, and uses it only at the price of its own bond. By comparison (b), a holdout ends at most at <Math>{"-G"}</Math> against <Math>{"+P"}</Math> for performing. This is the same structure as the buyer&rsquo;s. What the architecture removes is every unbonded position from which interference could be exercised. The capacities it leaves are held by bonded parties, each bound by its own bond.
                </p>
                <p>
                    A democratic-republican order&rsquo;s other justifications are independent of its coordinating role in commerce: legitimating coercion, protecting rights against arbitrary authority, collective self-determination (Pettit 1997, 2012), and adjudicating among competing visions of the good. The change leaves them untouched. Only the coordinating function shrinks.
                </p>
            </PaperSection>

            <PaperSection title="8. Who Decides the Exception?">
                <p>
                    Schmitt ([1922] 1985) argues that any rule-system requires an extralegal decision on the exception, and that the sovereign is whoever decides whether a case is a normal application of the rules. Taken as a rule-system, the bonded mechanism would on his account need a sovereign to decide when it does not apply. Our response is that it is not a rule-system in his sense. It runs where its conditions hold and is silent where they do not. Whether a commitment was procured under duress, whether an outcome violates public policy, whether a party lacked capacity: the mechanism decides none of these. They are decided, where they are decided at all, by outside forums applying their own constitutional and doctrinal apparatus to the process&rsquo;s data as evidence.
                </p>
                <p>
                    The challenge therefore lands, at a different level than Schmitt intended. The mechanism cannot decide its own exceptions, which is why the exception stays with outside forums and why our claim covers bilateral commerce in normal application. A forum&rsquo;s ruling reaches the parties through their own law (Section 5). The mechanism has no authority to extend itself and none to retract itself, and that is what makes its coexistence with conventional sovereignty architectural rather than negotiated.
                </p>
            </PaperSection>

            <PaperSection title="9. Conclusion">
                <p>
                    Coercion has been load-bearing in the tradition&rsquo;s account of commercial enforcement because every architecture the tradition served bundled the forcing of performance with an authority that held the bond. Bonds locked at consent, under a resolution only the buyer can make and only against its own bond, need neither in priceable, bilateral, voluntary commerce between parties beyond each other&rsquo;s reach. There performance is each party&rsquo;s best reply to the others&rsquo; plans. The question of legitimate coercion is vacated there rather than answered, and elsewhere it keeps its full force over a smaller domain. The mechanism itself takes no political position: the positions live in the terms the parties compose over it and select. The tradition is not refuted; the place where its central question must be answered has moved.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

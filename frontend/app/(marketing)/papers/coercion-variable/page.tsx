import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun, PaperRemark } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Coercion Variable — Figaro Protocol",
    description:
        "Bonds the parties lock at consent enforce bilateral commerce by themselves: the only decision left after consent is the buyer's resolution, made against its own locked bond. Coercion becomes a variable of the enforcement architecture, and the question of legitimate coercion moves to a bounded domain.",
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
                        From Austin and Hobbes through Weber and Hart, the dominant tradition of legal philosophy has paired law&rsquo;s texts with a coercive apparatus that compels performance or punishes breach. We examine a mechanism that enforces bilateral commercial obligations with no such apparatus. Each party locks a bond at the moment of consent: the buyer twice the payment, each seller twice the value accumulated through its order. Only the buyer can resolve, and resolution pays every seller and refunds every bond at once; until then every bond stays locked, without timeout. Credited with whatever it retains, a seller that holds out is still worse off than one that performs. Performing is therefore each seller&rsquo;s best reply to the buyer&rsquo;s plan to resolve once performance has occurred and not before, and after performance resolving is the buyer&rsquo;s best reply, with no assumption about the seller.
                    </p>
                    <p>
                        The mechanism is a pre-commitment structure in Elster&rsquo;s sense, and on Nozick&rsquo;s baseline test its bonds are offers, not threats. The one decision it leaves after consent is the buyer&rsquo;s, exercised against the buyer&rsquo;s own locked bond. We argue that coercion thereby becomes a variable of the enforcement architecture, and that its authority component can be set to zero in priceable, bilateral, voluntary commerce. Criminal harm, externalities, public goods, status, rights, and defense stay with the sovereign. The question of legitimate coercion is not answered; the domain over which it must be answered is narrowed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Austin, John. 1832. <em>The Province of Jurisprudence Determined</em>. London: John Murray.</li>
                    <li>Elster, Jon. 1979. <em>Ulysses and the Sirens: Studies in Rationality and Irrationality</em>. Cambridge: Cambridge University Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Hart, H. L. A. 1961. <em>The Concept of Law</em>. Oxford: Clarendon Press.</li>
                    <li>Hobbes, Thomas. 1651. <em>Leviathan, or The Matter, Forme, and Power of a Common-Wealth Ecclesiasticall and Civill</em>. London: Andrew Crooke.</li>
                    <li>Nozick, Robert. 1969. &ldquo;Coercion.&rdquo; In <em>Philosophy, Science, and Method: Essays in Honor of Ernest Nagel</em>, edited by Sidney Morgenbesser, Patrick Suppes, and Morton White, 440&ndash;472. New York: St. Martin&rsquo;s Press.</li>
                    <li>Olson, Mancur. 1965. <em>The Logic of Collective Action: Public Goods and the Theory of Groups</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Pettit, Philip. 1997. <em>Republicanism: A Theory of Freedom and Government</em>. Oxford: Oxford University Press.</li>
                    <li>Pettit, Philip. 2012. <em>On the People&rsquo;s Terms: A Republican Theory and Model of Democracy</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9781139017428.</li>
                    <li>Schmitt, Carl. (1922) 1985. <em>Political Theology: Four Chapters on the Concept of Sovereignty</em>. Translated by George Schwab. Cambridge, MA: MIT Press.</li>
                    <li>Stigler, George J. 1971. &ldquo;The Theory of Economic Regulation.&rdquo; <em>Bell Journal of Economics and Management Science</em> 2 (1): 3&ndash;21. https://doi.org/10.2307/3003160.</li>
                    <li>Weber, Max. (1919) 1946. &ldquo;Politics as a Vocation.&rdquo; In <em>From Max Weber: Essays in Sociology</em>, translated and edited by H. H. Gerth and C. Wright Mills, 77&ndash;128. New York: Oxford University Press.</li>
                    <li>Weber, Max. (1922) 1978. <em>Economy and Society: An Outline of Interpretive Sociology</em>. Edited by Guenther Roth and Claus Wittich. Berkeley: University of California Press.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider a seller and a buyer who have never met, in two jurisdictions whose courts do not recognize each other&rsquo;s judgments. The buyer will pay <Math>{"P"}</Math> for goods the seller ships. Neither can sue the other at a cost below <Math>{"P"}</Math>, neither knows the other&rsquo;s history, and neither will trade with the other again. On the dominant tradition&rsquo;s account, from Hobbes on (Section 3), this promise is unenforceable.
                </p>
                <p>
                    That tradition reads law as texts paired with a coercive apparatus. The apparatus compels performance when a party would not otherwise perform, and it punishes breach to deter the next one. Its ground is the sovereign&rsquo;s monopoly on legitimate violence within a territory (Weber [1919] 1946). Its standing capacity does the work even when it is never invoked, because the threat of enforcement is what makes the texts effective. In commerce it is the guarantor of last resort, under which reputation, repeated dealing, and social pressure all operate. This paper examines a mechanism under which the trade above enforces itself, and asks what it does to that tradition. The mechanism is stated in Section 2 in the slice the argument uses.
                </p>
                <p>
                    The thesis runs in five steps. First, coercion has been a structural constant of commercial enforcement only because no available architecture let it vary. Second, the bonded mechanism keeps coercion&rsquo;s forcing component and sets its authority component to zero, by substituting pre-commitment for retribution. Third, the substitution does not reach criminal harm, externality, public goods, status, rights, or defense. Fourth, where it applies, the question of how to legitimate coercive power is not answered but vacated: no authority is exercised, so the legitimacy of authority is not in question. Fifth, where it does not apply, the question keeps its full urgency over a smaller domain.
                </p>
                <PaperRun title="The reading of coercion.">
                    We read coercion in Nozick&rsquo;s sense throughout, by the baseline test that separates threats from offers (Nozick 1969). A republican reader, for whom freedom is the absence of a capacity for arbitrary interference (Pettit 1997), gets that reading on its own terms once, in Section 7. The two readings agree on the structural fact and differ on its description, and Section 7 says where. The paper takes no position on the size or form of the state. Those questions survive the change, in the domain where coercion stays load-bearing.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Mechanism">
                <p>
                    A <em>process</em> is one buyer&rsquo;s trade with one or more sellers, run through a set of smart contracts that we call the Core. A smart contract is a program that executes exactly as deployed on a public chain: a shared ledger that any party can read and write to, kept by a network that no single party runs. Each <em>order</em> in a process is one commitment between the buyer and one seller, signed by both. The commitment carries the payment, the seller&rsquo;s cumulative value, the denomination, and a fingerprint of the agreement. The <em>denomination</em> is the one token (a transferable unit whose balances a contract on the chain keeps) in which every payment and bond of the process is counted, and the parties name it in what they sign.
                </p>
                <p>
                    Each party acts through a <em>wallet</em> (an account a private key controls, through which a party signs and holds tokens). The <em>agreement</em> is the order&rsquo;s terms: <em>clauses</em>, each one reusable term published for anyone to compose, filled with the particulars of this trade. An <em>assembly</em> is a reusable design of a process, registered agreements composed in order; its <em>designer</em> is the wallet that writes and registers it. The chain holds the agreement&rsquo;s fingerprint, never its text, and it never tests whether performance occurred.
                </p>
                <p>
                    The mechanism is two compositions. <em>Asymmetric bonding</em> acts at commit: the buyer locks <Math>{"2P"}</Math>, the payment traveling inside it, and each seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the cumulative value through its order, its own payment included. The schedule is fixed by the parties&rsquo; signatures, never by a report taken afterwards. <em>Buyer dominance with atomic resolution</em> acts at the end: only the buyer can resolve, and one call resolves every order of the process or none. Resolution pays every seller its payment and refunds every bond to the party that posted it, each seller&rsquo;s whole and the buyer&rsquo;s less the payments it carried. Until the buyer resolves, every bond stays locked, the performing sellers&rsquo; included, and no clock runs.
                </p>
                <p>
                    The payoffs count two things: what the Core moves, and what a party retains off the chain, credited at the value the parties signed. For one order, where <Math>{"G = P"}</Math>, the buyer&rsquo;s and the seller&rsquo;s positions are:
                </p>
                <Math display>{"\\begin{array}{l|cc} & \\text{resolution} & \\text{no resolution} \\\\ \\hline \\text{performance} & (0,\\ +P) & (-P,\\ -2G) \\\\ \\text{no performance} & (-P,\\ \\le P+G) & (-2P,\\ \\le -G) \\end{array}"}</Math>
                <p>
                    The doubling is what the retention term requires. A seller that holds out keeps at most <Math>{"G"}</Math>, and a bond equal to that value would be exactly canceled by the taking; at <Math>{"2G"}</Math> the holdout is out <Math>{"G"}</Math>. A buyer that never resolves keeps the goods, worth <Math>{"P"}</Math>, against a locked <Math>{"2P"}</Math>, and is out <Math>{"P"}</Math>. Each bond is its own party&rsquo;s deterrent against its own defection.
                </p>
                <PaperRun title="The equilibrium.">
                    Cooperation is an equilibrium, verified by three comparisons of one structure. (a) After performance, the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to never resolving, at <Math>{"-P"}</Math>; this needs no assumption about the seller. (b) Given (a) and the buyer&rsquo;s plan, to resolve once performance has occurred and not before, the seller strictly prefers performing, at <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. (c) Given (b), before performance the buyer keeps the process open rather than resolving at once, which would leave it at <Math>{"-P"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best-response checks against one profile, and they hold jointly: a fixed point, not a chain of steps. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026).
                </PaperRun>
                <p>
                    With several sellers, each bonds twice the cumulative value at its own order, which is what scales the deterrent along the process chain. Atomic resolution then makes one seller&rsquo;s holdout keep every co-seller&rsquo;s bond locked, which gives co-sellers reason to press it. A process carries as many orders as the chain resolves in one call.
                </p>
                <PaperRun title="Disputes, remedies, and forums.">
                    The Core admits two operations, commit and resolve, and no exit from the bonded state. An exit would either hand a decision over a bond to a party that posted none, or add an alternative at a node where the equilibrium weighs exactly two. Either changes the game the equilibrium was derived for, and the equilibrium no longer carries over (Figaro 2026). A disagreement about whether performance met the agreement is decided between the parties while the process stands open, and any remedy is made before the buyer resolves. Resolution is terminal acceptance; a payment is never reversed. An outside forum may rule on the process&rsquo;s data, but it cannot call resolve or reach a bond: it rules, and the buyer resolves.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Coercion as a Substrate Variable">
                <p>
                    We call the architecture through which commitments are enforced the <em>substrate</em>, and a <em>substrate variable</em> a feature of it that a tradition has held constant because no available architecture let it vary. Coercion is our case. The claim is that its authority component, in a distinction of Weber&rsquo;s set out below, can be set to zero in bilateral commerce while its forcing component is kept.
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
                    Under the architectures available to commerce, a bond posted to secure a promise was held by one of three hands. Held by an intermediary who decided whom to pay, the intermediary&rsquo;s discretion was the coercive mechanism, relocated. Held by a court, the court&rsquo;s standing capacity was the coercive mechanism, made explicit. Absent, the obligation went unenforced and the parties bore the risk. On those architectures the tradition was right: some coercive backstop was structurally necessary, because every hand that held the bond held authority over it.
                </PaperRun>
                <p>
                    The bonded mechanism removes that hand. The bond is held by the Core, whose payouts were fixed in the signatures at consent. The one decision left after consent is the buyer&rsquo;s choice of whether and when to resolve. The forcing work is done: a seller that holds out cannot recover its bond against the buyer&rsquo;s refusal to resolve, whatever its own preference. The forcing kept is <em>Macht</em> in Weber&rsquo;s sense, and without the authority it is not coercion on Nozick&rsquo;s baseline test: the bond that carries it is an offer, not a threat (Section 4). The authority is absent, because no one issues the seller a command, and its performance is its own best reply to the buyer&rsquo;s plan rather than obedience.
                </p>
                <PaperRemark title="Is the buyer the new sovereign?">
                    A referee will ask whether the buyer&rsquo;s decision simply relocates <em>Herrschaft</em> to the buyer. It does not, for three reasons. The buyer&rsquo;s decision is binary, resolve or not, and cannot change any amount or redirect any payment, which the signatures fixed at consent. The buyer&rsquo;s own <Math>{"2P"}</Math> stays locked under every refusal, so withholding after performance costs the buyer <Math>{"P"}</Math>, by comparison (a). And the buyer holds the decision as a party to the trade, by the terms the seller signed, not as an authority recognized over the seller beyond it. The intermediary of the prior architectures decided over a bond it had not posted; the buyer decides with its own bond beside the seller&rsquo;s.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Pre-commitment Instead of Retribution">
                <p>
                    The bond is what Elster (1979) analyzed as <em>pre-commitment</em>: a self-binding move at the moment of consent that takes the place of enforcement during performance. Each party locks its own bond, from its own resources, by its own signature, and both can verify the amounts before signing. Pre-commitment differs from retribution in three structural ways. It binds at consent rather than at breach: the binding occurs when the parties agree, not when one of them tries to deviate. The binding resource is the party&rsquo;s own, posted voluntarily, rather than the sovereign&rsquo;s capacity to apply force. And the one decision left after consent is held by a party to the trade, the buyer, against its own bond.
                </p>
                <PaperRun title="Hobbes&rsquo;s covenant with its own sword.">
                    Hobbes&rsquo;s remark, quoted in Section 3, identifies the problem the tradition has spent nearly four centuries solving by building and legitimating sovereign apparatuses. The bonded mechanism meets it on its own terms: the covenant arrives with its own sword, and the sword is the bond each party has posted. The reading is literal. The sword is a credible prospect of loss whose existence makes performance the rational strategy, and that is what each bond is.
                </PaperRun>
                <p>
                    What changes is who holds it. Under the sovereign&rsquo;s monopoly the sovereign holds the sword and swings it at breach; here each party holds its own, locked in the Core, and the sword never has to be swung. A breach triggers no transfer: the defector&rsquo;s bond stays where it was posted, and so does the buyer&rsquo;s. The challenge is met in bilateral commerce and only there; we do not claim it is met elsewhere.
                </p>
                <PaperRun title="Is this coercion under a friendlier name?">
                    The objection runs: a holdout&rsquo;s bond stays locked against its preference, and that is coercive in the ordinary sense. Nozick (1969) answers it with a baseline, the normal and expected course of events. A threat proposes to make the recipient&rsquo;s position worse than that baseline if it does not comply; an offer proposes to make it better if it accepts. The proposal to trade under bonds is an offer: a party that refuses it stays where it stood, and a party that accepts gains a trade it could not otherwise make. After commit the parties may still propose a remedy, since remedies are made before the buyer resolves. A buyer&rsquo;s threat never to resolve unless the seller concedes is not credible once the seller has performed: by comparison (a), carrying it out costs the buyer <Math>{"P"}</Math>. What is left is a locked bond the party itself signed, not a condition another agent can credibly attach to its compliance. That is the ordinary structure of voluntary commerce, and it differs in kind from a sovereign&rsquo;s capacity to apply force to a party who never consented.
                </PaperRun>
                <PaperRemark title="On the limit of the claim.">
                    The distinction between pre-commitment and retribution is structural, not ethical. We do not claim pre-commitment is morally superior; that is a normative question on which the mechanism takes no position. The two differ in agent, timing, and relation to consent, and so they call for different political-philosophical analyses.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Distance Decides Whether the Bond Is the Only Enforcement">
                <p>
                    Whether the bonded mechanism is the decisive enforcement or one option among several depends on the <em>social distance</em> between the parties, along three dimensions. Geographic distance removes in-person renegotiation, local intermediaries, and, at the limit, direct physical compulsion. Jurisdictional distance removes a shared sovereign&rsquo;s courts, damages, and fraud sanctions, or prices them beyond the trade; parties under sovereigns that do not recognize each other&rsquo;s judgments, or under none, lack the apparatus entirely. Identity distance removes reputation: strangers with no shared community and no prior dealing have no future standing to lose.
                </p>
                <p>
                    At low distance on all three, the parties have a rich menu: physical, sovereign-legal, and reputational. The bond is one option there. At high distance on all three, the alternatives drop away, and the bond is the only enforcement available; its existence is then the difference between a trade and no trade. The decisive cases are those prior architectures could not serve: cross-border commerce with no shared sovereign, exchange between parties whose identities cannot be established, trade between software agents, and commerce by people who lack legal personality anywhere the counterparty can sue. This is a structural observation about where the mechanism does decisive work, not a prediction of where it will be adopted.
                </p>
                <PaperRemark title="Is the bond stronger at distance?">
                    A common intuition holds that the bond&rsquo;s incentives are stronger at distance and weaker in proximity. The incentives do not change with distance: the schedule is twice the payment and twice the cumulative value everywhere. What changes is the menu of competing mechanisms. The bond is exclusive at distance and one of several in proximity.
                </PaperRemark>
                <PaperRemark title="Who can post the bond?">
                    Does locking twice the payment, and twice the cumulative value, put the mechanism out of reach of the parties it serves at distance? The bond asks for tokens, never for standing: no legal personality, identity, or history is needed to post it. Each bond is refunded at resolution, the buyer&rsquo;s less the payment it carried, so its price is the time value of the bonded tokens over the process&rsquo;s duration, plus the network&rsquo;s gas (its charge for executing a call) for the two calls. A party that does not yet hold the tokens cannot yet bond, and the schedule is the same for every party.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. The Boundary: What Shrinks, What Stays">
                <PaperRun title="Inside the boundary.">
                    The bonded mechanism substitutes for coercion in obligations that meet four conditions. They are (a) priceable in a token the parties sign into the commitment as its denomination, (b) bilateral, or composable into bilateral orders under one buyer, (c) voluntary at the moment of bonding, and (d) specifiable in clauses the parties accept at consent. These conditions cover the ordinary forms of commerce: sale of goods, services, delivery, payment, and representations against measurable standards. For these obligations the mechanism makes performing each party&rsquo;s best reply to the other&rsquo;s plan, by the comparisons of Section 2, without an external coercive backstop. Whether a given performance met the agreement is still decided between the parties, or ruled on by an outside forum, while the process stands open.
                </PaperRun>
                <p>
                    The work of the regulatory apparatus adjacent to enforcement likely narrows to what bonding leaves untouched. Antitrust regimes constrain intermediaries with market power; where no intermediary holds the bond, that regime has less to act on. Cross-border dispute regimes choose between sovereign apparatuses; where the obligation enforces itself, that choice governs only the questions Section 8 leaves to outside forums.
                </p>
                <p>
                    Consumer-protection regimes answer an information asymmetry between seller and buyer, and the seller&rsquo;s <em>attestations</em> narrow it: a representation or warranty a seller signs about its order while the process is open. The chain checks that an attestation is signed and bound to its order, never that it is true. What makes it worth relying on is its cost to the seller who signs it: while the process is open, the buyer may withhold resolution, at the price of its own bond, until a false claim is put right. After resolution the claim stays in the public data and in the seller&rsquo;s resolution history. A <em>resolution history</em> is the public summary of the resolved processes a wallet was a party to and the attestations it carries. That discipline reaches each signer; it does not reach parties acting together. Each regime also addresses concerns the change leaves untouched: systemic risk, fraud, market manipulation.
                </p>
                <PaperRun title="Outside the boundary.">
                    The mechanism cannot substitute where the obligation is non-priceable, non-bilateral, or non-voluntary. Violence against a person cannot be made commensurable with a sum in a way that captures the violation. Third parties harmed by an externality are not parties to the bond. And a party that harms without consent posted no bond at the moment of harm. These cases include criminal harm, large environmental externality, public goods under free riding, status questions such as citizenship and legal personality, fundamental rights adjudication, and defense of the territory. Here the conditions for the mechanism are absent, and substituting a bond for the sovereign would require the substitution itself to be sovereign-backed, which is no substitution.
                </PaperRun>
                <p>
                    The boundary is structural, set by the conditions under which bonded pre-commitment operates, not by a moral or political choice. It moves as clauses are written for obligations not yet priceable in practice. Its structural limits do not move: non-consent at the moment of harm, externality on non-parties, and the non-priceability of certain violations are categorical. The state&rsquo;s coercive apparatus is bounded rather than made unnecessary. The part of its work that solved the coordination problem of bilateral commerce shrinks; the part that addresses criminal harm, externality, public goods, status, rights, and defense remains.
                </p>
                <PaperRemark title="On contested cases.">
                    Some regimes straddle the boundary. Securities regulation is one: part of it targets intermediaries and shrinks, part prices systemic risk to non-parties and stays, part defines status categories such as qualified investors and stays. Sorting a given regime&rsquo;s functions is an empirical exercise. The structural claim is narrower: the boundary is real, and a contested case falls on one side or the other on structural grounds, not political ones.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. The Democratic-Republican Apparatus: Narrowed, Not Reformed">
                <PaperRun title="Subtraction, not reform.">
                    Constitutional democracies exercise power through four levers: legislation, executive enforcement, adjudication, and the franchise. Each has its characteristic abuse. Regulatory capture is analyzed by Stigler (1971). The executive&rsquo;s limit case is the decision on the exception that Schmitt ([1922] 1985) placed at the core of sovereignty. Adjudication drifts, the franchise is manipulated, and organized groups lobby across all four (Olson 1965).
                </PaperRun>
                <p>
                    The bonded mechanism corrects none of these. Capture continues wherever regulation does, and judicial drift wherever courts adjudicate. What changes is the domain: where bilateral obligations enforce themselves, legislators likely have fewer rules to write, courts fewer cases to hear, and the executive less to enforce. The work of constraining the levers continues, over a smaller domain.
                </p>
                <PaperRun title="Freedom as non-domination.">
                    Pettit (1997) reads liberty as the absence of a <em>capacity</em> for arbitrary interference, not merely of interference in fact, and the test is sharper here than Nozick&rsquo;s. No third party holds such a capacity: not a manager, a foundation, or a court, which may rule on the process&rsquo;s data but cannot reach a bond (Section 2). The buyer does hold one: it can withhold resolution indefinitely, and a buyer willing to lose <Math>{"P"}</Math> can keep a performing seller at <Math>{"-2G"}</Math> rather than <Math>{"+P"}</Math>. That capacity is not arbitrary in Pettit&rsquo;s sense, for the three reasons of Section 3: the seller signed the terms that grant it, it ranges over one binary decision that changes no amount, and it is used only at the price of the buyer&rsquo;s own locked bond.
                </PaperRun>
                <p>
                    No seller can resolve. A seller does hold one capacity, to hold out and so keep its co-sellers&rsquo; bonds locked, but it holds it on terms each co-seller accepted when it committed into the process, and uses it only at the price of its own bond: by comparison (b), a holdout ends at most at <Math>{"-G"}</Math> against <Math>{"+P"}</Math> for performing. This is the same structure as the buyer&rsquo;s. What the architecture removes is every unbonded position from which interference could be exercised; the capacities it leaves are held by bonded parties, each bound by its own bond.
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
                    The challenge therefore lands, at a different level than Schmitt intended. The mechanism cannot decide its own exceptions, which is why the exception stays with outside forums and why our claim covers bilateral commerce in normal application. A forum&rsquo;s ruling reaches the parties through their own law (Section 2). The mechanism has no authority to extend itself and none to retract itself, and that is what makes its coexistence with conventional sovereignty architectural rather than negotiated.
                </p>
            </PaperSection>

            <PaperSection title="9. Conclusion">
                <p>
                    Coercion has been load-bearing in the tradition&rsquo;s account of commercial enforcement because every architecture available to commerce bundled the forcing of performance with an authority that held the bond. Bonds locked at consent, under a resolution only the buyer can make and only against its own bond, unbundle the two in priceable, bilateral, voluntary commerce. There the question of legitimate coercion is vacated rather than answered, and elsewhere it keeps its full force over a smaller domain. The mechanism itself takes no political position: the positions live in the clauses, agreements, and assemblies that designers compose over it and that buyers select. The tradition is not refuted; the place where its central question must be answered has moved.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

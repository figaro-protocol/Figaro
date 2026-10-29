import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Disclosure Asymmetry — Figaro Protocol",
    description:
        "Mechanism design and the engineering of consent are one instrument, and the participant's accuracy about the mechanism sets the sign of its effect. Consent-engineering reaches its outcome only while the ruled cannot model the rules; a cryptoeconomic mechanism with public, binding rules reaches its equilibrium as the ruled come to model the rules, and in full when they model them exactly. Disclosure moves the variable; commitment and neutral objectives hold the sign. A reply to Viljoen, Goldenfein, and McGuigan.",
});

export default function DisclosureAsymmetryPaper() {
    return (
        <PaperLayout slug="the-disclosure-asymmetry"
            title="The Disclosure Asymmetry"
            subtitle="Cryptoeconomic Mechanism Design and the Engineering of Consent"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        In 1947 Edward Bernays named a practice: the <em>engineering of consent</em>, the cultivation of a public disposition by managing what the public sees. Mechanism design, the theory recognized in the 2007 Nobel memorial prize to Hurwicz, Maskin, and Myerson, chooses rules so that self-interested agents reach a chosen equilibrium. We argue that the two are one instrument, and that one variable sets the sign of its effect: the participant&rsquo;s accuracy about the mechanism in force. Consent-engineering reaches its outcome only while that accuracy is low. A cryptoeconomic mechanism whose rules are public and executed deterministically reaches its equilibrium as the accuracy rises, and in full when it is maximal. Disclosure is the operation that moves the variable, and the same act destroys the first regime and completes the second.
                    </p>
                    <p>
                        We argue against Viljoen, Goldenfein, and McGuigan (2021), who read mechanism design as the means by which platforms &ldquo;opaquely generate and exploit information asymmetries&rdquo; (5), a tool of &ldquo;information domination&rdquo; (1). We grant their diagnosis of platforms and show that it holds accuracy fixed at the value that makes it true. Disclosure alone does not hold the sign: a commitment condition and an objective condition must also be met. Figaro, a protocol for bonded commitments between strangers, is our worked instance of all three. Its rules are public, its arithmetic is fixed at deployment, and its substantive terms are chosen above it, in designs any wallet may publish and the parties select.
                    </p>
                </>
            }
            references={
                <>
                    <li>Beetham, David. 1991. <em>The Legitimation of Power</em>. Basingstoke: Macmillan.</li>
                    <li>Bernays, Edward L. 1928. <em>Propaganda</em>. New York: Horace Liveright.</li>
                    <li>Bernays, Edward L. 1947. &ldquo;The Engineering of Consent.&rdquo; <em>Annals of the American Academy of Political and Social Science</em> 250 (1): 113&ndash;120. https://doi.org/10.1177/000271624725000116.</li>
                    <li>Buterin, Vitalik. 2020. &ldquo;Trust Models.&rdquo; <em>Vitalik Buterin&rsquo;s Website</em> (blog), August 20, 2020. https://vitalik.eth.limo/general/2020/08/20/trust.html. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik. 2021. &ldquo;The Most Important Scarce Resource Is Legitimacy.&rdquo; <em>Vitalik Buterin&rsquo;s Website</em> (blog), March 23, 2021. https://vitalik.eth.limo/general/2021/03/23/legitimacy.html. Accessed October 20, 2026.</li>
                    <li>De Filippi, Primavera, Morshed Mannan, and Wessel Reijers. 2020. &ldquo;Blockchain as a Confidence Machine: The Problem of Trust &amp; Challenges of Governance.&rdquo; <em>Technology in Society</em> 62: 101284. https://doi.org/10.1016/j.techsoc.2020.101284.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Gambetta, Diego, ed. 1988. <em>Trust: Making and Breaking Cooperative Relations</em>. Oxford: Basil Blackwell.</li>
                    <li>Habermas, J&uuml;rgen. 1975. <em>Legitimation Crisis</em>. Translated by Thomas McCarthy. Boston: Beacon Press.</li>
                    <li>Hardin, Russell. 2002. <em>Trust and Trustworthiness</em>. New York: Russell Sage Foundation.</li>
                    <li>Herman, Edward S., and Noam Chomsky. 1988. <em>Manufacturing Consent: The Political Economy of the Mass Media</em>. New York: Pantheon Books.</li>
                    <li>Hurwicz, Leonid. 2008. &ldquo;But Who Will Guard the Guardians?&rdquo; <em>American Economic Review</em> 98 (3): 577&ndash;585. https://doi.org/10.1257/aer.98.3.577.</li>
                    <li>Lessig, Lawrence. 2006. <em>Code: Version 2.0</em>. New York: Basic Books.</li>
                    <li>Lippmann, Walter. 1922. <em>Public Opinion</em>. New York: Harcourt, Brace.</li>
                    <li>Maskin, Eric S. 2008. &ldquo;Mechanism Design: How to Implement Social Goals.&rdquo; <em>American Economic Review</em> 98 (3): 567&ndash;576. https://doi.org/10.1257/aer.98.3.567.</li>
                    <li>Myerson, Roger B. 1979. &ldquo;Incentive Compatibility and the Bargaining Problem.&rdquo; <em>Econometrica</em> 47 (1): 61&ndash;73. https://doi.org/10.2307/1912346.</li>
                    <li>Viljoen, Salom&eacute;, Jake Goldenfein, and Lee McGuigan. 2021. &ldquo;Design Choices: Mechanism Design and Platform Capitalism.&rdquo; <em>Big Data &amp; Society</em> 8 (2): 20539517211034312. https://doi.org/10.1177/20539517211034312.</li>
                    <li>Weber, Max. (1922) 1978. <em>Economy and Society: An Outline of Interpretive Sociology</em>. Edited by Guenther Roth and Claus Wittich. Berkeley: University of California Press.</li>
                    <li>Werbach, Kevin. 2018. <em>The Blockchain and the New Architecture of Trust</em>. Cambridge, MA: MIT Press.</li>
                    <li>Zuboff, Shoshana. 2019. <em>The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power</em>. New York: PublicAffairs.</li>
                </>
            }
        >
            <PaperSection title="1. Premises">
                <p>
                    Weber grounded the stability of an authority in the belief of the ruled that it is rightful, and not in its coercive capacity alone. We take that claim and three others from established literatures as premises. They are cited, not argued.
                </p>
                <PaperRun title="Legitimacy rests on the disposition of the ruled.">
                    Weber&rsquo;s typology of legitimate domination (Weber [1922] 1978) places authority on a belief held by those it governs. Beetham (1991) sharpens the point against a naive reading: a power relationship is &ldquo;not legitimate because people believe in its legitimacy, but because it can be justified in terms of their beliefs.&rdquo; Legitimacy is then a relation between rules and the shared normative beliefs they can be referred to, not a poll of opinion. Habermas (1975) traces the crisis that follows when the relation fails. The common structure is that authority operates on a disposition, and a disposition can be cultivated.
                </PaperRun>
                <PaperRun title="That disposition can be manufactured.">
                    Lippmann (1922, 15) argued that the public acts not on the world but on a &ldquo;pseudo-environment&rdquo;: a mediated picture in the head, which can be managed. Bernays (1928, 1947) turned the observation into a practice, conducted so that the managed experience their cultivated disposition as their own. Herman and Chomsky (1988) supplied the structural critique: the institutions of mass communication systematically produce consent compatible with concentrated power. The thread we carry forward is narrow. Consent-engineering works <em>on a target who does not perceive it as engineering</em>, and its efficacy is bound to the target&rsquo;s misperception of the mechanism.
                </PaperRun>
                <PaperRun title="The manufacture is now an industry.">
                    Zuboff (2019) carries the lineage into the digital present and gives it an economics. She defines surveillance capitalism as &ldquo;a new economic order that claims human experience as free raw material for hidden commercial practices of extraction, prediction, and sales.&rdquo; The data taken beyond what any service requires, her <em>behavioral surplus</em>, is refined into prediction products. Its last move turns from predicting behavior to shaping it, a power she names <em>instrumentarian</em>: it demands no belief and instruments behavior toward ends the behaving party did not choose. Her account adds that the dependence on the target&rsquo;s inaccuracy is constitutive, not incidental. The practices are hidden by her own definition.
                </PaperRun>
                <PaperRun title="Cryptoeconomic systems relocate trust rather than abolish it.">
                    Werbach (2018) frames the blockchain as one architecture of trust replacing another, each with its own institutional preconditions. De Filippi, Mannan, and Reijers (2020) describe a &ldquo;confidence machine&rdquo;: confidence shifted from people and institutions to code and mathematics, not dissolved. Buterin (2020) classifies such systems by how many of their participants must behave honestly for the system to work, and Buterin (2021) argues that legitimacy is the scarcest resource they manage. An older sociology treats trust as a practical device for cooperation under uncertainty rather than a sentiment (Gambetta 1988). On Hardin&rsquo;s (2002) account it is <em>encapsulated interest</em>: a party is trusted when it has reason to act in the truster&rsquo;s interest. The question is never whether a coordination system rests on trust, but <em>where</em> the trust is placed and <em>on what</em> it is warranted.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Mechanism Design as an Instrument of Consent">
                <p>
                    Mechanism design is the formal discipline of these premises. Given self-interested agents with private preferences, the <em>principal</em> (the field&rsquo;s word for the party that chooses the mechanism) designs a game form: the actions available, the information disclosed, and the mapping from actions to outcomes. The form is chosen so that its equilibrium realizes the principal&rsquo;s objective. The field&rsquo;s founding apparatus shares one standing assumption with all of equilibrium analysis: <em>the players know the mechanism</em>. Hurwicz (2008) poses the implementation problem and the regress of its enforcement; Maskin (2008) treats the implementation of social goals. Myerson (1979) states the revelation principle: any outcome some mechanism implements, a direct mechanism implements with agents who report truthfully. That principle, and incentive compatibility with it, are defined relative to agents who model the game form and best-respond to it.
                </p>
                <PaperRun title="The antagonist, at full strength.">
                    Viljoen, Goldenfein, and McGuigan (2021) read mechanism design as the operating logic of platform capitalism, and they are right about the object they describe. Platforms, on their account, use the toolkit to &ldquo;opaquely generate and exploit information asymmetries&rdquo; (5). They build choice architectures that steer participants toward outcomes the platform prefers, while the participant lacks the information to see the steering. They name the condition <em>information domination</em>. The principal holds private knowledge of the game form and a privileged position within it; the participant plays by rules it does not fully see and cannot alter. We concede the diagnosis for the setting it addresses. The disagreement is whether it is a property of mechanism design as such, or of the value the design takes on one variable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Inversion: Disclosure">
                <p>
                    The variable is the participant&rsquo;s epistemic accuracy about the mechanism. Let <Math>{"m"}</Math> be the mechanism in force, <Math>{"\\hat{m}"}</Math> the participant&rsquo;s model of it, and accuracy <Math>{"a"}</Math> the closeness of <Math>{"\\hat{m}"}</Math> to <Math>{"m"}</Math>, maximal when <Math>{"\\hat{m} = m"}</Math>. Write <Math>{"E"}</Math> for the degree to which the mechanism&rsquo;s stated equilibrium obtains, a property of the game form and not of the principal&rsquo;s further intention. The two regimes share their instruments and differ in the sign of the dependence of <Math>{"E"}</Math> on <Math>{"a"}</Math>:
                </p>
                <PaperScroll className="my-4">
                    <Math display>{"\\frac{\\partial E}{\\partial a} < 0 \\quad \\text{(consent-engineering)} \\qquad\\qquad \\frac{\\partial E}{\\partial a} > 0 \\quad \\text{(cryptoeconomic mechanism design)}"}</Math>
                </PaperScroll>
                <PaperRun title="Proposition 1 (the disclosure asymmetry).">
                    Where a mechanism&rsquo;s outcome is an act the participant takes on a model of the mechanism that the principal has made inaccurate, <Math>{"E"}</Math> falls as <Math>{"a"}</Math> rises. Where the rules are public and the outcome is an equilibrium the participant computes from them, <Math>{"E"}</Math> rises with <Math>{"a"}</Math> and obtains in full when <Math>{"a"}</Math> is maximal. Disclosure, the operation that raises <Math>{"a"}</Math>, therefore destroys the first mechanism and completes the second.
                </PaperRun>
                <p>
                    The proposition rests on four premises, two cited and two stipulated.
                </p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>The derivative is shorthand (stipulated).</strong> The sign of <Math>{"\\partial E / \\partial a"}</Math> names the direction in which <Math>{"E"}</Math> moves as <Math>{"\\hat{m}"}</Math> approaches <Math>{"m"}</Math>. It asserts no smooth functional dependence and no magnitude.</li>
                    <li><strong>Agents best-respond to the mechanism they model (Myerson 1979; Maskin 2008).</strong> An equilibrium is a profile of best responses to the game form, and incentive compatibility is defined relative to agents who model the form. An agent acts on <Math>{"\\hat{m}"}</Math>, so as <Math>{"\\hat{m}"}</Math> approaches <Math>{"m"}</Math> its act approaches its best response to <Math>{"m"}</Math>.</li>
                    <li><strong>Consent-engineering&rsquo;s outcome is an installed misperception (Lippmann 1922; Bernays 1947; Zuboff 2019; Viljoen, Goldenfein, and McGuigan 2021).</strong> Its intended outcome is an act the principal prefers and the target would not choose as a best response to <Math>{"m"}</Math>, taken because the target acts on a model whose gap the principal installed and keeps hidden.</li>
                    <li><strong>The positive regime&rsquo;s outcome is its equilibrium, and entry follows warrant (stipulated, after Hardin 2002).</strong> The stated outcome is a profile of best responses to <Math>{"m"}</Math>. A participant enters when it has reason to expect the other party to act in its interest, and here that reason is the computation that the profile is an equilibrium.</li>
                </ol>
                <PaperRun title="Step 1, re-optimization (premises 2 and 3).">
                    Consent-engineering, and platform mechanism design as Viljoen, Goldenfein, and McGuigan describe it, realizes its intended outcome <em>only when accuracy is low and the gap favors the principal</em>. The target acts on an installed disposition believing it endogenous; the platform participant takes the steered option believing it freely chosen. Raise accuracy and the outcome dissolves: by premise 2 the act moves toward the best response to <Math>{"m"}</Math>, which by premise 3 is not the steered act. A target who sees persuasion as persuasion forms no disposition, and a participant who sees the choice architecture re-optimizes against it. The mechanism is <em>common-knowledge-fragile</em> (common knowledge: each player knows the rules, knows that the others know them, and so on without end). It works by covertly violating the assumption the theory takes for granted.
                </PaperRun>
                <PaperRun title="Step 2, computation (premises 2 and 4).">
                    Cryptoeconomic mechanism design realizes its stated equilibrium, warranted confidence and the cooperation that follows from it, <em>as accuracy rises, and in full only when it is maximal</em>. The participant who models the rules correctly computes that the cooperative profile is an equilibrium and acts on that computation, which by premise 2 is its best response to <Math>{"m"}</Math>. The participant who cannot model them forms no warranted confidence and, by premise 4, likely declines to enter. Lower accuracy here delivers no outcome to the principal; its likely product is non-participation. The mechanism is <em>common-knowledge-robust</em>: it requires that the players know the mechanism they are in, and arranges the world so that they can.
                </PaperRun>
                <PaperRun title="Step 3, disclosure (steps 1 and 2).">
                    Disclosure is the operation that moves <Math>{"a"}</Math> toward its maximum. Where <Math>{"\\partial E / \\partial a < 0"}</Math>, disclosure is corrosive by step 1, and the principal must prevent it. Where <Math>{"\\partial E / \\partial a > 0"}</Math>, disclosure is constitutive by step 2, and the principal must guarantee it.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    The same act, making the rules common knowledge, destroys one mechanism and completes the other: this is the disclosure asymmetry. A mechanism is predatory when its efficacy depends on the participant&rsquo;s ignorance of it, and trust-constructing when its efficacy depends on the participant&rsquo;s knowledge of it.
                </PaperRun>
                <PaperRun title="What would refute it?">
                    Either of two observations would. The first is a consent-engineering practice whose outcome survives the target&rsquo;s exact model of it: a target who sees the persuasion as persuasion and still takes the steered act, though it is not its best response to <Math>{"m"}</Math>. That refutes premise 3. The second is a public mechanism whose stated equilibrium obtains more often among participants who misread its rules than among those who read them exactly. That refutes premise 2 or premise 4.
                </PaperRun>
                <PaperRemark title="Scope: two conditions disclosure does not by itself secure.">
                    The proposition establishes a direction for agents who best-respond to the mechanism they model; it assumes nothing about the size of the effect or the principal&rsquo;s further intention. Disclosure sets the sign but does not alone hold it. A published mechanism can still be subverted if the principal keeps discretion to deviate at execution: the rules are known but do not bind their maker. It can also be subverted if the rules, though disclosed, were chosen to encode the principal&rsquo;s substantive ends: knowing the rules does not make them yours. The first is a <em>commitment</em> condition, the second an <em>objective</em> condition. Section&nbsp;5 shows the cryptoeconomic setting meets the first by determinism, and the second by placing substantive objectives above the mechanism.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Figaro as the Worked Instance">
                <p>
                    Figaro is a protocol for bonded commitments between strangers, and its construction is austere enough that the disclosure property can be read off it. Its <em>mechanism</em> has two operations, commit and the buyer&rsquo;s resolution, run by on-chain contracts that hold every bond and execute resolution. A <em>process</em> is one buyer&rsquo;s transaction: a chain of <em>orders</em>, each a commitment between that buyer and one seller who adds value, resolved together. The two operations carry two mechanisms: asymmetric bonding at commit, and buyer dominance with atomic resolution.
                </p>
                <PaperRun title="The mechanism.">
                    At commit each party bonds its own promise, so that keeping it is that party&rsquo;s best response while the others keep theirs, and the other can count on it before the trade. The buyer bonds twice the payment <Math>{"P"}</Math>, each seller twice the cumulative value <Math>{"G"}</Math> through its order: every payment the process has accumulated so far, its own included, so <Math>{"G \\ge P"}</Math>. So the deeper the link, the more of the process&rsquo;s value rides on its performance, the most a holdout there could keep. Both amounts are fixed by the parties&rsquo; signatures over the commitment, never by a report taken afterward. The doubling answers retention: value passes off-chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). Only the buyer can resolve, and resolution is atomic: in one call every payment transfers and every bond is refunded, the buyer&rsquo;s less the payments it carried, or nothing happens. The buyer&rsquo;s resolving call is its acceptance, and the only judgment of performance the chain receives.
                </PaperRun>
                <PaperRun title="The equilibrium, computed from the published rules.">
                    From the state in which both bonds are locked, the seller performs or holds out, and the buyer resolves or withholds. Withholding is not terminal and no clock runs, so each comparison is between doing and never doing. Each party is credited for what it holds at the value the parties signed, so the seller&rsquo;s entries are bounds: it retains at most <Math>{"G"}</Math>. The outcomes, written <Math>{"(u_b, u_s)"}</Math> for the buyer&rsquo;s and the seller&rsquo;s payoffs, are:
                </PaperRun>
                <PaperScroll className="my-4">
                    <Math display>{"\\begin{array}{l|cc} & \\text{resolution} & \\text{no resolution} \\\\ \\hline \\text{performance} & (0,\\; +P) & (-P,\\; -2G) \\\\ \\text{no performance} & (-P,\\; \\le P+G) & (-2P,\\; \\le -G) \\end{array}"}</Math>
                </PaperScroll>
                <p>
                    Three comparisons carry the result. <strong>(a)</strong> After performance the buyer strictly prefers resolving, <Math>{"0"}</Math>, to never resolving, <Math>{"-P"}</Math>, with no assumption about the seller: this is the one unconditional anchor. <strong>(b)</strong> Given (a) and the buyer&rsquo;s plan to resolve once performance has occurred and not before, the seller strictly prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>, by a margin of <Math>{"P + G \\ge 2P"}</Math>. <strong>(c)</strong> Given (b), before performance the buyer keeps the process open rather than resolving at once, which ends at <Math>{"-P"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best-response checks against one profile, verified jointly: a fixed point, which is what an equilibrium is. It is not a dominance result, because the seller&rsquo;s comparison holds only given the buyer&rsquo;s plan. With several sellers, each seller&rsquo;s comparison holds given the buyer&rsquo;s plan and its co-sellers&rsquo; performance; the comparisons are proved for any number of orders the network resolves in one call in Figaro (2026).
                </p>
                <PaperRun title="Does the seller not need to model the buyer?">
                    It does, and what it models is the point. The seller needs the buyer&rsquo;s payoff comparison (a), and the published rules and the signed amounts fix that comparison exactly. Neither party reasons about what the other believes, and neither needs a distribution over the other&rsquo;s type: each needs only the other&rsquo;s payoffs, and the rules publish them. A dispute about performance is decided between the parties while the process stands open, and a failing seller makes good before the buyer resolves. Outside forums may rule on the process&rsquo;s data; none can call resolution, which is terminal.
                </PaperRun>
                <PaperRun title="Why a lost key strands the bonds.">
                    No path refunds a bond without the buyer&rsquo;s resolution, so a buyer that loses its key strands every bond in its process. The reason is the equilibrium. A path that refunded the bonds without the buyer&rsquo;s resolution would let a seller who never performs recover its bond: holding out would yield what the seller retains, at most <Math>{"G"}</Math>, against <Math>{"P"}</Math> for performing, and would beat performing whenever that retention exceeded <Math>{"P"}</Math>.
                </PaperRun>
                <PaperRun title="Why it is the participant&rsquo;s model that does the work.">
                    The security of the arrangement is a fact about the mechanism that the parties can verify. The code that runs the mechanism is public and its execution deterministic, so the rules a participant models are the rules in force, and accuracy can reach its maximum. The confidence a participant has is then <em>warranted</em> in the strict sense: it rests on a computation anyone can reproduce, not on deference to an authority&rsquo;s claim. A participant who declines to model the mechanism gains nothing from concealment, because there is none. It forgoes the warrant and, by premise 4, likely the transaction. This is <Math>{"\\partial E / \\partial a > 0"}</Math> made concrete: the mechanism delivers its outcome to the participant who knows it.
                </PaperRun>
                <PaperRemark title="On scope.">
                    The worked instance is a resolution primitive, not a general theory of coordination. A process carries as many orders as the network can resolve in one call, a bound set by the chain&rsquo;s limit on one transaction&rsquo;s gas and not by the mechanism; coordination past that bound composes several processes. The claim here needs none of that scale. It needs a mechanism that is disclosed, deterministic, decentralized, and permissionless, which a single order between one buyer and one seller already is.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Answering Viljoen, Goldenfein, and McGuigan">
                <p>
                    We need their diagnosis to be wrong nowhere. We need only to locate the variable it holds fixed and show that the cryptoeconomic setting moves it. The diagnosis turns on <em>opacity</em>, their word, and opacity is low accuracy with the gap held in the principal&rsquo;s favor. Negate it and the sign flips, in three steps of increasing depth.
                </p>
                <PaperRun title="Disclosure.">
                    Platform mechanisms are opaque by construction: the choice architecture is private, and the information asymmetry is the operating resource. The mechanism&rsquo;s rules are common knowledge. The asymmetry that powers information domination is therefore eliminated as a resource, because there is no private knowledge of the mechanism for a principal to hold.
                </PaperRun>
                <PaperRun title="Determinism, against the commitment objection.">
                    A referee grants disclosure and asks: can a platform not publish its rules and still rule, by keeping the discretion to change or override them afterward? This is the strongest version of the critique, and disclosure alone does not answer it. The cryptoeconomic setting answers with an inability rather than a promise. The chain accepts exactly one judgment after commit, the buyer&rsquo;s resolution, with the commitment both parties signed before it, and the code that runs the mechanism is fixed at deployment. Its arithmetic is beyond the reach of whoever wrote it: Lessig&rsquo;s (2006) observation that code regulates as law does, taken to its limit. That one judgment belongs to a party inside the game, whose payoffs the rules publish and whose bond prices its use, and never to the mechanism&rsquo;s maker.
                </PaperRun>
                <PaperRun title="Neutrality, against the objective objection.">
                    The deepest form of the critique needs neither opacity nor discretion. Design choices encode their maker&rsquo;s objectives, so is a disclosed, binding mechanism not still the instrument of whoever chose its rules? Here the cryptoeconomic setting makes a move the platform cannot. The mechanism locks the bonds at commit and executes the fixed transfers on the signed amounts at the buyer&rsquo;s resolution, and nothing else. The terms are the parties&rsquo;: the chain holds only their fingerprint, the merkle root of the agreement they signed, and never tests performance against it. What is exchanged, under what jurisdiction, and for what purpose is outside the mechanism. Its unit is any ERC-20 token the mechanism can hold, one per process, and its party any wallet that can sign and fund its bond.
                </PaperRun>
                <PaperRun title="Who chooses the ends, then?">
                    The substantive choices Viljoen, Goldenfein, and McGuigan rightly say a principal&rsquo;s rules encode are made above the mechanism. A <em>designer</em>, the protocol&rsquo;s word for a wallet that publishes a design, writes a <em>clause</em> (one reusable term), composes clauses into an <em>agreement</em> (the terms of one order), or composes agreements into an <em>assembly</em> (a reusable design of a process). A buyer selects an assembly and the sellers bind it. Publishing is open to any wallet on the same terms, and a published design confers no position inside any process that uses it. Does the designer then hold the platform&rsquo;s seat under another name? It does not: a designer is rewarded after the fact in proportion to real use of what it published, so its interest is that parties choose its design, and it has no move inside a process once they have. The mechanism is ideologically agnostic; the politics live in the assemblies.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    Mechanism design and the engineering of consent are one instrument, and what the participant knows sets the sign of its effect. The critique of Viljoen, Goldenfein, and McGuigan is exact for the regime in which the principal holds private knowledge of the rules, discretion over their execution, and the choice of their ends. A regime that discloses the rules, fixes their execution, and leaves their ends to the designs the parties select is the same instrument with its sign reversed. There the participant who models the mechanism in full, the obstacle to consent-engineering, is the source of trust. Trust is relocated, not abolished: it rests on a computation a participant can verify rather than on rules it must be kept from seeing.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}

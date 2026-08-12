import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Disclosure Asymmetry — Figaro Protocol",
    description:
        "Mechanism design is the engineering of consent with the sign flipped, and the operation that flips it is disclosure. Consent-engineering manufactures a disposition by concealing the rules and exploiting the ruled's ignorance of them; cryptoeconomic mechanism design constructs warranted confidence by making the rules common knowledge and deterministically enforced. The two regimes have opposite-signed dependence on the participant's epistemic accuracy. A reply to Viljoen, Goldenfein & McGuigan.",
});

export default function DisclosureAsymmetryPaper() {
    return (
        <PaperLayout slug="the-disclosure-asymmetry"
            title="The Disclosure Asymmetry"
            subtitle="Cryptoeconomic Mechanism Design and the Engineering of Consent"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="mechanism design, engineering of consent, manufacture of consent, disclosure, common knowledge, legitimacy, platform capitalism, surveillance capitalism, trust"
            abstract={
                <>
                    <p>
                        Mechanism design and the engineering of consent deploy the same instruments &mdash; incentives, common knowledge, equilibrium selection. The mid-century craft of consent-engineering (Lippmann, 1922; Bernays, 1928, 1947), its critical analysis (Herman &amp; Chomsky, 1988), and its industrial continuation in the surveillance economy (Zuboff, 2019) describe a technology for manufacturing a disposition in a population. The Nobel-recognised theory of mechanism design (Hurwicz, Maskin, Myerson) describes a technology for selecting an equilibrium among self-interested agents. They are usually treated as unrelated &mdash; one a dark art of persuasion, the other a formal economics. This paper argues they are the same instrument pointed in opposite directions, and isolates the operation that reverses the vector.
                    </p>
                    <p>
                        The operation is <em>disclosure</em>. Consent-engineering manufactures a disposition by concealing the rules and exploiting the ruled&rsquo;s ignorance of them: the target acts on an installed preference believing it endogenous, and the effect survives only so long as the target does not model the mechanism. Cryptoeconomic mechanism design constructs <em>warranted confidence</em> by the opposite route &mdash; the rules are published, deterministically enforced, and common knowledge, so that the participant who models the mechanism in full is the source of trust rather than its victim. The two regimes have opposite-signed dependence on the participant&rsquo;s epistemic accuracy about the mechanism. That sign is the contribution; disclosure is the operation that sets it.
                    </p>
                    <p>
                        We argue this against a named opponent. Viljoen, Goldenfein &amp; McGuigan (2021) occupy the same conceptual seam and reach the contrary conclusion: mechanism design <em>is</em> the predatory instrument by which platforms &ldquo;opaquely generate and exploit information asymmetries&rdquo; for &ldquo;information domination.&rdquo; This paper answers that conclusion directly, not by disputing their diagnosis of platforms but by showing it holds one variable &mdash; the participant&rsquo;s epistemic accuracy about the mechanism &mdash; fixed at the value that makes their conclusion true, and that a cryptoeconomic mechanism which discloses, binds, and empties itself of the designer&rsquo;s objectives moves that variable to the opposite value.
                    </p>
                </>
            }
            references={
                <>
                    <li>Beetham, D. <em>The Legitimation of Power</em>. Macmillan, London, 1991.</li>
                    <li>Bernays, E. L. <em>Propaganda</em>. Horace Liveright, New York, 1928.</li>
                    <li>Bernays, E. L. The Engineering of Consent. <em>The Annals of the American Academy of Political and Social Science</em>, 250(1):113&ndash;120, 1947.</li>
                    <li>Buterin, V. <em>Trust Models</em>. Personal essay, 2020.</li>
                    <li>Buterin, V. <em>The Most Important Scarce Resource is Legitimacy</em>. Personal essay, 2021.</li>
                    <li>De Filippi, P., Mannan, M., &amp; Reijers, W. Blockchain as a Confidence Machine: The Problem of Trust &amp; Challenges of Governance. <em>Technology in Society</em>, 62:101284, 2020.</li>
                    <li>Gambetta, D. (ed.). <em>Trust: Making and Breaking Cooperative Relations</em>. Basil Blackwell, Oxford, 1988.</li>
                    <li>Habermas, J. <em>Legitimation Crisis</em>. Trans. T. McCarthy. Beacon Press, Boston, 1975.</li>
                    <li>Hardin, R. <em>Trust and Trustworthiness</em>. Russell Sage Foundation, New York, 2002.</li>
                    <li>Herman, E. S. &amp; Chomsky, N. <em>Manufacturing Consent: The Political Economy of the Mass Media</em>. Pantheon Books, New York, 1988.</li>
                    <li>Hurwicz, L. But Who Will Guard the Guardians? <em>American Economic Review</em>, 98(3):577&ndash;585, 2008.</li>
                    <li>Lessig, L. <em>Code: Version 2.0</em>. Basic Books, New York, 2006.</li>
                    <li>Lippmann, W. <em>Public Opinion</em>. Harcourt, Brace, New York, 1922.</li>
                    <li>Maskin, E. S. Mechanism Design: How to Implement Social Goals. <em>American Economic Review</em>, 98(3):567&ndash;576, 2008.</li>
                    <li>Myerson, R. B. Incentive Compatibility and the Bargaining Problem. <em>Econometrica</em>, 47(1):61&ndash;73, 1979.</li>
                    <li>Viljoen, S., Goldenfein, J., &amp; McGuigan, L. Design Choices: Mechanism Design and Platform Capitalism. <em>Big Data &amp; Society</em>, 8(2), 2021. DOI: 10.1177/20539517211034312.</li>
                    <li>Weber, M. <em>Economy and Society: An Outline of Interpretive Sociology</em>. Ed. G. Roth &amp; C. Wittich. University of California Press, Berkeley, 1978 (orig. 1922).</li>
                    <li>Werbach, K. <em>The Blockchain and the New Architecture of Trust</em>. MIT Press, Cambridge, MA, 2018.</li>
                    <li>Zuboff, S. <em>The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power</em>. PublicAffairs, New York, 2019.</li>
                </>
            }
        >
            <PaperSection title="1. Premises">
                <p>
                    We compress into premises a set of claims that are well-established and not the contribution of this paper. They are cited, not argued.
                </p>
                <PaperRun title="Legitimacy rests on the disposition of the ruled.">
                    Weber&rsquo;s typology of legitimate domination (Weber, 1922/1978) locates the stability of an authority not in its coercive capacity alone but in the belief of the ruled that the authority is rightful. Beetham (1991) sharpens the point against a naive reading: a power relationship is &ldquo;not legitimate because people believe in its legitimacy, but because it can be justified in terms of their beliefs&rdquo; &mdash; legitimacy is a relation between rules and the shared normative beliefs they can be referred to, not a poll of opinion. Habermas (1975) traces what happens when that relation fails. The common structure: authority operates on a disposition, and the disposition can be cultivated.
                </PaperRun>
                <PaperRun title="That disposition can be manufactured.">
                    Lippmann (1922) argued that the public acts not on the world but on a &ldquo;pseudo-environment&rdquo; &mdash; a mediated picture in the head &mdash; and that the picture can be managed. Bernays (1928, 1947) turned the observation into a practice: the <em>engineering of consent</em>, the deliberate cultivation of a public disposition through the management of the pseudo-environment, conducted so that the managed experience their cultivated disposition as their own. Herman &amp; Chomsky (1988) supplied the structural critique &mdash; that the institutions of mass communication systematically produce consent compatible with concentrated power. The thread we carry forward is narrow: consent-engineering works <em>on a target who does not perceive it as engineering</em>. Its efficacy is bound to the target&rsquo;s misperception of the mechanism.
                </PaperRun>
                <PaperRun title="The manufacture is now an industry.">
                    Zuboff (2019) carries that lineage into the digital present and gives it an economics. Surveillance capitalism, on her account, &ldquo;unilaterally claims human experience as free raw material&rdquo; for translation into behavioural data; the surplus beyond what any service requires &mdash; her <em>behavioural surplus</em> &mdash; is refined into prediction products and sold in <em>behavioural futures markets</em>. The movement that matters here is the last one: the surest way to predict behaviour is to intervene in it, so the apparatus turns to what she calls <em>economies of action</em> &mdash; tuning, herding, and conditioning at population scale, engineered to operate beneath the individual&rsquo;s awareness and around their decision rights. She names the result <em>instrumentarian power</em> and distinguishes it from totalitarian power: it does not demand belief, it instruments behaviour toward ends the behaving party never chose. What her account adds to the premise above is that the dependence on the target&rsquo;s inaccuracy is constitutive rather than incidental, and now capitalised: the populations acted upon are, in her description, largely ignorant of the procedures and are given no meaningful mechanism of consent. Zuboff is careful that this cuts one way only &mdash; because the asymmetries of knowledge and power leave the individual little exit, her remedy is collective and legal rather than a better-informed user. We keep that caution: accuracy is what sets the sign, and commitment and neutral objectives are what hold it.
                </PaperRun>
                <PaperRun title="Cryptoeconomic systems relocate trust rather than abolish it.">
                    A parallel literature holds that distributed-ledger systems do not eliminate trust but move it. Werbach (2018) frames blockchain as substituting one architecture of trust for another, each with its own institutional preconditions. De Filippi, Mannan &amp; Reijers (2020) describe the &ldquo;confidence machine&rdquo;: confidence shifted from people and institutions to code and mathematics, not dissolved. Buterin (2020, 2021) treats trust models and legitimacy as the scarce resources such systems actually manage. We take this as premise, together with the older sociological point that trust is a practical device for cooperation under uncertainty rather than a sentiment (Gambetta, 1988), warranted when the truster can see that the trusted party&rsquo;s incentives run their way (Hardin, 2002): the question is never whether a coordination system rests on trust, but <em>where</em> the trust is placed and <em>on what</em> it is warranted.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Mechanism Design as an Instrument of Consent">
                <p>
                    Mechanism design is the engineering discipline of the premises above. Where consent-engineering is a craft, mechanism design is its formalisation: given a population of self-interested agents with private preferences, design a game form &mdash; the actions available, the information disclosed, the mapping from actions to outcomes &mdash; whose equilibrium realises a chosen objective. The field&rsquo;s founding apparatus (Hurwicz on the implementation problem and the regress of enforcement, 2008; Maskin on implementing social goals, 2008; Myerson on incentive compatibility and the revelation principle, 1979) shares one standing assumption with all of equilibrium analysis: <em>the players know the mechanism.</em> The revelation principle &mdash; that any outcome implementable by some mechanism is implementable by a direct mechanism in which agents report truthfully &mdash; is defined relative to agents who model the game form and best-respond to it. Incentive compatibility is a property a mechanism has <em>with respect to a participant&rsquo;s knowledge of it</em>.
                </p>
                <PaperRun title="The antagonist, at full strength.">
                    Viljoen, Goldenfein &amp; McGuigan (2021) read mechanism design as the operating logic of platform capitalism, and they are not wrong about the object they describe. Platforms, on their account, deploy the mechanism-design toolkit to &ldquo;opaquely generate and exploit information asymmetries,&rdquo; engineering choice architectures that steer participants toward outcomes the platform prefers while the participant lacks the information to see the steering &mdash; a condition they name <em>information domination</em>. The mechanism is a designed game form; the designer holds private knowledge of it and a privileged position within it; the participant plays a game whose rules they do not fully see and cannot alter. This is mechanism design as an instrument of consent in precisely Bernays&rsquo;s sense, now formalised and operationalised at platform scale. We concede the diagnosis for the setting it addresses. The disagreement is not about platforms. It is about whether the diagnosis is a property of mechanism design as such, or of a specific value the design takes on one variable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Inversion: Disclosure">
                <p>
                    The variable is the participant&rsquo;s epistemic accuracy about the mechanism. Let <Math>{"m"}</Math> be the mechanism actually in force, <Math>{"\\hat{m}"}</Math> the participant&rsquo;s model of it, and let accuracy <Math>{"a"}</Math> measure the closeness of <Math>{"\\hat{m}"}</Math> to <Math>{"m"}</Math> (maximal when <Math>{"\\hat{m} = m"}</Math>). Write <Math>{"E"}</Math> for the degree to which the mechanism&rsquo;s stated equilibrium obtains &mdash; a property of the game form, not of any designer&rsquo;s further intention. The two regimes are distinguished not by their instruments &mdash; the instruments are identical &mdash; but by the sign of the dependence of <Math>{"E"}</Math> on <Math>{"a"}</Math> (the derivative is directional shorthand for which way the mechanism&rsquo;s performance moves as the participant&rsquo;s model improves, not a claim of smooth functional dependence):
                </p>
                <div className="my-4 overflow-x-auto">
                    <Math display>{"\\frac{\\partial E}{\\partial a} < 0 \\quad \\text{(consent-engineering)} \\qquad\\qquad \\frac{\\partial E}{\\partial a} > 0 \\quad \\text{(cryptoeconomic mechanism design)}"}</Math>
                </div>
                <PaperRun title="The negative regime.">
                    Consent-engineering &mdash; and platform mechanism design as Viljoen et al. describe it &mdash; realises its intended outcome <em>only when accuracy is low and the gap favours the designer</em>. The target acts on an installed disposition believing it endogenous; the platform participant takes the steered option believing it freely chosen. Raise accuracy &mdash; let the participant model the mechanism as it is &mdash; and the outcome dissolves: a target who sees persuasion as persuasion forms no disposition; a participant who sees the choice architecture as a choice architecture re-optimises against it. The mechanism is <em>common-knowledge-fragile</em>. It works by covertly violating the assumption that mechanism-design theory takes for granted &mdash; it requires that the players precisely <em>not</em> know the mechanism they are in.
                </PaperRun>
                <PaperRun title="The positive regime.">
                    Cryptoeconomic mechanism design realises its stated equilibrium &mdash; warranted confidence, and the cooperation that follows from it &mdash; <em>only when accuracy is maximal</em>. The participant who correctly models the rules computes that the intended equilibrium is the rational profile and acts on that computation; the participant who cannot model the rules forms no warranted confidence and declines to enter. Lower accuracy here does not deliver the outcome to the designer; it produces non-participation. The mechanism is <em>common-knowledge-robust</em>. It works by physically enforcing the assumption mechanism-design theory takes for granted &mdash; it requires that the players precisely <em>do</em> know the mechanism they are in, and arranges the world so they can.
                </PaperRun>
                <PaperRun title="Disclosure as the sign.">
                    Disclosure is the operation that moves <Math>{"a"}</Math> toward its maximum. In the negative regime disclosure is corrosive: it is the thing the designer must prevent, because <Math>{"\\partial E / \\partial a < 0"}</Math>. In the positive regime disclosure is constitutive: it is the thing the designer must guarantee, because <Math>{"\\partial E / \\partial a > 0"}</Math>. The same act &mdash; making the rules common knowledge &mdash; destroys one mechanism and completes the other. This is the disclosure asymmetry, and it is the whole of the claim: mechanism design is not predatory or benign as such; it is predatory when its efficacy depends on the participant&rsquo;s ignorance of it, and trust-constructing when its efficacy depends on the participant&rsquo;s knowledge of it. The sign of <Math>{"\\partial E / \\partial a"}</Math> is the moral content of a mechanism, and disclosure sets the sign.
                </PaperRun>
                <PaperRemark title="Two conditions disclosure does not by itself secure.">
                    Disclosure sets the sign but does not, alone, hold it. A mechanism whose rules are published can still be subverted if the designer retains discretion to deviate at execution (the rules are known but not binding on their author), or if the rules, though disclosed, were selected to encode the designer&rsquo;s substantive ends (knowing the rules does not make them yours). The first is a <em>commitment</em> condition; the second an <em>objective</em> condition. Section&nbsp;5 shows the cryptoeconomic setting discharges both &mdash; the first by determinism and ownerlessness, the second by relocating substantive objectives off the mechanism entirely. Disclosure is the headline; these close the escape routes.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Figaro as the Worked Instance">
                <p>
                    The Figaro settlement primitive is a mechanism in the positive regime, and a useful worked instance because it is austere enough that the disclosure property can be read off its construction rather than asserted of it.
                </p>
                <PaperRun title="The mechanism.">
                    Two parties who need not trust each other exchange value by each locking a bond: the buyer locks twice the payment, the seller locks twice the cumulative value of the process up to and including its own order &mdash; a schedule fixed by the parties&rsquo; own signatures, not by any report taken afterward. Only the buyer can trigger resolution, and resolution is atomic &mdash; every order in a process settles together or none does; the buyer&rsquo;s resolving call is itself the acceptance test, the mechanism holding no test of performance of its own and needing no external monitor to hold. There is no arbitrator, no timeout, no administrator, and no owner; a buyer who loses the resolving key strands the bonds, by design, rather than opening a recovery path that a third party could exploit. Under this construction cooperation is reached by a sequence of two-way comparisons, each certain rather than iterated: at the node reached once performance has occurred, resolving strictly beats withholding for the buyer &mdash; a comparison that needs no assumption whatever about the seller &mdash; and, given that, performing strictly beats holding out for the seller. Neither party is reasoning about what the other believes about a third possibility; each is comparing two certain amounts at its own node, in a fixed order, which is exactly what a participant modelling disclosed rules can compute without needing to model the other party at all. What the construction prices is settlement discipline computed this way; the adjudication of disputed performance is a different question, settled between the parties while the process stands open, with outside forums able to rule on the record but unable to call resolution themselves.
                </PaperRun>
                <PaperRun title="Why it is the participant&rsquo;s model that does the work.">
                    The security of the arrangement is not a fact about the parties; it is a fact about the mechanism that the parties can verify. The kernel&rsquo;s code is public and its execution deterministic, so the rules a participant models are exactly the rules in force &mdash; accuracy can be driven to its maximum, and the dominance computation is available to anyone who performs it. The confidence a participant has is therefore <em>warranted</em> in the strict sense: it is confidence in a computation available to anyone, whose result the community can and does independently reproduce, not deference to an authority&rsquo;s claim. A participant who declines to model the mechanism gains nothing from a designer&rsquo;s concealment, because there is no concealment and no designer in the loop; they simply forgo the warrant and, rationally, the transaction. This is <Math>{"\\partial E / \\partial a > 0"}</Math> made concrete: the mechanism delivers its outcome to the participant who knows it, and only to them.
                </PaperRun>
                <PaperRemark title="On scope.">
                    The worked instance is deliberately thin. Figaro&rsquo;s kernel is a small settlement primitive, not a general theory; a single process is bounded in the number of orders it can atomically resolve, and the unbounded coordination the wider architecture supports comes from composing many processes, not from one. The claim here needs none of that scale &mdash; it needs only that the mechanism be disclosed, deterministic, and ownerless, which the smallest bonded exchange between two parties already is.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Answering Viljoen, Goldenfein & McGuigan">
                <p>
                    Their diagnosis is correct for platforms and survives intact here; we do not need it to be wrong. We need only to locate the variable it holds fixed and show the cryptoeconomic setting moves it. The diagnosis turns on <em>opacity</em> &mdash; their word &mdash; and opacity is low accuracy with the gap held in the designer&rsquo;s favour. Negate it and the sign flips. Three flips, in increasing depth.
                </p>
                <PaperRun title="Disclosure.">
                    The first flip is the subject of this paper. Platform mechanisms are opaque by construction &mdash; the choice architecture is private, the steering invisible, the information asymmetry the operating resource. The kernel&rsquo;s rules are common knowledge and its execution deterministic. The information asymmetry that powers information domination is not reduced but eliminated as a resource: there is no private knowledge of the mechanism for a designer to hold, because the mechanism is the public, verifiable rule itself.
                </PaperRun>
                <PaperRun title="Determinism, against the commitment objection.">
                    A sophisticated reply grants disclosure and presses the commitment condition: a platform can publish its rules and still rule by retaining discretion to change or override them ex post, so that disclosure buys nothing. This is the strongest version of the platform critique that disclosure alone does not answer. The cryptoeconomic setting answers it not with a promise but with an inability: the rule is enforced by the architecture itself &mdash; Lessig&rsquo;s (2006) observation that code regulates as law does, taken to its limit &mdash; through deterministic execution its author cannot deviate from, and the kernel exposes no administrator, no pause, no upgrade, no override. The designer is bound by the same rules as everyone else because the rules are not the designer&rsquo;s to suspend. Commitment is not asserted; it is structural.
                </PaperRun>
                <PaperRun title="Ownerlessness, against the objective objection.">
                    The deepest form of their critique does not depend on opacity or discretion at all: design choices encode the designer&rsquo;s objectives, so even a disclosed, binding mechanism is an instrument of whoever chose its rules &mdash; knowing the rules does not make them yours, and a mechanism is never neutral about the ends it was built to serve. Here the cryptoeconomic setting makes a move the platform cannot. The kernel encodes essentially no substantive objective: it enforces that a bilateral commitment, once made, is settled on its agreed terms, and takes no position on what may be committed &mdash; what is exchanged, in what currency, under what jurisdiction, by what kind of party, for what purpose. The substantive choices that Viljoen et al. rightly say a designer&rsquo;s rules encode are, in this architecture, not in the mechanism at all; they are composed above it by the participants themselves, in the graph of agreements they assemble. The mechanism is ideologically agnostic; the politics live in the graph. There is no privileged designer position to occupy, because the layer at which objectives are chosen is the layer the participants occupy, and the layer the designer built grants no one a position the rules do not grant everyone.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    Mechanism design and the engineering of consent are one instrument, neither predatory nor trust-constructing in itself: it takes the negative sign when it manufactures an outcome by concealing the rules and is corroded by disclosure, the positive sign when it constructs warranted confidence by making the rules common knowledge and binding and is completed by it. The operation that sets the sign is disclosure; the conditions that hold it are determinism and ownerlessness.
                </p>
                <p>
                    The reply to the critique that mechanism design is the instrument of information domination is therefore not a denial. It is a relocation. The critique is exact for the regime in which the designer holds private knowledge of the rules, discretion over their enforcement, and authorship of their ends. A regime that discloses the rules, removes the discretion, and empties the rules of their author&rsquo;s ends is the same instrument with its sign reversed &mdash; and the participant who models it in full, the obstacle to consent-engineering, is the source of trust here. Trust is not abolished; it is relocated to the edges of a deterministic network and made to rest on something a participant can verify rather than something they must be prevented from seeing.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
